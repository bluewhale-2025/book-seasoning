begin;

set local search_path = public, extensions;

select plan(43);

select has_table(
  'private', 'session_control_command_receipts',
  'session control command receipts exist'
);
select has_function(
  'public', 'extend_session', array['uuid', 'text', 'uuid', 'integer'],
  'host extension command exists'
);
select has_function(
  'public', 'start_session_synthesis', array['uuid', 'text', 'uuid', 'integer'],
  'host synthesis command exists'
);
select has_function(
  'public', 'end_session', array['uuid', 'text', 'uuid', 'integer'],
  'host end command exists'
);
select has_function(
  'public', 'advance_due_sessions', array['timestamp with time zone', 'integer'],
  'due-session reconciler exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.extend_session(uuid,text,uuid,integer)', 'EXECUTE'
  ),
  'authenticated actors can request an extension'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.start_session_synthesis(uuid,text,uuid,integer)', 'EXECUTE'
  ),
  'authenticated actors can request synthesis'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.end_session(uuid,text,uuid,integer)', 'EXECUTE'
  ),
  'authenticated actors can request an irreversible end'
);
select ok(
  not has_function_privilege(
    'anon', 'public.extend_session(uuid,text,uuid,integer)', 'EXECUTE'
  ),
  'anonymous actors cannot request an extension'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.advance_due_sessions(timestamp with time zone,integer)',
    'EXECUTE'
  ),
  'authenticated actors cannot run the reconciler'
);
select ok(
  not has_table_privilege(
    'authenticated', 'private.session_control_command_receipts', 'SELECT'
  ),
  'authenticated actors cannot inspect command receipts'
);
select is(
  (
    select count(*)
    from cron.job as job
    where job.jobname = 'bookseasoning-advance-due-sessions'
      and job.schedule = '10 seconds'
      and job.command = 'select public.advance_due_sessions();'
  ),
  1::bigint,
  'the database schedules one ten-second reconciler job'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'state-host@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"상태 방장"}'::jsonb
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'state-member@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"상태 참가자"}'::jsonb
  );

insert into public.books (id, title, author, publisher, publication_year)
values (
  'c0100000-0000-4000-8000-000000000001',
  '상태 머신 테스트 책', '상태 작가', '양념 출판사', 2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'c0200000-0000-4000-8000-000000000001',
  'c0100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', '상태 머신 테스트 Pack', timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  (
    'c0300000-0000-4000-8000-000000000001', '연장 방',
    'c0200000-0000-4000-8000-000000000001', '2030-01-01T09:30:00Z',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'c0000000-0000-4000-8000-000000000001'
  ),
  (
    'c0300000-0000-4000-8000-000000000002', '정리 선택 방',
    'c0200000-0000-4000-8000-000000000001', '2030-01-01T13:30:00Z',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'c0000000-0000-4000-8000-000000000001'
  ),
  (
    'c0300000-0000-4000-8000-000000000003', '자동 전이 방',
    'c0200000-0000-4000-8000-000000000001', '2030-01-01T09:30:00Z',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'c0000000-0000-4000-8000-000000000001'
  ),
  (
    'c0300000-0000-4000-8000-000000000004', '강제 종료 방',
    'c0200000-0000-4000-8000-000000000001', '2030-01-01T13:30:00Z',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'c0000000-0000-4000-8000-000000000001'
  );

insert into public.session_runs (
  id, room_id, phase, phase_version, aggregate_version,
  started_at, discussion_ends_at, extension_prompted_at,
  extension_decision_deadline_at, closing_started_at, closing_ends_at
) values
  (
    'c0400000-0000-4000-8000-000000000001',
    'c0300000-0000-4000-8000-000000000001',
    'CORE', 1, 0, '2030-01-01T09:30:00Z', '2030-01-01T10:07:00Z',
    null, '2030-01-01T10:05:00Z', null, null
  ),
  (
    'c0400000-0000-4000-8000-000000000002',
    'c0300000-0000-4000-8000-000000000002',
    'CORE', 1, 0, '2030-01-01T13:30:00Z', '2030-01-01T14:07:00Z',
    '2030-01-01T14:00:00Z', '2030-01-01T14:05:00Z', null, null
  ),
  (
    'c0400000-0000-4000-8000-000000000003',
    'c0300000-0000-4000-8000-000000000003',
    'CORE', 1, 0, '2030-01-01T09:30:00Z', '2030-01-01T10:10:00Z',
    null, '2030-01-01T10:05:00Z', null, null
  ),
  (
    'c0400000-0000-4000-8000-000000000004',
    'c0300000-0000-4000-8000-000000000004',
    'SYNTHESIS', 1, 0, '2030-01-01T13:30:00Z', '2030-01-01T14:07:00Z',
    null, null, null, null
  );

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at
)
select room.id, actor.id, 'PARTICIPATED', actor.profile_name, '2030-01-01T09:30:00Z'
from (
  values
    ('c0300000-0000-4000-8000-000000000001'::uuid),
    ('c0300000-0000-4000-8000-000000000002'::uuid),
    ('c0300000-0000-4000-8000-000000000003'::uuid),
    ('c0300000-0000-4000-8000-000000000004'::uuid)
) as room(id)
cross join (
  values
    ('c0000000-0000-4000-8000-000000000001'::uuid, '상태 방장'),
    ('c0000000-0000-4000-8000-000000000002'::uuid, '상태 참가자')
) as actor(id, profile_name);

