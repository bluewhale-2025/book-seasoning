begin;

set local search_path = public, extensions;

select plan(55);

select ok(
  exists (select 1 from pg_extension where extname = 'pgmq'),
  'pgmq extension is installed'
);
select ok(
  exists (select 1 from pgmq.list_queues() where queue_name = 'ai-session'),
  'latency-sensitive session AI has a dedicated queue'
);
select ok(
  exists (select 1 from pgmq.list_queues() where queue_name = 'ai-record'),
  'record generation has a separate queue'
);
select ok(
  exists (select 1 from pgmq.list_queues() where queue_name = 'book-builder'),
  'Book Context Builder has a separate queue'
);

select has_table('private', 'ai_job_runs', 'AI job run table exists');
select has_table('private', 'ai_job_attempts', 'AI job attempt table exists');
select has_table('private', 'living_wiki_versions', 'Living Wiki version table exists');
select has_table('private', 'ai_evaluations', 'AI evaluation table exists');
select has_table('private', 'ai_policy_actions', 'AI Policy action table exists');
select has_table('private', 'ai_interventions', 'AI intervention table exists');

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid = 'private.ai_job_runs'::regclass
      and constraint_row.contype = 'u'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid)
        = 'UNIQUE (queue_name, queue_message_id)'
  ),
  'AI queue delivery identity is scoped by queue name'
);

select ok(
  exists (
    select 1 from pg_catalog.pg_roles where rolname = 'bookseasoning_ai_worker'
  ),
  'a non-login least-privilege worker role exists'
);
select ok(
  not has_table_privilege('authenticated', 'private.ai_job_runs', 'SELECT'),
  'authenticated clients cannot inspect AI jobs'
);
select ok(
  not has_schema_privilege('authenticated', 'pgmq', 'USAGE'),
  'authenticated clients cannot access PGMQ directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.enqueue_ai_session_job(text,text,uuid,integer,bigint,text,text,integer)',
    'EXECUTE'
  ),
  'authenticated clients cannot enqueue AI work'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.enqueue_ai_session_job(text,text,uuid,integer,bigint,text,text,integer)',
    'EXECUTE'
  ),
  'the worker role can use the narrow enqueue function'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_job_runs', 'SELECT'
  ),
  'the worker role cannot bypass function-level job access'
);

select pgmq.purge_queue('ai-session');

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  'c1000000-0000-4000-8000-000000000001',
  'ai-job-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"AI 작업 방장"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'c2000000-0000-4000-8000-000000000001',
  'AI 작업 기반 책',
  '작업 작가',
  '양념 출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'AI job foundation fixture',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
(
  'c4000000-0000-4000-8000-000000000001',
  'AI 작업 기반 방',
  'c3000000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  'c1000000-0000-4000-8000-000000000001'
),
(
  'c4000000-0000-4000-8000-000000000002',
  'AI 작업 기반 둘째 방',
  'c3000000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  'c1000000-0000-4000-8000-000000000001'
);

insert into public.session_runs (id, room_id)
values
(
  'c5000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001'
),
(
  'c5000000-0000-4000-8000-000000000002',
  'c4000000-0000-4000-8000-000000000002'
);

create temporary table first_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:c5000000-0000-4000-8000-000000000001:evaluation:0:0:v1',
  'PUBLIC_EVALUATION',
  'c5000000-0000-4000-8000-000000000001',
  0,
  0,
  'public-evaluator-output.v1',
  'request-ai-job-test',
  3
);

select is(
  (
    select count(*) from private.ai_job_runs
    where session_id = 'c5000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'enqueue creates one durable job row'
);
select is(
  (select queue_length from pgmq.metrics('ai-session')),
  1::bigint,
  'enqueue creates one queue message in the same transaction'
);

create temporary table first_delivery on commit drop as
select * from private.read_ai_session_queue(30, 2, 1);

select is(
  (
    select count(*)
    from first_delivery
    cross join lateral pg_catalog.jsonb_object_keys(first_delivery.message)
  ),
  7::bigint,
  'queue envelope contains only the seven contract fields'
);
select ok(
  (select private.public_jsonb_keys_allowed(message) from first_delivery),
  'queue envelope contains no private or prompt-shaped key'
);
select is(
  (select message ->> 'jobId' from first_delivery),
  (select job_id::text from first_enqueue),
  'queue envelope points to the durable job identity'
);

create temporary table duplicate_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:c5000000-0000-4000-8000-000000000001:evaluation:0:0:v1',
  'PUBLIC_EVALUATION',
  'c5000000-0000-4000-8000-000000000001',
  0,
  0,
  'public-evaluator-output.v1',
  'request-ai-job-test-retry',
  3
);

