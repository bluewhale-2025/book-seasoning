begin;

set local search_path = public, extensions;

select plan(15);

select has_function(
  'private',
  'record_ai_provider_run',
  array[
    'uuid', 'integer', 'text', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'integer', 'jsonb', 'text'
  ],
  'provider diagnostics retain their worker-only write boundary'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.record_ai_provider_run(uuid,integer,text,text,text,text,text,text,text,text,integer,jsonb,text)',
    'EXECUTE'
  ),
  'the worker retains provider diagnostic write access'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  'ea100000-0000-4000-8000-000000000001',
  'provider-aliases@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"Provider Alias 테스트"}'::jsonb
);
insert into public.books (id, title, author, publisher, publication_year)
values (
  'ea200000-0000-4000-8000-000000000001',
  'Provider Alias 테스트 책',
  '테스트 작가',
  '테스트 출판사',
  2026
);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'ea300000-0000-4000-8000-000000000001',
  'ea200000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'provider alias regression fixture',
  timezone('utc', now())
);
insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'ea400000-0000-4000-8000-000000000001',
  'Provider Alias 테스트 방',
  'ea300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$provider-alias-fixture',
  2,
  5,
  'ea100000-0000-4000-8000-000000000001'
);
insert into public.session_runs (id, room_id, phase, phase_version)
values (
  'ea500000-0000-4000-8000-000000000001',
  'ea400000-0000-4000-8000-000000000001',
  'CORE',
  1
);

insert into private.ai_job_runs (
  id, job_key, queue_name, job_type, session_id, base_wiki_version,
  target_through_seq, task_schema_version, status, attempt_count,
  lease_expires_at, started_at
) values
  ('ea600000-0000-4000-8000-000000000001', 'alias:final:failed', 'ai-record', 'FINAL_WIKI', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'public-evaluator-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000002', 'alias:synthesis:failed', 'ai-record', 'SYNTHESIS', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'synthesis-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000003', 'alias:record:failed', 'ai-record', 'DISCUSSION_RECORD', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'discussion-record-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000004', 'alias:final:succeeded', 'ai-record', 'FINAL_WIKI', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'public-evaluator-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000005', 'alias:synthesis:succeeded', 'ai-record', 'SYNTHESIS', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'synthesis-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000006', 'alias:record:succeeded', 'ai-record', 'DISCUSSION_RECORD', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'discussion-record-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now())),
  ('ea600000-0000-4000-8000-000000000007', 'alias:unknown', 'ai-record', 'FINAL_WIKI', 'ea500000-0000-4000-8000-000000000001', 0, 0, 'public-evaluator-output.v1', 'PROCESSING', 1, timezone('utc', now()) + interval '5 minutes', timezone('utc', now()));

insert into private.ai_job_attempts (
  job_id, attempt_no, queue_read_count, lease_expires_at
)
select id, 1, 1, lease_expires_at
from private.ai_job_runs
where id between
  'ea600000-0000-4000-8000-000000000001'::uuid
  and 'ea600000-0000-4000-8000-000000000007'::uuid;

select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000001', 1, 'PUBLIC_EVALUATOR_FINAL_V1', 'public-evaluator.v2', 'public-evaluator-output.v1', 'OPENAI', 'evaluator-model', 'low', 'FAILED', null, 20, null, 'AI_PROVIDER_TIMEOUT')$$,
  'Final Wiki provider failures can be recorded'
);
select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000002', 1, 'SYNTHESIS_V1', 'synthesis.v1', 'synthesis-output.v1', 'OPENAI', 'host-model', 'low', 'FAILED', null, 20, null, 'AI_PROVIDER_TIMEOUT')$$,
  'Synthesis provider failures can be recorded'
);
select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000003', 1, 'DISCUSSION_RECORD_V1', 'discussion-record.v1', 'discussion-record-output.v1', 'OPENAI', 'host-model', 'medium', 'FAILED', null, 20, null, 'AI_PROVIDER_TIMEOUT')$$,
  'discussion record provider failures can be recorded'
);
select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000004', 1, 'PUBLIC_EVALUATOR_FINAL_V1', 'public-evaluator.v2', 'public-evaluator-output.v1', 'OPENAI', 'evaluator-model', 'low', 'SUCCEEDED', 'resp-final', 25, '{"inputTokens":1,"outputTokens":1,"reasoningTokens":0,"totalTokens":2}'::jsonb, null)$$,
  'Final Wiki provider successes can be recorded'
);
select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000005', 1, 'SYNTHESIS_V1', 'synthesis.v1', 'synthesis-output.v1', 'OPENAI', 'host-model', 'low', 'SUCCEEDED', 'resp-synthesis', 25, '{"inputTokens":1,"outputTokens":1,"reasoningTokens":0,"totalTokens":2}'::jsonb, null)$$,
  'Synthesis provider successes can be recorded'
);
select lives_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000006', 1, 'DISCUSSION_RECORD_V1', 'discussion-record.v1', 'discussion-record-output.v1', 'OPENAI', 'host-model', 'medium', 'SUCCEEDED', 'resp-record', 25, '{"inputTokens":1,"outputTokens":1,"reasoningTokens":0,"totalTokens":2}'::jsonb, null)$$,
  'discussion record provider successes can be recorded'
);

select is(
  (select count(*) from private.ai_provider_runs where job_id::text like 'ea600000-%'),
  6::bigint,
  'all six supported terminal-task provider runs are retained'
);
select set_eq(
  $$select distinct task_alias from private.ai_provider_runs where job_id::text like 'ea600000-%'$$,
  $$values ('PUBLIC_EVALUATOR_FINAL_V1'::text), ('SYNTHESIS_V1'::text), ('DISCUSSION_RECORD_V1'::text)$$,
  'provider diagnostics retain every terminal task alias'
);
select is(
  (select count(*) from private.ai_provider_runs where job_id::text like 'ea600000-%' and status = 'FAILED'),
  3::bigint,
  'failure diagnostics remain content-free rows'
);
select is(
  (select count(*) from private.ai_provider_runs where job_id::text like 'ea600000-%' and status = 'SUCCEEDED'),
  3::bigint,
  'success diagnostics retain canonical metadata rows'
);
select ok(
  not exists (
    select 1 from private.ai_provider_runs
    where job_id::text like 'ea600000-%'
      and status = 'FAILED'
      and canonical_run is not null
  ),
  'failure diagnostics do not retain canonical provider output metadata'
);
select ok(
  not exists (
    select 1 from private.ai_provider_runs
    where job_id::text like 'ea600000-%'
      and status = 'SUCCEEDED'
      and canonical_run is null
  ),
  'successful diagnostics retain canonical provider metadata'
);
select throws_ok(
  $$select private.record_ai_provider_run('ea600000-0000-4000-8000-000000000007', 1, 'UNKNOWN_TASK_V1', 'unknown.v1', 'unknown-output.v1', 'OPENAI', 'test-model', 'low', 'FAILED', null, 1, null, 'AI_PROVIDER_TIMEOUT')$$,
  '22023',
  'ai_provider_run_invalid',
  'unknown task aliases remain rejected at the function boundary'
);

select * from finish();

rollback;
