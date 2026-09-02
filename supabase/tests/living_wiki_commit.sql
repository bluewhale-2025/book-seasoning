begin;

set local search_path = public, extensions;

select plan(43);

select has_function(
  'private',
  'commit_living_wiki_candidate',
  array[
    'uuid', 'integer', 'text', 'integer', 'bigint', 'text', 'jsonb', 'text',
    'jsonb'
  ],
  'the fenced Living Wiki commit function exists'
);
select has_function(
  'private',
  'living_wiki_checkpoint_preserves',
  array['jsonb', 'jsonb'],
  'the checkpoint preservation validator exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.commit_living_wiki_candidate(uuid,integer,text,integer,bigint,text,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot commit private Wiki state'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_living_wiki_candidate(uuid,integer,text,integer,bigint,text,jsonb,text,jsonb)',
    'EXECUTE'
  ),
  'the worker can use only the commit function boundary'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.living_wiki_versions', 'INSERT'
  ),
  'the worker cannot bypass optimistic commit with a direct insert'
);

select pgmq.purge_queue('ai-session');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  'f1000000-0000-4000-8000-000000000001',
  'wiki-commit-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"Wiki 커밋 방장"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'f2000000-0000-4000-8000-000000000001',
  'Wiki 커밋 책',
  '커밋 작가',
  '양념 출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'f3000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'Living Wiki commit fixture',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'f4000000-0000-4000-8000-000000000001',
  'Wiki 커밋 방',
  'f3000000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  'f1000000-0000-4000-8000-000000000001'
);

insert into public.session_runs (id, room_id)
values (
  'f5000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001'
);

create temporary table first_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:0:0:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  0,
  0,
  'public-evaluator-output.v1',
  null,
  3
);
create temporary table first_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table first_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from first_enqueue),
  (select queue_message_id from first_delivery),
  (select queue_read_count from first_delivery),
  (select lease_expires_at from first_delivery)
);
create temporary table first_commit on commit drop as
select * from private.commit_public_evaluation_candidate(
  (select job_id from first_claim),
  (select attempt_no from first_claim),
  'INCREMENTAL',
  0,
  0,
  'living-wiki.v1',
  '{
    "currentTopic":{"topicId":"fa000000-0000-4000-8000-000000000001","transitionedFromTopicId":null},
    "perspectiveMap":[{"perspectiveId":"fa100000-0000-4000-8000-000000000001"}],
    "issueAndQuestionMap":[{"issueOrQuestionId":"fa200000-0000-4000-8000-000000000001"}],
    "coverage":[{"subjectType":"TOPIC","subjectId":"fa000000-0000-4000-8000-000000000001"}],
    "marker":"v1"
  }'::jsonb,
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":0,
    "targetThroughSeq":0,
    "wikiPatch":{"baseVersion":0,"basedThroughSeq":0}
  }'::jsonb
);

select is(
  (select evaluation_id from first_commit),
  (select id from private.ai_evaluations limit 1),
  'the commit returns the immutable evaluation identity'
);
select is(
  (select commit_status from first_commit),
  'COMMITTED',
  'the first candidate commits'
);
select is(
  (select committed_wiki_version from first_commit),
  1,
  'the first candidate becomes Wiki version one'
);
select is(
  (select wrote_wiki_version from first_commit),
  true,
  'the first evaluation always writes a Wiki version'
);
select is(
  (select count(*) from private.living_wiki_versions),
  1::bigint,
  'the first commit stores one immutable Wiki row'
);
select is(
  (select commit_status from private.ai_evaluations),
  'COMMITTED',
  'Wiki and evaluation commit in the same function'
);
select is(
  (select document ->> 'marker' from private.living_wiki_versions),
  'v1',
  'the canonical candidate is retained'
);

create temporary table first_replay on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from first_claim),
  (select attempt_no from first_claim),
  'INCREMENTAL', 0, 0, 'living-wiki.v1',
  '{
    "currentTopic":{"topicId":"fa000000-0000-4000-8000-000000000001","transitionedFromTopicId":null},
    "perspectiveMap":[{"perspectiveId":"fa100000-0000-4000-8000-000000000001"}],
    "issueAndQuestionMap":[{"issueOrQuestionId":"fa200000-0000-4000-8000-000000000001"}],
    "coverage":[{"subjectType":"TOPIC","subjectId":"fa000000-0000-4000-8000-000000000001"}],
    "marker":"v1"
  }'::jsonb,
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":0,
    "targetThroughSeq":0,
    "wikiPatch":{"baseVersion":0,"basedThroughSeq":0}
  }'::jsonb
);
select is(
  (select commit_status from first_replay),
  'COMMITTED',
  'a lost-response retry returns the original commit outcome'
);
select is(
  (select count(*) from private.living_wiki_versions),
  1::bigint,
  'idempotent replay creates no second Wiki version'
);
select is(
  (select count(*) from private.ai_evaluations),
  1::bigint,
  'idempotent replay creates no second evaluation'
);