select is(
  (select duplicate from duplicate_enqueue),
  true,
  'the same logical job key is an idempotent duplicate'
);
select is(
  (select job_id from duplicate_enqueue),
  (select job_id from first_enqueue),
  'an idempotent retry returns the original job id'
);
select is(
  (select queue_length from pgmq.metrics('ai-session')),
  1::bigint,
  'an idempotent retry does not publish another queue message'
);

create temporary table first_claim on commit drop as
select * from private.claim_ai_job(
  (select (message ->> 'jobId')::uuid from first_delivery),
  (select queue_message_id from first_delivery),
  (select queue_read_count from first_delivery),
  (select lease_expires_at from first_delivery)
);

select is(
  (select claim_state from first_claim),
  'CLAIMED',
  'a visible queue message claims its durable job'
);
select is(
  (
    select status || ':' || attempt_count::text from private.ai_job_runs
    where id = (select job_id from first_claim)
  ),
  'PROCESSING:1',
  'claim starts the first leased attempt'
);
select is(
  (
    select count(*) from private.ai_job_attempts
    where job_id = (select job_id from first_claim)
  ),
  1::bigint,
  'claim records one content-free attempt row'
);
select is(
  private.complete_ai_job(
    (select job_id from first_claim),
    (select queue_message_id from first_delivery),
    0,
    'SUCCEEDED',
    null
  ),
  false,
  'a stale attempt cannot complete a newer lease'
);
select is(
  private.extend_ai_job_lease(
    (select job_id from first_claim),
    (select queue_message_id from first_delivery),
    1,
    60
  ),
  true,
  'the active attempt can extend its visibility lease'
);
select ok(
  (
    select lease_expires_at > timezone('utc', now()) from private.ai_job_runs
    where id = (select job_id from first_claim)
  ),
  'the durable job reflects the extended lease'
);
select is(
  private.retry_ai_job(
    (select job_id from first_claim),
    (select queue_message_id from first_delivery),
    1,
    'PROVIDER_TEMPORARY_FAILURE',
    60
  ),
  true,
  'a retryable failure schedules the same queue message again'
);
select is(
  (select status from private.ai_job_runs where id = (select job_id from first_claim)),
  'RETRY_SCHEDULED',
  'retry remains a non-terminal durable state'
);
select is(
  (
    select outcome from private.ai_job_attempts
    where job_id = (select job_id from first_claim) and attempt_no = 1
  ),
  'RETRYABLE_FAILURE',
  'retry preserves the first attempt outcome'
);
select is(
  (select queue_visible_length from pgmq.metrics('ai-session')),
  0::bigint,
  'backoff hides the queue message until its next attempt'
);

select * from pgmq.set_vt(
  'ai-session',
  (select queue_message_id from first_delivery),
  0
);

create temporary table second_delivery on commit drop as
select * from private.read_ai_session_queue(30, 2, 1);
create temporary table second_claim on commit drop as
select * from private.claim_ai_job(
  (select (message ->> 'jobId')::uuid from second_delivery),
  (select queue_message_id from second_delivery),
  (select queue_read_count from second_delivery),
  (select lease_expires_at from second_delivery)
);

select is(
  (select claim_state from second_claim),
  'CLAIMED',
  'the same message is claimed again after backoff'
);
select is(
  (select attempt_no from second_claim),
  2,
  'redelivery creates the second attempt'
);
select is(
  private.complete_ai_job(
    (select job_id from second_claim),
    (select queue_message_id from second_delivery),
    2,
    'SUCCEEDED',
    null
  ),
  true,
  'the current attempt completes and archives atomically'
);
select is(
  (select status from private.ai_job_runs where id = (select job_id from second_claim)),
  'SUCCEEDED',
  'successful work becomes terminal'
);
select is(
  (
    select outcome from private.ai_job_attempts
    where job_id = (select job_id from second_claim) and attempt_no = 2
  ),
  'SUCCEEDED',
  'the successful attempt is retained for diagnostics'
);
select is(
  (select queue_length from pgmq.metrics('ai-session')),
  0::bigint,
  'successful completion removes the live queue message'
);
select is(
  private.complete_ai_job(
    (select job_id from second_claim),
    (select queue_message_id from second_delivery),
    2,
    'SUCCEEDED',
    null
  ),
  false,
  'repeating terminal completion has no second effect'
);

create temporary table exhausted_enqueue on commit drop as
select * from private.enqueue_ai_session_job(
  'session:c5000000-0000-4000-8000-000000000001:opening:0:v1',
  'OPENING',
  'c5000000-0000-4000-8000-000000000001',
  0,
  0,
  'opening-output.v1',
  null,
  1
);
create temporary table exhausted_delivery on commit drop as
select * from private.read_ai_session_queue(30, 1, 1);
create temporary table exhausted_claim on commit drop as
select * from private.claim_ai_job(
  (select (message ->> 'jobId')::uuid from exhausted_delivery),
  (select queue_message_id from exhausted_delivery),
  (select queue_read_count from exhausted_delivery),
  (select lease_expires_at from exhausted_delivery)
);