insert into public.session_connections (
  id, session_id, user_id, device_id, last_seen_at, created_at, updated_at
) values (
  'c0500000-0000-4000-8000-000000000001',
  'c0400000-0000-4000-8000-000000000004',
  'c0000000-0000-4000-8000-000000000002',
  'c0600000-0000-4000-8000-000000000001',
  timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
);

select is(
  (
    select committed_transitions
    from public.advance_due_sessions('2030-01-01T10:00:00Z', 100)
  ),
  1,
  'the reconciler opens the extension window at seven minutes remaining'
);
select is(
  (
    select phase from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000001'
  ),
  'CORE',
  'opening an extension window does not change the discussion phase'
);
select is(
  (
    select extension_prompted_at from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000001'
  ),
  '2030-01-01T10:00:00Z'::timestamptz,
  'the server records the authoritative prompt time'
);
select is(
  (
    select public_payload ->> 'reason' from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000001'
  ),
  'EXTENSION_WINDOW_OPENED',
  'the prompt is an observable committed state event'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select state ->> 'phase'
    from public.extend_session(
      'c0700000-0000-4000-8000-000000000001', 'extend-v1',
      'c0300000-0000-4000-8000-000000000001', 2
    )
  ),
  'EXTENDED',
  'the host can extend an open decision window'
);
reset role;
select is(
  (
    select discussion_ends_at from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000001'
  ),
  '2030-01-01T10:22:00Z'::timestamptz,
  'an extension adds exactly fifteen minutes to the prior deadline'
);
select is(
  (
    select extension_count from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000001'
  ),
  1,
  'the extension count is monotonic'
);
select is(
  (
    select extension_decision_deadline_at from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000001'
  ),
  '2030-01-01T10:17:00Z'::timestamptz,
  'the next no-response deadline is five minutes before the new end'
);
set local role authenticated;
select ok(
  (
    select duplicate
    from public.extend_session(
      'c0700000-0000-4000-8000-000000000001', 'extend-v1',
      'c0300000-0000-4000-8000-000000000001', 2
    )
  ),
  'retrying the same extension command returns its receipt'
);
reset role;
select is(
  (
    select count(*) from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000001'
  ),
  2::bigint,
  'a duplicate command does not append another state event'
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.extend_session(
      'c0700000-0000-4000-8000-000000000001', 'changed-payload',
      'c0300000-0000-4000-8000-000000000001', 2
    )
  $$,
  'P0001', 'command_payload_mismatch',
  'the same command id cannot be reused with a different payload'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.start_session_synthesis(
      'c0700000-0000-4000-8000-000000000002', 'member-wrap',
      'c0300000-0000-4000-8000-000000000002', 1
    )
  $$,
  '42501', 'room_host_required',
  'a participant cannot choose the session direction'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select state ->> 'phase'
    from public.start_session_synthesis(
      'c0700000-0000-4000-8000-000000000003', 'host-wrap',
      'c0300000-0000-4000-8000-000000000002', 1
    )
  ),
  'SYNTHESIS',
  'the host can choose to wrap instead of extending'
);
reset role;
select is(
  (
    select public_payload ->> 'reason' from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000002'
  ),
  'SYNTHESIS_REQUESTED_BY_HOST',
  'the host wrap reason is committed explicitly'
);
set local role authenticated;
select throws_ok(
  $$
    select * from public.start_session_synthesis(
      'c0700000-0000-4000-8000-000000000004', 'stale-wrap',
      'c0300000-0000-4000-8000-000000000002', 1
    )
  $$,
  'P0001', 'phase_version_conflict',
  'a stale host decision loses to the committed transition'
);

