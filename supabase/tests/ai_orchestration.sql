begin;

set local search_path = public, extensions;

select plan(36);

select has_table('private', 'ai_host_help_requests', 'host-help requests have a private state table');
select has_table('private', 'ai_orchestration_jobs', 'trigger directives have a private mapping table');
select has_table('private', 'ai_extension_opinions', 'extension opinions have an immutable private result table');
select has_function(
  'public', 'request_session_ai_help',
  array['uuid', 'text', 'uuid', 'integer', 'text'],
  'the host-help command boundary exists'
);
select has_function(
  'private', 'read_ai_orchestration_directive', array['uuid', 'integer'],
  'the worker can resolve an explicit trigger after claim'
);
select has_function(
  'private', 'refresh_ai_orchestration_job', array['uuid', 'integer'],
  'stale explicit work has a bounded refresh boundary'
);
select has_function(
  'private', 'commit_ai_extension_opinion',
  array['uuid', 'integer', 'text', 'integer', 'uuid', 'jsonb', 'jsonb'],
  'extension opinion commit has a fenced boundary'
);
select ok(
  not has_table_privilege('authenticated', 'private.ai_orchestration_jobs', 'SELECT'),
  'authenticated clients cannot inspect private orchestration metadata'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.request_session_ai_help(uuid,text,uuid,integer,text)',
    'EXECUTE'
  ),
  'authenticated hosts can call the public request command'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.read_ai_orchestration_directive(uuid,integer)', 'EXECUTE'
  ),
  'authenticated clients cannot read worker directives'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.read_ai_orchestration_directive(uuid,integer)',
    'EXECUTE'
  ),
  'the worker can read a claimed directive'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.refresh_ai_orchestration_job(uuid,integer)',
    'EXECUTE'
  ),
  'the worker can refresh stale explicit work'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_ai_extension_opinion(uuid,integer,text,integer,uuid,jsonb,jsonb)',
    'EXECUTE'
  ),
  'the worker can commit a validated extension opinion'
);

select pgmq.purge_queue('ai-session');

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  (
    'ac100000-0000-4000-8000-000000000001',
    'orchestration-host@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"Orchestration 방장"}'::jsonb
  ),
  (
    'ac100000-0000-4000-8000-000000000002',
    'orchestration-member@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"Orchestration 참가자"}'::jsonb
  );

insert into public.books (id, title, author, publisher, publication_year)
values (
  'ac200000-0000-4000-8000-000000000001',
  'Orchestration 테스트 책', '테스트 작가', '테스트 출판사', 2026
);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'ac300000-0000-4000-8000-000000000001',
  'ac200000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', 'orchestration fixture', '2030-01-01T00:00:00Z'
);
insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'ac400000-0000-4000-8000-000000000001',
  'Orchestration 테스트 방',
  'ac300000-0000-4000-8000-000000000001',
  '2030-01-01T09:00:00Z', '$argon2id$orchestration', 2, 5,
  'ac100000-0000-4000-8000-000000000001'
);
insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, joined_at, participated_at
) values
  (
    'ac400000-0000-4000-8000-000000000001',
    'ac100000-0000-4000-8000-000000000001',
    'PARTICIPATED', 'Orchestration 방장', '2030-01-01T09:00:00Z', '2030-01-01T09:00:00Z'
  ),
  (
    'ac400000-0000-4000-8000-000000000001',
    'ac100000-0000-4000-8000-000000000002',
    'PARTICIPATED', 'Orchestration 참가자', '2030-01-01T09:00:00Z', '2030-01-01T09:00:00Z'
  );
insert into public.session_runs (
  id, room_id, phase, phase_version, started_at, discussion_ends_at,
  extension_decision_deadline_at, updated_at
) values (
  'ac500000-0000-4000-8000-000000000001',
  'ac400000-0000-4000-8000-000000000001',
  'SCHEDULED', 0, null, null, null, '2030-01-01T09:00:00Z'
);

update public.session_runs
set phase = 'OPENING', phase_version = 1,
    started_at = '2030-01-01T09:00:00Z',
    discussion_ends_at = '2030-01-01T09:30:00Z',
    extension_decision_deadline_at = '2030-01-01T09:25:00Z'
