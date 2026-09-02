begin;

set local search_path = public, extensions;

select plan(20);

select has_function(
  'private',
  'commit_policy_decision',
  array['uuid', 'integer', 'text', 'integer', 'jsonb'],
  'the deterministic Policy commit boundary exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.commit_policy_decision(uuid,integer,text,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot commit private Policy decisions'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_policy_decision(uuid,integer,text,integer,jsonb)',
    'EXECUTE'
  ),
  'the worker can use the Policy commit boundary'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_policy_actions', 'INSERT'
  ),
  'the worker cannot bypass deterministic Policy persistence'
);

select pgmq.purge_queue('ai-session');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  'aa100000-0000-4000-8000-000000000001',
  'policy-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"Policy 방장"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'aa200000-0000-4000-8000-000000000001',
  'Policy 테스트 책',
  '정책 작가',
  '양념 출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'aa300000-0000-4000-8000-000000000001',
  'aa200000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'Policy commit fixture',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'aa400000-0000-4000-8000-000000000001',
  'Policy 테스트 방',
  'aa300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  'aa100000-0000-4000-8000-000000000001'
);

insert into public.session_runs (
  id, room_id, phase, phase_version, last_message_seq
) values (
  'aa500000-0000-4000-8000-000000000001',
  'aa400000-0000-4000-8000-000000000001',
  'CORE',
  1,
  0
);

create temporary table first_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:aa500000-0000-4000-8000-000000000001:policy:0:v1',
  'PUBLIC_EVALUATION',
  'aa500000-0000-4000-8000-000000000001',
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

insert into private.living_wiki_versions (
  session_id, version, kind, base_version, based_through_seq,
  schema_version, document, source_job_id
) values (
  'aa500000-0000-4000-8000-000000000001',
  1,
  'INCREMENTAL',
  null,
  0,
  'living-wiki.v1',
  '{}'::jsonb,
  (select job_id from first_claim)
);

insert into private.ai_evaluations (
  id, job_id, session_id, base_wiki_version, committed_wiki_version,
  target_through_seq, schema_version, canonical_result, commit_status
) values (
  'aa600000-0000-4000-8000-000000000001',
  (select job_id from first_claim),
  'aa500000-0000-4000-8000-000000000001',
  0,
  1,
  0,
  'public-evaluator-output.v1',
  '{}'::jsonb,
  'COMMITTED'
);

create temporary table first_policy on commit drop as
select * from private.commit_policy_decision(
  (select job_id from first_claim),
  (select attempt_no from first_claim),
  'CORE',
  1,
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'aa600000-0000-4000-8000-000000000001',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'DEEPEN',
    'reasonCodes', jsonb_build_array('DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED'),
    'supportingEvidenceRefs', '[]'::jsonb
  )
);

select is(
  (select commit_status from first_policy),
  'COMMITTED'::text,
  'a fresh deterministic Policy decision is committed'
);
select ok(
  (select policy_action_id from first_policy) is not null,
  'a committed Policy decision receives an immutable identity'
);
select is(
  (
    select policy.trigger
    from private.ai_policy_actions as policy
    where policy.id = (select policy_action_id from first_policy)
  ),
  'MESSAGE_BATCH'::text,
  'the trigger is preserved for Policy observability'
);
select is(
  (
    select count(*)
    from private.ai_policy_actions as policy
    where policy.evaluation_id = 'aa600000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'one evaluation creates exactly one Policy decision'
);

create temporary table replayed_policy on commit drop as
select * from private.commit_policy_decision(
  (select job_id from first_claim),
  (select attempt_no from first_claim),
  'CORE',
  1,
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'aa600000-0000-4000-8000-000000000001',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'DEEPEN',
    'reasonCodes', jsonb_build_array('DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED'),
    'supportingEvidenceRefs', '[]'::jsonb
  )
);
select ok(
  (select duplicate from replayed_policy),
  'an identical Policy replay returns the existing decision'
);
select throws_ok(
  $$
    update private.ai_policy_actions
    set action = 'WAIT'
    where id = (select policy_action_id from first_policy)
  $$,
  '55000',
  'immutable_ai_fact',
  'a Policy decision cannot be rewritten'
);

create temporary table stale_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:aa500000-0000-4000-8000-000000000001:policy:stale:v1',
  'PUBLIC_EVALUATION',
  'aa500000-0000-4000-8000-000000000001',
  1,
  0,
  'public-evaluator-output.v1',
  null,
  3
);
create temporary table stale_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table stale_claim on commit drop as
select * from private.claim_ai_job(
  (select job_id from stale_enqueue),
  (select queue_message_id from stale_delivery),
  (select queue_read_count from stale_delivery),
  (select lease_expires_at from stale_delivery)
);

insert into private.ai_evaluations (
  id, job_id, session_id, base_wiki_version, committed_wiki_version,
  target_through_seq, schema_version, canonical_result, commit_status
) values (
  'aa600000-0000-4000-8000-000000000002',
  (select job_id from stale_claim),
  'aa500000-0000-4000-8000-000000000001',
  1,
  1,
  0,
  'public-evaluator-output.v1',
  '{}'::jsonb,
  'COMMITTED'
);

update public.session_runs
set last_message_seq = 1
where id = 'aa500000-0000-4000-8000-000000000001';

create temporary table stale_policy on commit drop as
select * from private.commit_policy_decision(
  (select job_id from stale_claim),
  (select attempt_no from stale_claim),
  'CORE',
  1,
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'aa600000-0000-4000-8000-000000000002',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'SILENCE',
    'hostHelpReason', null,
    'action', 'REVIVE',
    'reasonCodes', jsonb_build_array('ACTIVITY_LOW_WITH_EXPLORATION_REMAINING'),
    'supportingEvidenceRefs', '[]'::jsonb
  )
);