select is(
  (select claim_state from exhausted_claim),
  'CLAIMED',
  'a one-attempt job is claimed normally'
);
select is(
  private.retry_ai_job(
    (select job_id from exhausted_claim),
    (select queue_message_id from exhausted_delivery),
    1,
    'PROVIDER_TEMPORARY_FAILURE',
    10
  ),
  true,
  'retry handling terminally archives a job at its attempt limit'
);
select is(
  (select status from private.ai_job_runs where id = (select job_id from exhausted_claim)),
  'FAILED',
  'attempt exhaustion is a durable terminal failure'
);
select is(
  (
    select outcome from private.ai_job_attempts
    where job_id = (select job_id from exhausted_claim) and attempt_no = 1
  ),
  'TERMINAL_FAILURE',
  'attempt exhaustion is classified as terminal, not retryable'
);
select is(
  (select queue_length from pgmq.metrics('ai-session')),
  0::bigint,
  'exhausted jobs leave no live queue message'
);

select lives_ok(
  $$
    insert into private.living_wiki_versions (
      id, session_id, version, kind, base_version, based_through_seq,
      schema_version, document, source_job_id
    ) values (
      'c6000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      1,
      'INCREMENTAL',
      null,
      0,
      'living-wiki.v1',
      '{}'::jsonb,
      (select job_id from first_enqueue)
    )
  $$,
  'the first Wiki version stores an immutable canonical document envelope'
);
select throws_ok(
  $$
    insert into private.living_wiki_versions (
      session_id, version, kind, base_version, based_through_seq,
      schema_version, document, source_job_id
    ) values (
      'c5000000-0000-4000-8000-000000000002',
      1,
      'INCREMENTAL',
      null,
      0,
      'living-wiki.v1',
      '{}'::jsonb,
      (select job_id from exhausted_enqueue)
    )
  $$,
  '23503',
  null,
  'a job cannot write a Wiki version into another session'
);
select throws_ok(
  $$
    insert into private.living_wiki_versions (
      session_id, version, kind, base_version, based_through_seq,
      schema_version, document, source_job_id
    ) values (
      'c5000000-0000-4000-8000-000000000001',
      1,
      'INCREMENTAL',
      1,
      0,
      'living-wiki.v1',
      '{}'::jsonb,
      (select job_id from exhausted_enqueue)
    )
  $$,
  '23514',
  null,
  'the first Wiki version cannot claim a base version'
);
select throws_ok(
  $$
    update private.living_wiki_versions
    set document = '{"rewritten":true}'::jsonb
    where id = 'c6000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'immutable_ai_fact',
  'a committed Living Wiki version cannot be rewritten'
);

select lives_ok(
  $$
    insert into private.ai_evaluations (
      id, job_id, session_id, base_wiki_version, committed_wiki_version,
      target_through_seq, schema_version, canonical_result, commit_status
    ) values (
      'c7000000-0000-4000-8000-000000000001',
      (select job_id from first_enqueue),
      'c5000000-0000-4000-8000-000000000001',
      0,
      1,
      0,
      'public-evaluator-output.v1',
      '{}'::jsonb,
      'COMMITTED'
    )
  $$,
  'a committed evaluation can point to its committed Wiki version'
);
select lives_ok(
  $$
    insert into private.ai_policy_actions (
      id, evaluation_id, session_id, action, reason_codes,
      supporting_evidence_refs, schema_version
    ) values (
      'c8000000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      'WAIT',
      '["GOOD_HUMAN_FLOW"]'::jsonb,
      '[]'::jsonb,
      'policy-decision.v1'
    )
  $$,
  'one deterministic Policy action is stored for an evaluation'
);
select throws_ok(
  $$
    insert into private.ai_policy_actions (
      evaluation_id, session_id, action, reason_codes,
      supporting_evidence_refs, schema_version
    ) values (
      'c7000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      'DEEPEN',
      '["DUPLICATE_ACTION"]'::jsonb,
      '[]'::jsonb,
      'policy-decision.v1'
    )
  $$,
  '23505',
  null,
  'an evaluation cannot produce two Policy actions'
);
select lives_ok(
  $$
    insert into private.ai_interventions (
      policy_action_id, session_id, based_through_seq,
      schema_version, status
    ) values (
      'c8000000-0000-4000-8000-000000000001',
      'c5000000-0000-4000-8000-000000000001',
      0,
      'host-intervention-output.v1',
      'PENDING'
    )
  $$,
  'a Policy action has at most one pending user-visible intervention'
);

select * from finish();

rollback;