where id = 'ac500000-0000-4000-8000-000000000001';

select is(
  (
    select count(*) from private.ai_job_runs
    where session_id = 'ac500000-0000-4000-8000-000000000001'
      and job_type = 'OPENING'
  ),
  1::bigint,
  'the SCHEDULED to OPENING transaction enqueues one Opening job'
);
update public.session_runs
set updated_at = '2030-01-01T09:00:01Z'
where id = 'ac500000-0000-4000-8000-000000000001';
select is(
  (
    select count(*) from private.ai_job_runs
    where session_id = 'ac500000-0000-4000-8000-000000000001'
      and job_type = 'OPENING'
  ),
  1::bigint,
  'an unrelated session update does not duplicate Opening work'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select request_status from public.request_session_ai_help(
      'ac600000-0000-4000-8000-000000000001', 'host-help-v1',
      'ac400000-0000-4000-8000-000000000001', 1,
      'DISCUSSION_STUCK_OR_REPETITIVE'
    )
  ),
  'QUEUED',
  'the host can enqueue one help request without waiting for AI'
);
reset role;
select is(
  (
    select trigger || ':' || host_help_reason
    from private.ai_orchestration_jobs
    where host_help_request_id is not null
  ),
  'HOST_HELP:DISCUSSION_STUCK_OR_REPETITIVE',
  'the content-free directive preserves the selected reason'
);

set local role authenticated;
select ok(
  (
    select duplicate from public.request_session_ai_help(
      'ac600000-0000-4000-8000-000000000001', 'host-help-v1',
      'ac400000-0000-4000-8000-000000000001', 1,
      'DISCUSSION_STUCK_OR_REPETITIVE'
    )
  ),
  'the same command id replays the original request'
);
select throws_ok(
  $$ select * from public.request_session_ai_help(
    'ac600000-0000-4000-8000-000000000002', 'host-help-v2',
    'ac400000-0000-4000-8000-000000000001', 1, 'CONVERSATION_STOPPED'
  ) $$,
  '55000', 'ai_help_request_in_progress',
  'a second request is rejected while one request is in flight'
);
reset role;

update private.ai_job_runs
set status = 'SUPPRESSED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null,
    suppression_reason = 'EVALUATOR_PROVIDER_NOT_CONFIGURED',
    updated_at = created_at
where id = (
  select current_job_id from private.ai_host_help_requests
  where session_id = 'ac500000-0000-4000-8000-000000000001'
);

