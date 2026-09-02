begin;

set local search_path = public, extensions;

select plan(37);

select has_table('private', 'session_command_receipts', 'session command receipts exist');
select has_function(
  'public', 'heartbeat_session', array['uuid', 'uuid'],
  'session heartbeat command exists'
);
select has_function(
  'public', 'start_session', array['uuid', 'text', 'uuid', 'integer'],
  'atomic session start command exists'
);
select ok(
  not has_table_privilege('authenticated', 'private.session_command_receipts', 'SELECT'),
  'authenticated clients cannot read session command receipts'
);
select ok(
  has_function_privilege('authenticated', 'public.heartbeat_session(uuid,uuid)', 'EXECUTE'),
  'authenticated actors can call the heartbeat command'
);
select ok(
  has_function_privilege('authenticated', 'public.start_session(uuid,text,uuid,integer)', 'EXECUTE'),
  'authenticated actors can call the start command'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('80000000-0000-4000-8000-000000000001', 'start-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"시작 방장"}'::jsonb),
  ('80000000-0000-4000-8000-000000000002', 'start-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"시작 참가자"}'::jsonb),
  ('80000000-0000-4000-8000-000000000003', 'start-outsider@example.test', 'authenticated', 'authenticated', '{"profile_name":"외부 사용자"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values ('80100000-0000-4000-8000-000000000001', '시작 테스트 책', '시작 작가', '양념 출판사', 2026);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  '80200000-0000-4000-8000-000000000001',
  '80100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', '시작 테스트 Pack', timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  (
    '80300000-0000-4000-8000-000000000001', '시작 가능한 방',
    '80200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '80000000-0000-4000-8000-000000000001'
  ),
  (
    '80300000-0000-4000-8000-000000000002', '아직 이른 방',
    '80200000-0000-4000-8000-000000000001', timezone('utc', now()) + interval '1 day',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '80000000-0000-4000-8000-000000000001'
  ),
  (
    '80300000-0000-4000-8000-000000000003', '접속 인원 부족 방',
    '80200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 3, 5,
    '80000000-0000-4000-8000-000000000001'
  ),
  (
    '80300000-0000-4000-8000-000000000004', '종료된 방',
    '80200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 hour',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '80000000-0000-4000-8000-000000000001'
  );

insert into public.session_runs (id, room_id, phase, phase_version)
values
  ('80400000-0000-4000-8000-000000000001', '80300000-0000-4000-8000-000000000001', 'SCHEDULED', 0),
  ('80400000-0000-4000-8000-000000000002', '80300000-0000-4000-8000-000000000002', 'SCHEDULED', 0),
  ('80400000-0000-4000-8000-000000000003', '80300000-0000-4000-8000-000000000003', 'SCHEDULED', 0),
  ('80400000-0000-4000-8000-000000000004', '80300000-0000-4000-8000-000000000004', 'ENDED', 1);

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot
) values
  ('80300000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'REGISTERED', '시작 방장'),
  ('80300000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000002', 'REGISTERED', '시작 참가자'),
  ('80300000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', 'REGISTERED', '시작 방장'),
  ('80300000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'REGISTERED', '시작 참가자'),
  ('80300000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000001', 'REGISTERED', '시작 방장'),
  ('80300000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000002', 'REGISTERED', '시작 참가자'),
  ('80300000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000001', 'PARTICIPATED', '시작 방장');

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select connected_participant_count
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000001'
    )
  ),
  1::bigint,
  'the host heartbeat counts one connected participant'
);

select is(
  (
    select heartbeat_interval_seconds::text || '/' || online_threshold_seconds::text
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000001'
    )
  ),
  '15/30',
  'heartbeat publishes the initial experimental interval and online threshold'
);

select is(
  (
    select connected_participant_count
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000002'
    )
  ),
  1::bigint,
  'a second host device does not increase the participant count'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select connected_participant_count
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000003'
    )
  ),
  2::bigint,
  'a registered member heartbeat satisfies the second connected participant'
);

reset role;
select is(
  (
    select count(*) from public.session_connections
    where session_id = '80400000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'heartbeat keeps one durable row per user and device'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000004'
    )
  $$,
  '42501',
  'active_membership_required',
  'an outsider cannot create a session connection'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.start_session(
      '80600000-0000-4000-8000-000000000001', 'member-start',
      '80300000-0000-4000-8000-000000000001', 0
    )
  $$,
  '42501',
  'room_host_required',
  'a participant cannot start the session'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.start_session(
      '80600000-0000-4000-8000-000000000002', 'phase-conflict',
      '80300000-0000-4000-8000-000000000001', 99
    )
  $$,
  '40001',
  'phase_version_conflict',
  'start rejects a stale phase version'
);

select is(
  (
    select connected_participant_count
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000002',
      '80500000-0000-4000-8000-000000000005'
    )
  ),
  1::bigint,
  'heartbeat can enter a room before its scheduled time'
);

select throws_ok(
  $$
    select * from public.start_session(
      '80600000-0000-4000-8000-000000000003', 'too-early',
      '80300000-0000-4000-8000-000000000002', 0
    )
  $$,
  '55000',
  'session_start_too_early',
  'the host cannot start before the scheduled time'
);