do $$
begin
  perform private.complete_ai_job(
    (select job_id from first_claim),
    (select queue_message_id from first_delivery),
    (select attempt_no from first_claim),
    'SUCCEEDED',
    null
  );
end;
$$;

create temporary table second_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:1:2:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  1,
  2,
  'public-evaluator-output.v1',
  null,
  3
);
create temporary table second_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table second_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from second_enqueue),
  (select queue_message_id from second_delivery),
  (select queue_read_count from second_delivery),
  (select lease_expires_at from second_delivery)
);
create temporary table second_commit on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from second_claim),
  (select attempt_no from second_claim),
  'INCREMENTAL', 1, 2, 'living-wiki.v1',
  '{
    "currentTopic":{"topicId":"fa000000-0000-4000-8000-000000000001","transitionedFromTopicId":null},
    "perspectiveMap":[{"perspectiveId":"fa100000-0000-4000-8000-000000000001"}],
    "issueAndQuestionMap":[{"issueOrQuestionId":"fa200000-0000-4000-8000-000000000001"}],
    "coverage":[{"subjectType":"TOPIC","subjectId":"fa000000-0000-4000-8000-000000000001"}],
    "marker":"v2"
  }'::jsonb,
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":1,
    "targetThroughSeq":2,
    "wikiPatch":{"baseVersion":1,"basedThroughSeq":2}
  }'::jsonb
);
select is((select commit_status from second_commit), 'COMMITTED', 'a fresh base commits');
select is((select committed_wiki_version from second_commit), 2, 'the version advances exactly once');
select is((select current_based_through_seq from second_commit), 2::bigint, 'the committed cursor advances');
select is(
  (select base_version from private.living_wiki_versions where version = 2),
  1,
  'a new Wiki version points to its immediate predecessor'
);
select is(
  (select count(*) from private.ai_evaluations),
  2::bigint,
  'the second version has one committed evaluation'
);
do $$
begin
  perform private.complete_ai_job(
    (select job_id from second_claim),
    (select queue_message_id from second_delivery),
    (select attempt_no from second_claim),
    'SUCCEEDED', null
  );
end;
$$;

create temporary table stale_new_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:stale:3:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  1, 3, 'public-evaluator-output.v1', null, 3
);
create temporary table stale_new_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table stale_new_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from stale_new_enqueue),
  (select queue_message_id from stale_new_delivery),
  (select queue_read_count from stale_new_delivery),
  (select lease_expires_at from stale_new_delivery)
);
create temporary table stale_new_commit on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from stale_new_claim),
  (select attempt_no from stale_new_claim),
  'INCREMENTAL', 1, 3, 'living-wiki.v1',
  '{"marker":"must-not-commit"}'::jsonb,
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":1,
    "targetThroughSeq":3,
    "wikiPatch":{"baseVersion":1,"basedThroughSeq":3}
  }'::jsonb
);
select is((select commit_status from stale_new_commit), 'SUPPRESSED_STALE_BASE', 'a stale base is suppressed, not thrown');
select is((select committed_wiki_version from stale_new_commit), null, 'a stale evaluation commits no Wiki pointer');
select is((select current_wiki_version from stale_new_commit), 2, 'stale suppression reports the winning version');
select is((select should_requeue from stale_new_commit), true, 'an uncovered newer cursor recommends re-evaluation');
select is((select count(*) from private.living_wiki_versions), 2::bigint, 'a stale candidate cannot overwrite or append Wiki state');
select is(
  (select validation_code from private.ai_evaluations where job_id = (select job_id from stale_new_claim)),
  'LIVING_WIKI_STALE_BASE',
  'the stale reason is stored without model content in logs'
);
do $$
begin
  perform private.complete_ai_job(
    (select job_id from stale_new_claim),
    (select queue_message_id from stale_new_delivery),
    (select attempt_no from stale_new_claim),
    'SUPPRESSED', 'SUPPRESSED_STALE_BASE'
  );
