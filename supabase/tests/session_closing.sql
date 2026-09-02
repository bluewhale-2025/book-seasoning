begin;

set local search_path = public, extensions;

select plan(17);

select has_table('public', 'session_closing_responses', 'Closing responses have a durable table');
select has_function(
  'public', 'upsert_session_closing_response',
  array['uuid', 'text', 'uuid', 'integer', 'integer', 'text', 'text'],
  'Closing upsert has a public command boundary'
);
select has_function(
  'public', 'delete_session_closing_response',
  array['uuid', 'text', 'uuid', 'integer', 'integer'],
  'Closing delete has a public command boundary'
);
select ok(
  not has_table_privilege('authenticated', 'public.session_closing_responses', 'SELECT'),
  'clients cannot bypass the actor-private Closing projection'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  ('d1100000-0000-4000-8000-000000000001', 'closing-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"Closing 방장"}'),
  ('d1100000-0000-4000-8000-000000000002', 'closing-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"Closing 참가자"}'),
  ('d1100000-0000-4000-8000-000000000003', 'closing-noshow@example.test', 'authenticated', 'authenticated', '{"profile_name":"Closing 미참여"}');
insert into public.books (id, title, author, publisher, publication_year)
values ('d1200000-0000-4000-8000-000000000001', 'Closing 책', '작가', '출판사', 2026);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'd1300000-0000-4000-8000-000000000001',
  'd1200000-0000-4000-8000-000000000001', 1, 'PUBLISHED', '1',
  'Closing fixture', timezone('utc', now())
);
insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'd1400000-0000-4000-8000-000000000001', 'Closing 방',
  'd1300000-0000-4000-8000-000000000001', timezone('utc', now()),
  '$argon2id$closing', 2, 5, 'd1100000-0000-4000-8000-000000000001'
);
insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at
) values
  ('d1400000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'PARTICIPATED', 'Closing 방장', timezone('utc', now())),
  ('d1400000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000002', 'PARTICIPATED', 'Closing 참가자', timezone('utc', now())),
  ('d1400000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000003', 'REGISTERED', 'Closing 미참여', null);
insert into public.session_runs (
  id, room_id, phase, phase_version, aggregate_version, channel_epoch,
  closing_started_at, closing_ends_at
) values (
  'd1500000-0000-4000-8000-000000000001',
  'd1400000-0000-4000-8000-000000000001', 'CLOSING', 4, 1, 1,
  timezone('utc', now()), timezone('utc', now()) + interval '5 minutes'
);
insert into public.session_connections (
  session_id, user_id, device_id, last_seen_at, created_at, updated_at
) values
  ('d1500000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000001', 'd1600000-0000-4000-8000-000000000001', timezone('utc', now()), timezone('utc', now()), timezone('utc', now())),
  ('d1500000-0000-4000-8000-000000000001', 'd1100000-0000-4000-8000-000000000002', 'd1600000-0000-4000-8000-000000000002', timezone('utc', now()), timezone('utc', now()), timezone('utc', now()));

select set_config('request.jwt.claims', '{"sub":"d1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select closing #>> '{actorResponse,status}' from public.upsert_session_closing_response(
    'd1700000-0000-4000-8000-000000000001', 'closing-host-v1',
    'd1400000-0000-4000-8000-000000000001', 4, 0, 'SUBMITTED', '다른 해석을 더 오래 살펴보고 싶다.'
  )),
  'SUBMITTED',
  'an actual participant can submit a private Closing line'
);
select ok(
  not (select officially_ended from public.upsert_session_closing_response(
    'd1700000-0000-4000-8000-000000000001', 'closing-host-v1',
    'd1400000-0000-4000-8000-000000000001', 4, 0, 'SUBMITTED', '다른 해석을 더 오래 살펴보고 싶다.'
  )),
  'the idempotent first response does not end while a connected participant is pending'
);
select is(
  (select snapshot #>> '{closing,completedParticipantCount}'
   from public.get_session_sync_with_results('d1400000-0000-4000-8000-000000000001', 0, 0, 100)),
  '1',
  'sync exposes aggregate Closing progress'
);
select is(
  (select snapshot #>> '{closing,actorResponse,body}'
   from public.get_session_sync_with_results('d1400000-0000-4000-8000-000000000001', 0, 0, 100)),
  '다른 해석을 더 오래 살펴보고 싶다.',
  'sync exposes only the actor own Closing body'
);
reset role;

select ok(
  not exists (
    select 1 from public.session_events
    where session_id = 'd1500000-0000-4000-8000-000000000001'
      and public_payload::text like '%오래 살펴%'
  ),
  'the shared event log never contains a Closing body'
);

select set_config('request.jwt.claims', '{"sub":"d1100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select ok(
  (select officially_ended from public.upsert_session_closing_response(
    'd1700000-0000-4000-8000-000000000002', 'closing-member-v1',
    'd1400000-0000-4000-8000-000000000001', 4, 0, 'SKIPPED', null
  )),
  'all connected actual participants completing Closing ends early'
);
reset role;

select is(
  (select phase from public.session_runs where id = 'd1500000-0000-4000-8000-000000000001'),
  'ENDED',
  'the official session state is irreversible ENDED'
);
select is(
  (select count(*) from private.ai_job_runs
   where session_id = 'd1500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI'),
  1::bigint,
  'official end transaction enqueues exactly one Final Wiki job'
);
select is(
  (select queue_name from private.ai_job_runs
   where session_id = 'd1500000-0000-4000-8000-000000000001' and job_type = 'FINAL_WIKI'),
  'ai-record',
  'result work is isolated on the ai-record queue'
);
select is(
  (select status from private.discussion_results where session_id = 'd1500000-0000-4000-8000-000000000001'),
  'PENDING',
  'official result generation begins asynchronously'
);

select set_config('request.jwt.claims', '{"sub":"d1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.delete_session_closing_response(
    'd1700000-0000-4000-8000-000000000003', 'closing-delete-after-end',
    'd1400000-0000-4000-8000-000000000001', 5, 1
  ) $$,
  '55000', 'closing_response_locked',
  'Closing lines are immutable after official end'
);
select is(
  (select result ->> 'status' from public.get_discussion_result('d1400000-0000-4000-8000-000000000001')),
  'PENDING',
  'participants can observe result generation without private job details'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"d1100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$ select * from public.get_discussion_result('d1400000-0000-4000-8000-000000000001') $$,
  '42501', 'session_read_forbidden',
  'a registered no-show cannot read the ended result'
);
reset role;

select * from finish();
rollback;
