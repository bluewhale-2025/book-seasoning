begin;

set local search_path = public, extensions;

select plan(23);

select has_trigger(
  'public', 'room_memberships', 'active_session_membership_change',
  'active membership changes feed the session event stream'
);
select has_trigger(
  'public', 'rooms', 'active_session_host_change',
  'active host changes feed the session event stream'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  (
    'd0000000-0000-4000-8000-000000000001',
    'active-host@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"기존 방장"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000002',
    'active-member@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"새 방장"}'::jsonb
  ),
  (
    'd0000000-0000-4000-8000-000000000003',
    'active-late@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"진행 중 참가자"}'::jsonb
  );

insert into public.books (id, title, author, publisher, publication_year)
values (
  'd0100000-0000-4000-8000-000000000001',
  '진행 중 운영 테스트 책', '운영 작가', '양념 출판사', 2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'd0200000-0000-4000-8000-000000000001',
  'd0100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', '진행 중 운영 테스트 Pack', timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'd0300000-0000-4000-8000-000000000001', '진행 중 운영 방',
  'd0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '10 minutes',
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
  'd0000000-0000-4000-8000-000000000001'
);

insert into public.session_runs (
  id, room_id, phase, phase_version, started_at, discussion_ends_at,
  extension_decision_deadline_at
) values (
  'd0400000-0000-4000-8000-000000000001',
  'd0300000-0000-4000-8000-000000000001',
  'CORE', 2, timezone('utc', now()) - interval '10 minutes',
  timezone('utc', now()) + interval '20 minutes',
  timezone('utc', now()) + interval '15 minutes'
);

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at
) values
  (
    'd0300000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'PARTICIPATED', '기존 방장', timezone('utc', now()) - interval '10 minutes'
  ),
  (
    'd0300000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'PARTICIPATED', '새 방장', timezone('utc', now()) - interval '10 minutes'
  );

select public.authorize_room_join(
  'd0000000-0000-4000-8000-000000000003',
  'd0300000-0000-4000-8000-000000000001',
  1,
  encode(extensions.digest('active-token', 'sha256'), 'hex')
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select membership_status
    from public.join_room(
      'd0500000-0000-4000-8000-000000000001', 'active-join',
      'd0300000-0000-4000-8000-000000000001', 'active-token'
    )
  ),
  'PARTICIPATED',
  'a newcomer joins an active session as an actual participant'
);

reset role;
select is(
  (
    select status from public.room_memberships
    where room_id = 'd0300000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000003'
  ),
  'PARTICIPATED',
  'the active join persists actual participation atomically'
);
select is(
  (
    select event_type from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
  ),
  'SESSION_PARTICIPANT_CHANGED',
  'the active join becomes an official session event'
);
select is(
  (
    select public_payload -> 'participant' ->> 'profileName'
    from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
  ),
  '진행 중 참가자',
  'the join event carries only the public participant snapshot'
);
select is(
  (
    select aggregate_version::text || '/' || last_event_seq::text
    from public.session_runs
    where id = 'd0400000-0000-4000-8000-000000000001'
  ),
  '1/1',
  'the active join advances the authoritative session cursor once'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select aggregate_version
    from public.transfer_room_host(
      'd0500000-0000-4000-8000-000000000002', 'active-transfer',
      'd0300000-0000-4000-8000-000000000001', 2,
      'd0000000-0000-4000-8000-000000000002'
    )
  ),
  3,
  'the current host can transfer authority to an actual participant'
);

reset role;
select is(
  (
    select host_user_id from public.rooms
    where id = 'd0300000-0000-4000-8000-000000000001'
  ),
  'd0000000-0000-4000-8000-000000000002'::uuid,
  'host transfer changes the single authoritative host'
);
select is(
  (
    select count(*) from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
      and event_type = 'SESSION_PARTICIPANT_CHANGED'
  ),
  3::bigint,
  'host transfer emits role changes for both affected participants'
);
select is(
  (
    select public_payload -> 'participant' ->> 'role'
    from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
      and public_payload ->> 'participantUserId' =
        'd0000000-0000-4000-8000-000000000001'
    order by event_seq desc limit 1
  ),
  'PARTICIPANT',
  'the previous host becomes a regular participant'
);
select is(
  (
    select public_payload -> 'participant' ->> 'role'
    from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
      and public_payload ->> 'participantUserId' =
        'd0000000-0000-4000-8000-000000000002'
    order by event_seq desc limit 1
  ),
  'HOST',
  'the target becomes the only host in the public projection'
);