end;
$$;

create temporary table stale_old_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:stale:1:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  1, 1, 'public-evaluator-output.v1', null, 3
);
create temporary table stale_old_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table stale_old_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from stale_old_enqueue),
  (select queue_message_id from stale_old_delivery),
  (select queue_read_count from stale_old_delivery),
  (select lease_expires_at from stale_old_delivery)
);
create temporary table stale_old_commit on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from stale_old_claim),
  (select attempt_no from stale_old_claim),
  'INCREMENTAL', 1, 1, 'living-wiki.v1', '{}',
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":1,
    "targetThroughSeq":1,
    "wikiPatch":{"baseVersion":1,"basedThroughSeq":1}
  }'::jsonb
);
select is((select should_requeue from stale_old_commit), false, 'an already-covered stale cursor needs no re-evaluation');
do $$
begin
  perform private.complete_ai_job(
    (select job_id from stale_old_claim),
    (select queue_message_id from stale_old_delivery),
    (select attempt_no from stale_old_claim),
    'SUPPRESSED', 'SUPPRESSED_STALE_BASE'
  );
end;
$$;

create temporary table noop_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:noop:2:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  2, 2, 'public-evaluator-output.v1', null, 3
);
create temporary table noop_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table noop_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from noop_enqueue),
  (select queue_message_id from noop_delivery),
  (select queue_read_count from noop_delivery),
  (select lease_expires_at from noop_delivery)
);
create temporary table noop_commit on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from noop_claim),
  (select attempt_no from noop_claim),
  'INCREMENTAL', 2, 2, 'living-wiki.v1',
  (select document from private.living_wiki_versions where version = 2),
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":2,
    "targetThroughSeq":2,
    "wikiPatch":{"baseVersion":2,"basedThroughSeq":2}
  }'::jsonb
);
select is((select commit_status from noop_commit), 'COMMITTED', 'a no-change evaluation still commits');
select is((select wrote_wiki_version from noop_commit), false, 'a no-change same-cursor evaluation does not rewrite Wiki JSON');
select is((select committed_wiki_version from noop_commit), 2, 'the no-change evaluation reuses the current Wiki version');
select is((select count(*) from private.living_wiki_versions), 2::bigint, 'no-op evaluation causes no version churn');
do $$
begin
  perform private.complete_ai_job(
    (select job_id from noop_claim),
    (select queue_message_id from noop_delivery),
    (select attempt_no from noop_claim),
    'SUCCEEDED', null
  );
end;
$$;

create temporary table checkpoint_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:checkpoint:2:4:v1',
  'TOPIC_CHECKPOINT',
  'f5000000-0000-4000-8000-000000000001',
  2, 4, 'public-evaluator-output.v1', null, 3
);
create temporary table checkpoint_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table checkpoint_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from checkpoint_enqueue),
  (select queue_message_id from checkpoint_delivery),
  (select queue_read_count from checkpoint_delivery),
  (select lease_expires_at from checkpoint_delivery)
);
select throws_ok(
  format(
    $sql$
      select * from private.commit_living_wiki_candidate(
        %L::uuid, %s, 'TOPIC_CHECKPOINT', 2, 4, 'living-wiki.v1',
        '{
          "currentTopic":{"topicId":"fb000000-0000-4000-8000-000000000001","transitionedFromTopicId":"fa000000-0000-4000-8000-000000000001"},
          "perspectiveMap":[{"perspectiveId":"fa100000-0000-4000-8000-000000000001"}],
          "issueAndQuestionMap":[{"issueOrQuestionId":"fa200000-0000-4000-8000-000000000001"}],
          "coverage":[]
        }'::jsonb,
        'public-evaluator-output.v1',
        '{
          "schemaVersion":"public-evaluator-output.v1",
          "baseWikiVersion":2,
          "targetThroughSeq":4,
          "wikiPatch":{"baseVersion":2,"basedThroughSeq":4}
        }'::jsonb
      )
    $sql$,
    (select job_id from checkpoint_claim),
    (select attempt_no from checkpoint_claim)
  ),
  '22023',
  'ai_wiki_checkpoint_history_lost',
  'a checkpoint cannot drop prior coverage'
);