set local role authenticated;
select throws_ok(
  $$ select * from public.request_session_ai_help(
    'ac600000-0000-4000-8000-000000000003', 'host-help-v3',
    'ac400000-0000-4000-8000-000000000001', 1, 'CONVERSATION_STOPPED'
  ) $$,
  'P0001', 'ai_help_request_cooldown',
  'the 90-second experiment cooldown remains after completion'
);
select is(
  (
    select snapshot #>> '{ai,latestHostHelpRequest,status}'
    from public.get_session_sync_with_ai(
      'ac400000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'FAILED',
  'a degraded provider exposes only a safe failed state to the host'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"ac100000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select snapshot -> 'ai' -> 'latestHostHelpRequest'
    from public.get_session_sync_with_ai(
      'ac400000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'null'::jsonb,
  'other participants do not see the host-only processing state'
);
reset role;

insert into public.prep_entries (
  id, room_id, author_user_id, author_profile_name_snapshot,
  prompt_type, visibility, public_body
) values (
  'ac700000-0000-4000-8000-000000000001',
  'ac400000-0000-4000-8000-000000000001',
  'ac100000-0000-4000-8000-000000000002', 'Orchestration 참가자',
  'DISCUSSION_QUESTION', 'AI_PRIVATE', null
);
insert into private.ai_private_prep_bodies (
  prep_entry_id, room_id, author_user_id, body, revision
) values (
  'ac700000-0000-4000-8000-000000000001',
  'ac400000-0000-4000-8000-000000000001',
  'ac100000-0000-4000-8000-000000000002',
  'AI_PRIVATE_CANARY_S5_9_NEVER_DISCLOSE', 1
);
select set_config(
  'request.jwt.claims',
  '{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select ok(
  (
    select snapshot::text not like '%AI_PRIVATE_CANARY_S5_9_NEVER_DISCLOSE%'
    from public.get_session_sync_with_ai(
      'ac400000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'the host snapshot excludes the synthetic private canary'
);
reset role;

update private.ai_job_runs
set status = 'SUCCEEDED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null, updated_at = created_at
where job_type = 'OPENING'
  and session_id = 'ac500000-0000-4000-8000-000000000001';

do $$
declare
  seq integer;
begin
  for seq in 1..3 loop
    update public.session_runs set last_message_seq = seq
    where id = 'ac500000-0000-4000-8000-000000000001';
    insert into public.messages (
      id, session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, client_message_id, body, confirmed_at
    ) values (
      ('ac8' || lpad(seq::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
      'ac500000-0000-4000-8000-000000000001', seq, 'PARTICIPANT',
      'ac100000-0000-4000-8000-000000000001', 'Orchestration 방장',
      ('ac9' || lpad(seq::text, 5, '0') || '-0000-4000-8000-000000000001')::uuid,
      '같은 화자의 메시지 ' || seq::text, '2030-01-01T09:01:00Z'::timestamptz
    );
  end loop;
end;
$$;
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'MESSAGE_BATCH'
      and session_id = 'ac500000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'three messages from one speaker do not yet form the batch threshold'
);
update public.session_runs set last_message_seq = 4
where id = 'ac500000-0000-4000-8000-000000000001';
insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body, confirmed_at
) values (
  'ac800004-0000-4000-8000-000000000001',
  'ac500000-0000-4000-8000-000000000001', 4, 'PARTICIPANT',
  'ac100000-0000-4000-8000-000000000001', 'Orchestration 방장',
  'ac900004-0000-4000-8000-000000000001', '네 번째 메시지',
  '2030-01-01T09:01:10Z'
);
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'MESSAGE_BATCH'
      and session_id = 'ac500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the fourth message atomically enqueues one message-batch evaluation'
);
select ok(
  not private.enqueue_ai_evaluation_if_due(
    'ac500000-0000-4000-8000-000000000001', '2030-01-01T09:01:11Z', false
  ),
  'an active evaluation suppresses duplicate automatic work'
);

update private.ai_job_runs
set status = 'SUCCEEDED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null, updated_at = created_at
where id = (
  select job_id from private.ai_orchestration_jobs
  where trigger = 'MESSAGE_BATCH'
    and session_id = 'ac500000-0000-4000-8000-000000000001'
);
insert into private.living_wiki_versions (
  session_id, version, kind, base_version, based_through_seq,
  schema_version, document, source_job_id
) values (
  'ac500000-0000-4000-8000-000000000001', 1, 'INCREMENTAL', null, 4,
  'living-wiki.v1', '{}'::jsonb,
  (select job_id from private.ai_orchestration_jobs where trigger = 'MESSAGE_BATCH')
);

update public.session_runs set last_message_seq = 5
where id = 'ac500000-0000-4000-8000-000000000001';
insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body, confirmed_at
) values (
  'ac800005-0000-4000-8000-000000000001',
  'ac500000-0000-4000-8000-000000000001', 5, 'PARTICIPANT',
  'ac100000-0000-4000-8000-000000000001', 'Orchestration 방장',
  'ac900005-0000-4000-8000-000000000001', '새 묶음 첫 발언',
  '2030-01-01T09:02:00Z'
);
update public.session_runs set last_message_seq = 6
where id = 'ac500000-0000-4000-8000-000000000001';
insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body, confirmed_at
) values (
  'ac800006-0000-4000-8000-000000000001',
  'ac500000-0000-4000-8000-000000000001', 6, 'PARTICIPANT',
  'ac100000-0000-4000-8000-000000000002', 'Orchestration 참가자',
  'ac900006-0000-4000-8000-000000000001', '새 묶음 두 번째 화자',
  '2030-01-01T09:02:10Z'
);
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'PARTICIPATION_THRESHOLD'
      and session_id = 'ac500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'two of two active participants satisfy the 60-percent candidate signal'
);

update private.ai_job_runs
set status = 'SUCCEEDED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null, updated_at = created_at
where id = (
  select job_id from private.ai_orchestration_jobs
  where trigger = 'PARTICIPATION_THRESHOLD'
);
insert into private.living_wiki_versions (
  session_id, version, kind, base_version, based_through_seq,
  schema_version, document, source_job_id
) values (
  'ac500000-0000-4000-8000-000000000001', 2, 'INCREMENTAL', 1, 6,
  'living-wiki.v1', '{}'::jsonb,
  (select job_id from private.ai_orchestration_jobs where trigger = 'PARTICIPATION_THRESHOLD')
);
update public.session_runs set last_message_seq = 7, started_at = '2030-01-01T08:50:00Z'
where id = 'ac500000-0000-4000-8000-000000000001';
insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body, confirmed_at
) values (
  'ac800007-0000-4000-8000-000000000001',
  'ac500000-0000-4000-8000-000000000001', 7, 'PARTICIPANT',
  'ac100000-0000-4000-8000-000000000001', 'Orchestration 방장',
  'ac900007-0000-4000-8000-000000000001', '최근 한 발언',
  '2030-01-01T09:10:00Z'
);
select ok(
  private.enqueue_ai_evaluation_if_due(
    'ac500000-0000-4000-8000-000000000001', '2030-01-01T09:10:00Z', true
  ),
  'an eight-minute topic duration becomes an evaluation candidate'
);
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'TOPIC_DURATION'
      and session_id = 'ac500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the topic-duration trigger is stored explicitly rather than inferred later'
);