insert into public.session_connections (
  id, session_id, user_id, device_id, last_seen_at, created_at, updated_at
) values (
  'd0600000-0000-4000-8000-000000000001',
  'd0400000-0000-4000-8000-000000000001',
  'd0000000-0000-4000-8000-000000000003',
  'd0700000-0000-4000-8000-000000000001',
  timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select aggregate_version
    from public.remove_room_member(
      'd0500000-0000-4000-8000-000000000003', 'active-remove',
      'd0300000-0000-4000-8000-000000000001', 3,
      'd0000000-0000-4000-8000-000000000003'
    )
  ),
  4,
  'the new host can remove an actual participant during discussion'
);

reset role;
select is(
  (
    select status from public.room_memberships
    where room_id = 'd0300000-0000-4000-8000-000000000001'
      and user_id = 'd0000000-0000-4000-8000-000000000003'
  ),
  'REMOVED',
  'removal releases the active membership slot'
);
select ok(
  (
    select disconnected_at is not null from public.session_connections
    where id = 'd0600000-0000-4000-8000-000000000001'
  ),
  'removal closes every durable connection for the participant'
);
select is(
  (
    select channel_epoch from public.session_runs
    where id = 'd0400000-0000-4000-8000-000000000001'
  ),
  2,
  'removal rotates the private realtime topic epoch'
);
select ok(
  (
    select public_payload -> 'participant' = 'null'::jsonb
    from public.session_events
    where session_id = 'd0400000-0000-4000-8000-000000000001'
      and public_payload ->> 'participantUserId' =
        'd0000000-0000-4000-8000-000000000003'
    order by event_seq desc limit 1
  ),
  'the removal event deletes the participant from public projections'
);
select throws_ok(
  $$
    select * from public.get_room_join_challenge(
      'd0000000-0000-4000-8000-000000000003',
      'd0300000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', 'room_member_removed',
  'a removed participant cannot rejoin the room'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select aggregate_version
    from public.update_room(
      'd0500000-0000-4000-8000-000000000004', 'active-settings',
      'd0300000-0000-4000-8000-000000000001', 4,
      null, null, null,
      '$argon2id$v=19$m=19456,p=1,t=2$newtestsalt$newtesthash',
      null, 6
    )
  ),
  5,
  'an active host can rotate the password and increase capacity'
);

reset role;
select is(
  (
    select password_version from public.rooms
    where id = 'd0300000-0000-4000-8000-000000000001'
  ),
  2,
  'an active password change invalidates old join authorizations'
);
select is(
  (
    select max_participants from public.rooms
    where id = 'd0300000-0000-4000-8000-000000000001'
  ),
  6,
  'active capacity can increase up to the product limit'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.update_room(
      'd0500000-0000-4000-8000-000000000005', 'active-title',
      'd0300000-0000-4000-8000-000000000001', 5,
      '바꾸면 안 되는 제목', null, null, null, null, null
    )
  $$,
  '55000', 'room_settings_locked',
  'active discussion identity fields remain locked'
);

reset role;
update public.session_runs
set phase = 'ENDED', ended_at = timezone('utc', now())
where id = 'd0400000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claims',
  '{"sub":"d0000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.transfer_room_host(
      'd0500000-0000-4000-8000-000000000006', 'ended-transfer',
      'd0300000-0000-4000-8000-000000000001', 5,
      'd0000000-0000-4000-8000-000000000001'
    )
  $$,
  '55000', 'room_command_locked',
  'official end locks all later participant administration'
);

select * from finish();
rollback;