select is(
  (select commit_status from stale_policy),
  'SUPPRESSED_STALE'::text,
  'a user-facing action is suppressed after the message cursor advances'
);
select is(
  (select suppression_reason from stale_policy),
  'POLICY_CURSOR_ADVANCED'::text,
  'cursor freshness suppression has a safe reason code'
);
select is(
  (
    select count(*)
    from private.ai_policy_actions as policy
    where policy.evaluation_id = 'aa600000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'a stale intervention goal is not persisted for Host consumption'
);

create temporary table stale_wait on commit drop as
select * from private.commit_policy_decision(
  (select job_id from stale_claim),
  (select attempt_no from stale_claim),
  'CORE',
  1,
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'aa600000-0000-4000-8000-000000000002',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'WAIT',
    'reasonCodes', jsonb_build_array('EVALUATION_CURSOR_STALE'),
    'supportingEvidenceRefs', '[]'::jsonb
  )
);
select is(
  (select commit_status from stale_wait),
  'COMMITTED'::text,
  'WAIT remains safe to retain as a historical no-effect decision'
);
select is(
  (
    select policy.action
    from private.ai_policy_actions as policy
    where policy.evaluation_id = 'aa600000-0000-4000-8000-000000000002'
  ),
  'WAIT'::text,
  'the historical stale evaluation cannot become a user-facing action'
);

insert into private.ai_job_runs (
  id, job_key, queue_name, job_type, session_id, base_wiki_version,
  target_through_seq, task_schema_version, status, attempt_count, max_attempts,
  lease_expires_at, started_at, created_at, updated_at
) values (
  'aa700000-0000-4000-8000-000000000003',
  'session:aa500000-0000-4000-8000-000000000001:policy:phase-stale:v1',
  'ai-session',
  'PUBLIC_EVALUATION',
  'aa500000-0000-4000-8000-000000000001',
  1,
  1,
  'public-evaluator-output.v1',
  'PROCESSING',
  1,
  3,
  timezone('utc', now()) + interval '1 minute',
  timezone('utc', now()),
  timezone('utc', now()) - interval '1 second',
  timezone('utc', now())
);
insert into private.ai_evaluations (
  id, job_id, session_id, base_wiki_version, committed_wiki_version,
  target_through_seq, schema_version, canonical_result, commit_status
) values (
  'aa600000-0000-4000-8000-000000000003',
  'aa700000-0000-4000-8000-000000000003',
  'aa500000-0000-4000-8000-000000000001',
  1,
  1,
  1,
  'public-evaluator-output.v1',
  '{}'::jsonb,
  'COMMITTED'
);
update public.session_runs
set phase = 'EXTENDED', phase_version = 2
where id = 'aa500000-0000-4000-8000-000000000001';

create temporary table phase_stale_policy on commit drop as
select * from private.commit_policy_decision(
  'aa700000-0000-4000-8000-000000000003',
  1,
  'CORE',
  1,
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'aa600000-0000-4000-8000-000000000003',
    'evaluationTargetThroughSeq', 1,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'DEEPEN',
    'reasonCodes', jsonb_build_array('DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED'),
    'supportingEvidenceRefs', '[]'::jsonb
  )
);
select is(
  (select commit_status from phase_stale_policy),
  'SUPPRESSED_STALE'::text,
  'a user-facing action is suppressed after the session phase changes'
);
select is(
  (select suppression_reason from phase_stale_policy),
  'POLICY_PHASE_CHANGED'::text,
  'phase freshness suppression has a safe reason code'
);
select is(
  (
    select count(*)
    from private.ai_policy_actions as policy
    where policy.evaluation_id = 'aa600000-0000-4000-8000-000000000003'
  ),
  0::bigint,
  'a phase-stale intervention goal is not persisted for Host consumption'
);

select throws_ok(
  format(
    $sql$
      select * from private.commit_policy_decision(
        %L::uuid,
        %s,
        'CORE',
        1,
        %L::jsonb
      )
    $sql$,
    (select job_id from first_claim),
    (select attempt_no from first_claim),
    jsonb_build_object(
      'schemaVersion', 'policy-decision.v1',
      'evaluationId', 'aa600000-0000-4000-8000-000000000099',
      'evaluationTargetThroughSeq', 0,
      'wikiVersion', 1,
      'trigger', 'MESSAGE_BATCH',
      'hostHelpReason', null,
      'action', 'WAIT',
      'reasonCodes', jsonb_build_array('MISMATCH'),
      'supportingEvidenceRefs', '[]'::jsonb
    )::text
  ),
  '22023',
  'ai_policy_evaluation_mismatch',
  'a Policy decision cannot attach to another evaluation identity'
);

select throws_ok(
  format(
    $sql$
      select * from private.commit_policy_decision(
        %L::uuid,
        %s,
        'CORE',
        1,
        %L::jsonb
      )
    $sql$,
    (select job_id from first_claim),
    (select attempt_no from first_claim),
    jsonb_build_object(
      'schemaVersion', 'policy-decision.v1',
      'evaluationId', 'aa600000-0000-4000-8000-000000000001',
      'evaluationTargetThroughSeq', 0,
      'wikiVersion', 1,
      'trigger', 'HOST_HELP',
      'hostHelpReason', null,
      'action', 'WAIT',
      'reasonCodes', jsonb_build_array('INVALID_HOST_HELP'),
      'supportingEvidenceRefs', '[]'::jsonb
    )::text
  ),
  '22023',
  'ai_policy_decision_invalid',
  'accepted Host help cannot collapse to WAIT or omit its reason'
);

select * from finish();
rollback;