update private.ai_job_runs
set status = 'SUCCEEDED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null, updated_at = created_at
where id = (select job_id from private.ai_orchestration_jobs where trigger = 'TOPIC_DURATION');
select ok(
  private.enqueue_ai_evaluation_if_due(
    'ac500000-0000-4000-8000-000000000001', '2030-01-01T09:11:01Z', true
  ),
  'a 60-second silence becomes an evaluation candidate'
);
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'SILENCE'
      and session_id = 'ac500000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the silence trigger is persisted once for the cursor and time bucket'
);
select ok(
  not private.enqueue_ai_evaluation_if_due(
    'ac500000-0000-4000-8000-000000000001', '2030-01-01T09:11:10Z', true
  ),
  'the same silence window does not enqueue duplicate active work'
);

update public.session_runs
set phase_version = 2,
    extension_prompted_at = '2030-01-01T09:23:00Z',
    updated_at = '2030-01-01T09:23:00Z'
where id = 'ac500000-0000-4000-8000-000000000001';
select is(
  (
    select count(*) from private.ai_orchestration_jobs
    where trigger = 'EXTENSION_DECISION'
      and extension_phase_version = 2
  ),
  1::bigint,
  'opening the seven-minute window atomically enqueues extension evaluation'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"ac100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (
    select snapshot #>> '{ai,extensionOpinion,status}'
    from public.get_session_sync_with_ai(
      'ac400000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'PENDING',
  'all participants can observe that an opinion is pending without blocking their decision'
);
reset role;

update private.ai_job_runs
set status = 'SUPPRESSED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    lease_expires_at = null,
    suppression_reason = 'EVALUATOR_PROVIDER_NOT_CONFIGURED',
    updated_at = created_at
where id = (
  select job_id from private.ai_orchestration_jobs
  where trigger = 'EXTENSION_DECISION'
    and extension_phase_version = 2
);

set local role authenticated;
select is(
  (
    select snapshot #>> '{ai,extensionOpinion,status}'
    from public.get_session_sync_with_ai(
      'ac400000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'UNAVAILABLE',
  'a degraded extension opinion never blocks or replaces the host decision'
);
reset role;

select ok(
  not exists (
    select 1
    from private.ai_job_runs as job
    where pg_catalog.row_to_json(job)::text
      like '%AI_PRIVATE_CANARY_S5_9_NEVER_DISCLOSE%'
  ),
  'durable job metadata never contains the synthetic private canary'
);

select * from finish();
rollback;