create temporary table checkpoint_commit on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from checkpoint_claim),
  (select attempt_no from checkpoint_claim),
  'TOPIC_CHECKPOINT', 2, 4, 'living-wiki.v1',
  '{
    "currentTopic":{"topicId":"fb000000-0000-4000-8000-000000000001","transitionedFromTopicId":"fa000000-0000-4000-8000-000000000001"},
    "perspectiveMap":[{"perspectiveId":"fa100000-0000-4000-8000-000000000001"}],
    "issueAndQuestionMap":[{"issueOrQuestionId":"fa200000-0000-4000-8000-000000000001"}],
    "coverage":[{"subjectType":"TOPIC","subjectId":"fa000000-0000-4000-8000-000000000001"}],
    "marker":"checkpoint"
  }'::jsonb,
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":2,
    "targetThroughSeq":4,
    "wikiPatch":{"baseVersion":2,"basedThroughSeq":4}
  }'::jsonb
);
select is((select commit_status from checkpoint_commit), 'COMMITTED', 'a preserving checkpoint commits');
select is((select wrote_wiki_version from checkpoint_commit), true, 'a checkpoint always creates an explicit version');
select is((select committed_wiki_version from checkpoint_commit), 3, 'the checkpoint becomes the next version');
select is((select kind from private.living_wiki_versions where version = 3), 'TOPIC_CHECKPOINT', 'the semantic checkpoint kind is durable');
select is((select base_version from private.living_wiki_versions where version = 3), 2, 'the checkpoint retains its exact base');
select is(
  (select document #>> '{coverage,0,subjectId}' from private.living_wiki_versions where version = 3),
  'fa000000-0000-4000-8000-000000000001',
  'the previous topic coverage survives the topic pointer transition'
);

create temporary table checkpoint_replay on commit drop as
select * from private.commit_living_wiki_candidate(
  (select job_id from checkpoint_claim),
  (select attempt_no from checkpoint_claim),
  'TOPIC_CHECKPOINT', 2, 4, 'living-wiki.v1',
  (select document from private.living_wiki_versions where version = 3),
  'public-evaluator-output.v1',
  '{
    "schemaVersion":"public-evaluator-output.v1",
    "baseWikiVersion":2,
    "targetThroughSeq":4,
    "wikiPatch":{"baseVersion":2,"basedThroughSeq":4}
  }'::jsonb
);
select is((select commit_status from checkpoint_replay), 'COMMITTED', 'checkpoint retry is idempotent');
select is((select count(*) from private.living_wiki_versions), 3::bigint, 'checkpoint retry creates no duplicate version');
select is((select count(*) from private.ai_evaluations), 6::bigint, 'each logical job has at most one evaluation');
do $$
begin
  perform private.complete_ai_job(
    (select job_id from checkpoint_claim),
    (select queue_message_id from checkpoint_delivery),
    (select attempt_no from checkpoint_claim),
    'SUCCEEDED', null
  );
end;
$$;

create temporary table fenced_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:f5000000-0000-4000-8000-000000000001:wiki:fenced:4:v1',
  'PUBLIC_EVALUATION',
  'f5000000-0000-4000-8000-000000000001',
  3, 4, 'public-evaluator-output.v1', null, 3
);
create temporary table fenced_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table fenced_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from fenced_enqueue),
  (select queue_message_id from fenced_delivery),
  (select queue_read_count from fenced_delivery),
  (select lease_expires_at from fenced_delivery)
);
select throws_ok(
  format(
    $sql$
      select * from private.commit_living_wiki_candidate(
        %L::uuid, 99, 'INCREMENTAL', 3, 4, 'living-wiki.v1', '{}',
        'public-evaluator-output.v1',
        '{
          "schemaVersion":"public-evaluator-output.v1",
          "baseWikiVersion":3,
          "targetThroughSeq":4,
          "wikiPatch":{"baseVersion":3,"basedThroughSeq":4}
        }'::jsonb
      )
    $sql$,
    (select job_id from fenced_claim)
  ),
  '55000',
  'ai_wiki_attempt_stale',
  'a stale worker attempt cannot commit'
);
select throws_ok(
  format(
    $sql$
      insert into private.living_wiki_versions (
        session_id, version, kind, base_version, based_through_seq,
        schema_version, document, source_job_id
      ) values (
        'f5000000-0000-4000-8000-000000000001', 5, 'INCREMENTAL', 3, 4,
        'living-wiki.v1', '{}', %L::uuid
      )
    $sql$,
    (select job_id from fenced_claim)
  ),
  '23514',
  null,
  'a direct version cannot skip its immediate predecessor'
);

select * from finish();
rollback;