select is(
  (
    select connected_participant_count
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000003',
      '80500000-0000-4000-8000-000000000006'
    )
  ),
  1::bigint,
  'the insufficient room initially has only its host connected'
);

select throws_ok(
  $$
    select * from public.start_session(
      '80600000-0000-4000-8000-000000000004', 'not-enough-connected',
      '80300000-0000-4000-8000-000000000003', 0
    )
  $$,
  '55000',
  'minimum_connected_participants_not_met',
  'registered but offline members do not satisfy the start minimum'
);

select is(
  (
    select revision from public.upsert_room_prep(
      '80600000-0000-4000-8000-000000000005', 'prep-before-start',
      '80300000-0000-4000-8000-000000000001',
      '80700000-0000-4000-8000-000000000001', null,
      'DISCUSSION_QUESTION', 'PUBLIC', '시작 전에 작성한 질문'
    )
  ),
  1,
  'prep remains editable immediately before the atomic start'
);

select is(
  (
    select phase
    from public.start_session(
      '80600000-0000-4000-8000-000000000006', 'main-start',
      '80300000-0000-4000-8000-000000000001', 0
    )
  ),
  'OPENING',
  'the valid host command starts the opening phase'
);

reset role;

select is(
  (
    select discussion_ends_at - started_at
    from public.session_runs
    where id = '80400000-0000-4000-8000-000000000001'
  ),
  interval '30 minutes',
  'start fixes the authoritative discussion deadline at 30 minutes'
);

select is(
  (
    select extension_decision_deadline_at - started_at
    from public.session_runs
    where id = '80400000-0000-4000-8000-000000000001'
  ),
  interval '25 minutes',
  'start fixes the no-response decision boundary at five minutes remaining'
);

select is(
  (
    select phase_version from public.session_runs
    where id = '80400000-0000-4000-8000-000000000001'
  ),
  1,
  'start advances the phase version exactly once'
);

select is(
  (
    select count(*) from public.session_events
    where session_id = '80400000-0000-4000-8000-000000000001'
      and event_type = 'SESSION_STATE_CHANGED'
  ),
  1::bigint,
  'start appends one committed state event'
);

select is(
  (
    select public_payload #>> '{state,phase}'
    from public.session_events
    where session_id = '80400000-0000-4000-8000-000000000001'
      and event_seq = 1
  ),
  'OPENING',
  'the state event contains the public opening projection'
);

select is(
  (
    select count(*) from private.session_command_receipts
    where session_id = '80400000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'the successful start stores one idempotency receipt'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.upsert_room_prep(
      '80600000-0000-4000-8000-000000000007', 'prep-after-start',
      '80300000-0000-4000-8000-000000000001',
      '80700000-0000-4000-8000-000000000001', 1,
      'DISCUSSION_QUESTION', 'PUBLIC', '시작 뒤 바꾸려는 질문'
    )
  $$,
  '42501',
  'prep_write_not_allowed',
  'the same transaction phase boundary locks prep after start'
);

select is(
  (
    select duplicate
    from public.start_session(
      '80600000-0000-4000-8000-000000000006', 'main-start',
      '80300000-0000-4000-8000-000000000001', 0
    )
  ),
  true,
  'retrying the same start command returns its stored response'
);

reset role;

select is(
  (
    select count(*) from public.session_events
    where session_id = '80400000-0000-4000-8000-000000000001'
      and event_type = 'SESSION_STATE_CHANGED'
  ),
  1::bigint,
  'an idempotent retry does not append a second start event'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.start_session(
      '80600000-0000-4000-8000-000000000006', 'changed-start-payload',
      '80300000-0000-4000-8000-000000000001', 0
    )
  $$,
  '40001',
  'command_payload_mismatch',
  'a start command id cannot be reused with another fingerprint'
);

select is(
  (
    select membership_status
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000001'
    )
  ),
  'PARTICIPATED',
  'the first heartbeat after start promotes the host to actual participation'
);

reset role;

select is(
  (
    select count(*) from public.session_events
    where session_id = '80400000-0000-4000-8000-000000000001'
      and event_type = 'SESSION_PARTICIPANT_CHANGED'
  ),
  1::bigint,
  'actual participation promotion appends one participant event'
);

select set_config('request.jwt.claims', '{"sub":"80000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select event_cursor
    from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000001',
      '80500000-0000-4000-8000-000000000001'
    )
  ),
  2::bigint,
  'a repeated heartbeat refreshes presence without creating another event'
);

select throws_ok(
  $$
    select * from public.heartbeat_session(
      '80300000-0000-4000-8000-000000000004',
      '80500000-0000-4000-8000-000000000007'
    )
  $$,
  '55000',
  'session_connection_closed',
  'heartbeat cannot reopen an ended session'
);

reset role;

select is(
  (
    select status from public.room_memberships
    where room_id = '80300000-0000-4000-8000-000000000001'
      and user_id = '80000000-0000-4000-8000-000000000001'
  ),
  'PARTICIPATED',
  'actual participation is durable after the heartbeat returns'
);

select is(
  (
    select aggregate_version from public.session_runs
    where id = '80400000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'start and first actual participation each advance the session aggregate once'
);

select is(
  (
    select last_event_seq from public.session_runs
    where id = '80400000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'the session event cursor matches its two committed events'
);

select * from finish();
rollback;
