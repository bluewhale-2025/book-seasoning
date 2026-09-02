begin;

set local search_path = public, extensions;

select plan(22);

select has_table('private', 'discussion_results', 'official results have a private canonical table');
select has_function(
  'private', 'commit_final_wiki', array['uuid', 'integer', 'jsonb', 'jsonb', 'boolean'],
  'Final Wiki has a fenced worker commit boundary'
);
select has_function(
  'private', 'commit_discussion_record', array['uuid', 'integer', 'jsonb'],
  'official records have a fenced worker commit boundary'
);
select has_function(
  'public', 'retry_discussion_result', array['uuid', 'text', 'uuid'],
  'failed results have a host retry command'
);
select ok(
  has_function_privilege('bookseasoning_ai_worker', 'private.commit_final_wiki(uuid,integer,jsonb,jsonb,boolean)', 'EXECUTE'),
  'the worker can commit Final Wiki'
);
select ok(
  not has_function_privilege('authenticated', 'private.commit_final_wiki(uuid,integer,jsonb,jsonb,boolean)', 'EXECUTE'),
  'clients cannot forge Final Wiki'
);
select ok(
  not has_table_privilege('authenticated', 'private.discussion_results', 'SELECT'),
  'clients cannot bypass the immutable result projection'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d2100000-0000-4000-8000-000000000001', 'result-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"Result 방장"}'),
  ('d2100000-0000-4000-8000-000000000002', 'result-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"Result 참가자"}');
insert into public.books (id, title, author, publisher, publication_year)
values ('d2200000-0000-4000-8000-000000000001', 'Result 책', '작가', '출판사', 2026);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'd2300000-0000-4000-8000-000000000001', 'd2200000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', 'Result fixture', timezone('utc', now())
);
insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  ('d2400000-0000-4000-8000-000000000001', 'Insufficient 방', 'd2300000-0000-4000-8000-000000000001', timezone('utc', now()), '$argon2id$result1', 2, 5, 'd2100000-0000-4000-8000-000000000001'),
  ('d2400000-0000-4000-8000-000000000002', 'Retry 방', 'd2300000-0000-4000-8000-000000000001', timezone('utc', now()), '$argon2id$result2', 2, 5, 'd2100000-0000-4000-8000-000000000001');
insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at
) select room_id, user_id, 'PARTICIPATED', profile_name, timezone('utc', now())
from (values
  ('d2400000-0000-4000-8000-000000000001'::uuid, 'd2100000-0000-4000-8000-000000000001'::uuid, 'Result 방장'),
  ('d2400000-0000-4000-8000-000000000001'::uuid, 'd2100000-0000-4000-8000-000000000002'::uuid, 'Result 참가자'),
  ('d2400000-0000-4000-8000-000000000002'::uuid, 'd2100000-0000-4000-8000-000000000001'::uuid, 'Result 방장'),
  ('d2400000-0000-4000-8000-000000000002'::uuid, 'd2100000-0000-4000-8000-000000000002'::uuid, 'Result 참가자')
) as fixture(room_id, user_id, profile_name);
insert into public.session_runs (id, room_id, phase, phase_version, aggregate_version)
values
  ('d2500000-0000-4000-8000-000000000001', 'd2400000-0000-4000-8000-000000000001', 'CORE', 2, 1),
  ('d2500000-0000-4000-8000-000000000002', 'd2400000-0000-4000-8000-000000000002', 'CORE', 2, 1);
update public.session_runs set phase = 'ENDED', phase_version = 3, ended_at = timezone('utc', now())
where id in ('d2500000-0000-4000-8000-000000000001', 'd2500000-0000-4000-8000-000000000002');