select is(
  (
    select state ->> 'phase'
    from public.end_session(
      'c0700000-0000-4000-8000-000000000005', 'force-end',
      'c0300000-0000-4000-8000-000000000004', 1
    )
  ),
  'ENDED',
  'the host can irreversibly end an active phase'
);
reset role;
select is(
  (
    select public_payload ->> 'reason' from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000004'
  ),
  'ENDED_BY_HOST',
  'the irreversible host end is observable'
);
select ok(
  (
    select disconnected_at is not null from public.session_connections
    where id = 'c0500000-0000-4000-8000-000000000001'
  ),
  'ending immediately closes active durable connections'
);
set local role authenticated;
select ok(
  (
    select duplicate
    from public.end_session(
      'c0700000-0000-4000-8000-000000000005', 'force-end',
      'c0300000-0000-4000-8000-000000000004', 1
    )
  ),
  'retrying the end command returns the immutable receipt'
);
select throws_ok(
  $$
    select * from public.end_session(
      'c0700000-0000-4000-8000-000000000006', 'end-again',
      'c0300000-0000-4000-8000-000000000004', 2
    )
  $$,
  '55000', 'session_end_locked',
  'a new command cannot reopen or re-end an ended session'
);

reset role;

select is(
  (
    select committed_transitions
    from public.advance_due_sessions('2030-01-01T10:05:00Z', 100)
  ),
  1,
  'no response at five minutes remaining starts synthesis'
);
select is(
  (
    select phase from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000003'
  ),
  'SYNTHESIS',
  'the timeout transition commits the synthesis phase'
);
select is(
  (
    select public_payload ->> 'reason' from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000003'
  ),
  'SYNTHESIS_STARTED_BY_TIMEOUT',
  'the exact decision deadline prefers timeout over a late prompt'
);
select is(
  (
    select committed_transitions
    from public.advance_due_sessions('2030-01-01T10:10:00Z', 100)
  ),
  1,
  'discussion expiry starts the closing phase'
);
select is(
  (
    select phase from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000003'
  ),
  'CLOSING',
  'the session remains active for closing input'
);
select is(
  (
    select closing_ends_at from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000003'
  ),
  '2030-01-01T10:15:00Z'::timestamptz,
  'closing receives an authoritative five-minute deadline'
);
select is(
  (
    select committed_transitions
    from public.advance_due_sessions('2030-01-01T10:15:00Z', 100)
  ),
  2,
  'one pass ends closing and opens the next repeated-extension window'
);
select is(
  (
    select phase from public.session_runs
    where id = 'c0400000-0000-4000-8000-000000000003'
  ),
  'ENDED',
  'closing expiry is irreversible'
);
select is(
  (
    select public_payload ->> 'reason' from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000003'
    order by event_seq desc limit 1
  ),
  'CLOSING_EXPIRED',
  'the automatic end reason is committed explicitly'
);
select is(
  (
    select committed_transitions
    from public.advance_due_sessions('2030-01-01T10:15:00Z', 100)
  ),
  0,
  'rerunning the reconciler at the same instant is idempotent'
);
select ok(
  (
    select private.public_jsonb_keys_allowed(public_payload)
    from public.session_events
    where session_id = 'c0400000-0000-4000-8000-000000000003'
    order by event_seq desc limit 1
  ),
  'state transition events preserve the public payload allowlist'
);

select * from finish();
rollback;