insert into public.prep_entries (
  id, room_id, author_user_id, author_profile_name_snapshot,
  prompt_type, visibility, public_body
) values
  ('d2600000-0000-4000-8000-000000000001', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000001', 'Result 방장', 'QUOTE_THOUGHT', 'PUBLIC', '방장의 공개 준비'),
  ('d2600000-0000-4000-8000-000000000002', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000001', 'Result 방장', 'DISCUSSION_QUESTION', 'AI_PRIVATE', null),
  ('d2600000-0000-4000-8000-000000000003', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000002', 'Result 참가자', 'IMPRESSIVE_PART', 'PUBLIC', '참가자의 공개 준비'),
  ('d2600000-0000-4000-8000-000000000004', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000002', 'Result 참가자', 'DISCUSSION_QUESTION', 'AI_PRIVATE', null);
insert into private.ai_private_prep_bodies (
  prep_entry_id, room_id, author_user_id, body, revision
) values
  ('d2600000-0000-4000-8000-000000000002', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000001', '방장 본인의 비공개 준비', 1),
  ('d2600000-0000-4000-8000-000000000004', 'd2400000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000002', '참가자 본인의 비공개 준비', 1);

update private.ai_job_runs
set status = 'PROCESSING', attempt_count = 1,
    lease_expires_at = timezone('utc', now()) + interval '5 minutes',
    started_at = timezone('utc', now()), updated_at = timezone('utc', now())
where session_id = 'd2500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI';
insert into private.ai_job_attempts (job_id, attempt_no, queue_read_count, lease_expires_at)
select id, 1, 1, lease_expires_at from private.ai_job_runs
where session_id = 'd2500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI';

select is(
  (select commit_status from private.commit_final_wiki(
    (select id from private.ai_job_runs where session_id = 'd2500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI'),
    1,
    '{"currentTopic":null,"perspectiveMap":[],"bookGrounding":[],"issueAndQuestionMap":[],"coverage":[],"participantState":[],"metricsAndKeyChanges":{"metrics":{},"summary":"기록을 만들기에 충분한 공개 대화가 없습니다.","keyChanges":[]}}'::jsonb,
    null, true
  )),
  'COMMITTED',
  'insufficient public conversation still seals one Final Wiki without fabrication'
);
select is(
  (select status from private.discussion_results where session_id = 'd2500000-0000-4000-8000-000000000001'),
  'INSUFFICIENT',
  'insufficient conversation is an explicit terminal result state'
);
select is(
  (select count(*) from private.living_wiki_versions where session_id = 'd2500000-0000-4000-8000-000000000001' and kind = 'FINAL'),
  1::bigint,
  'a session has exactly one Final Wiki'
);
select is(
  (select record_job_id from private.commit_final_wiki(
    (select id from private.ai_job_runs where session_id = 'd2500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI'),
    1,
    '{"currentTopic":null,"perspectiveMap":[],"bookGrounding":[],"issueAndQuestionMap":[],"coverage":[],"participantState":[],"metricsAndKeyChanges":{"metrics":{},"summary":"기록을 만들기에 충분한 공개 대화가 없습니다.","keyChanges":[]}}'::jsonb,
    null, true
  )),
  null::uuid,
  'Final Wiki replay is idempotent and does not enqueue a fabricated record'
);

update private.ai_job_runs
set status = 'FAILED', attempt_count = 1,
    started_at = created_at, completed_at = created_at,
    last_error_code = 'PROVIDER_FAILED', updated_at = created_at
where session_id = 'd2500000-0000-4000-8000-000000000002' and job_type = 'FINAL_WIKI';
select is(
  (select status from private.discussion_results where session_id = 'd2500000-0000-4000-8000-000000000002'),
  'FAILED',
  'terminal Final Wiki failure leaves the ended session and marks only the result failed'
);

select set_config('request.jwt.claims', '{"sub":"d2100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*) from public.list_room_prep('d2400000-0000-4000-8000-000000000001')),
  3::bigint,
  'ended-room host reads public prep and only their own private prep'
);
select is(
  (
    select count(*) from public.list_room_prep('d2400000-0000-4000-8000-000000000001')
    where body = '참가자 본인의 비공개 준비'
  ),
  0::bigint,
  'ended-room host cannot infer another participant private prep'
);
select ok(
  (select projected."canRetry" from jsonb_to_record(
    (select result from public.get_discussion_result('d2400000-0000-4000-8000-000000000002'))
  ) as projected("canRetry" boolean)),
  'only the host projection offers a retry for a failed result'
);
select is(
  (select status from public.retry_discussion_result(
    'd2700000-0000-4000-8000-000000000001', 'retry-result-v1',
    'd2400000-0000-4000-8000-000000000002'
  )),
  'PENDING',
  'the host can enqueue a bounded result retry'
);
select ok(
  (select duplicate from public.retry_discussion_result(
    'd2700000-0000-4000-8000-000000000001', 'retry-result-v1',
    'd2400000-0000-4000-8000-000000000002'
  )),
  'result retry command replay is idempotent'
);
reset role;

select is(
  (select generation_no from private.discussion_results where session_id = 'd2500000-0000-4000-8000-000000000002'),
  2,
  'manual retry advances a monotonic generation number'
);
select is(
  (select count(*) from private.ai_job_runs where session_id = 'd2500000-0000-4000-8000-000000000002' and job_type = 'FINAL_WIKI'),
  2::bigint,
  'manual retry creates one new Final Wiki attempt job'
);

select set_config('request.jwt.claims', '{"sub":"d2100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select count(*) from public.list_room_prep('d2400000-0000-4000-8000-000000000001')),
  3::bigint,
  'ended-room participant reads public prep and only their own private prep'
);
select is(
  (
    select count(*) from public.list_room_prep('d2400000-0000-4000-8000-000000000001')
    where body = '방장 본인의 비공개 준비'
  ),
  0::bigint,
  'ended-room participant cannot infer the host private prep'
);
select ok(
  not (select (result ->> 'canRetry')::boolean from public.get_discussion_result('d2400000-0000-4000-8000-000000000002')),
  'participants never receive the host-only retry control'
);
reset role;

select * from finish();
rollback;
