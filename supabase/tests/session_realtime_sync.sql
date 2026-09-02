begin;

set local search_path = public, extensions;

select plan(53);

select has_function(
  'public', 'get_session_sync', array['uuid', 'bigint', 'bigint', 'integer'],
  'authorized session sync query exists'
);
select has_function(
  'public', 'get_session_message_page', array['uuid', 'bigint', 'integer'],
  'authorized backward message page query exists'
);
select has_trigger(
  'public', 'session_events', 'session_events_private_broadcast',
  'committed session events have a private broadcast trigger'
);
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'session_official_broadcast_receive'
  ),
  1::bigint,
  'the official event topic has a receive policy'
);
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'session_ephemeral_receive'
  ),
  1::bigint,
  'the ephemeral topic has a receive policy'
);
select is(
  (
    select count(*) from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'session_ephemeral_send'
  ),
  1::bigint,
  'the ephemeral topic has a send policy'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.get_session_sync(uuid,bigint,bigint,integer)',
    'EXECUTE'
  ),
  'authenticated users can request authoritative sync'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.get_session_message_page(uuid,bigint,integer)',
    'EXECUTE'
  ),
  'authenticated users can request message history pages'
);
select ok(
  not has_function_privilege(
    'anon', 'public.get_session_sync(uuid,bigint,bigint,integer)', 'EXECUTE'
  ),
  'anonymous users cannot request session sync'
);
select ok(
  not has_function_privilege(
    'authenticated', 'private.broadcast_session_event()', 'EXECUTE'
  ),
  'participants cannot invoke the official broadcast trigger function directly'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-000000000001', 'sync-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"동기화 방장"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000002', 'sync-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"동기화 참가자"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000003', 'sync-registered@example.test', 'authenticated', 'authenticated', '{"profile_name":"등록 참가자"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000004', 'sync-outsider@example.test', 'authenticated', 'authenticated', '{"profile_name":"외부 사용자"}'::jsonb),
  ('a0000000-0000-4000-8000-000000000005', 'sync-removed@example.test', 'authenticated', 'authenticated', '{"profile_name":"내보낸 참가자"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values ('a0100000-0000-4000-8000-000000000001', '동기화 테스트 책', '동기화 작가', '양념 출판사', 2026);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'a0200000-0000-4000-8000-000000000001',
  'a0100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', '동기화 테스트 Pack', timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id, canceled_at
) values
  (
    'a0300000-0000-4000-8000-000000000001', '진행 중 동기화 방',
    'a0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'a0000000-0000-4000-8000-000000000001', null
  ),
  (
    'a0300000-0000-4000-8000-000000000002', '종료 동기화 방',
    'a0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 hour',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'a0000000-0000-4000-8000-000000000001', null
  ),
  (
    'a0300000-0000-4000-8000-000000000003', '취소 동기화 방',
    'a0200000-0000-4000-8000-000000000001', timezone('utc', now()) + interval '1 day',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    'a0000000-0000-4000-8000-000000000001', timezone('utc', now())
  );

insert into public.session_runs (
  id, room_id, phase, phase_version, channel_epoch, started_at, ended_at
) values
  (
    'a0400000-0000-4000-8000-000000000001',
    'a0300000-0000-4000-8000-000000000001', 'OPENING', 1, 3,
    timezone('utc', now()) - interval '1 minute', null
  ),
  (
    'a0400000-0000-4000-8000-000000000002',
    'a0300000-0000-4000-8000-000000000002', 'ENDED', 2, 1,
    timezone('utc', now()) - interval '1 hour', timezone('utc', now())
  ),
  (
    'a0400000-0000-4000-8000-000000000003',
    'a0300000-0000-4000-8000-000000000003', 'CANCELED', 1, 1,
    null, null
  );

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at, removed_at
) values
  ('a0300000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'PARTICIPATED', '동기화 방장', timezone('utc', now()), null),
  ('a0300000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'PARTICIPATED', '동기화 참가자', timezone('utc', now()), null),
  ('a0300000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'REGISTERED', '등록 참가자', null, null),
  ('a0300000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', 'REMOVED', '내보낸 참가자', timezone('utc', now()), timezone('utc', now())),
  ('a0300000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'REGISTERED', '동기화 방장', null, null),
  ('a0300000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'PARTICIPATED', '동기화 참가자', timezone('utc', now()), null),
  ('a0300000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'REGISTERED', '등록 참가자', null, null),
  ('a0300000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000005', 'REMOVED', '내보낸 참가자', timezone('utc', now()), timezone('utc', now())),
  ('a0300000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'CANCELED_BY_ROOM', '동기화 방장', null, null);

insert into public.session_connections (
  session_id, user_id, device_id, last_seen_at
) values
  (
    'a0400000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'a0500000-0000-4000-8000-000000000001', timezone('utc', now())
  ),
  (
    'a0400000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    'a0500000-0000-4000-8000-000000000002', timezone('utc', now())
  ),
  (
    'a0400000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000002',
    'a0500000-0000-4000-8000-000000000003', timezone('utc', now()) - interval '31 seconds'
  );

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select count(*)
    from generate_series(1, 205) as source(seq_no)
    cross join lateral public.append_session_message(
      'a0300000-0000-4000-8000-000000000001',
      extensions.gen_random_uuid(),
      '메시지 ' || source.seq_no::text,
      null
    ) as appended
  ),
  205::bigint,
  'the fixture commits 205 messages through the production append boundary'
);

reset role;

select is(
  (select count(*) from public.messages where session_id = 'a0400000-0000-4000-8000-000000000001'),
  205::bigint,
  'all confirmed messages remain durable raw data'
);
select is(
  (select count(*) from public.session_events where session_id = 'a0400000-0000-4000-8000-000000000001'),
  205::bigint,
  'every confirmed message has one durable recovery event'
);
select is(
  (
    select count(*) from realtime.messages
    where topic = 'session:a0400000-0000-4000-8000-000000000001:v3'
      and event = 'session_event'
      and extension = 'broadcast'
  ),
  205::bigint,
  'the trigger publishes every committed event to the current official topic'
);
select is(
  (
    select count(*) from realtime.messages
    where topic = 'session:a0400000-0000-4000-8000-000000000001:v3'
      and private is true
  ),
  205::bigint,
  'all official database broadcasts are private'
);
select is(
  (
    select count(*) from realtime.messages
    where topic = 'session:a0400000-0000-4000-8000-000000000001:v3'
      and payload ->> 'id' = payload #>> '{event,eventId}'
  ),
  205::bigint,
  'each transport id matches its committed event id'
);
select ok(
  not exists (
    select 1 from realtime.messages
    where topic = 'session:a0400000-0000-4000-8000-000000000001:v3'
      and not private.public_jsonb_keys_allowed(payload)
  ),
  'official broadcast payloads contain no private-looking keys'
);
select is(
  (
    select count(*) from realtime.messages
    where topic = 'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral'
  ),
  0::bigint,
  'database events never leak into the client-writable ephemeral topic'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (
    select jsonb_array_length(snapshot -> 'messages')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  100,
  'an initial snapshot contains only the latest 100 messages'
);
select is(
  (
    select (snapshot #>> '{messages,0,seqNo}') || '/'
      || (snapshot #>> '{messages,99,seqNo}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  '106/205',
  'the initial message window is returned in ascending order'
);
select is(
  (
    select (snapshot #>> '{cursors,eventCursor}') || '/'
      || (snapshot #>> '{cursors,latestMessageSeq}') || '/'
      || (snapshot #>> '{cursors,oldestMessageSeq}') || '/'
      || (snapshot #>> '{cursors,hasMoreMessagesBefore}') || '/'
      || (snapshot #>> '{cursors,hasMoreMessagesAfter}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  '205/205/106/true/false',
  'the initial snapshot publishes authoritative message and event cursors'
);
select is(
  (
    select jsonb_array_length(snapshot -> 'events')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  0,
  'a fresh snapshot does not replay redundant historical events'
);
select is(
  (
    select (snapshot #>> '{connectedParticipantCount}') || '/'
      || jsonb_array_length(snapshot -> 'participants')::text
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  '1/3',
  'durable heartbeat state deduplicates devices and omits removed members'
);
select is(
  (
    select snapshot #>> '{participants,0,connectionStatus}'
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'ONLINE',
  'the recently heartbeating host is online in the snapshot'
);
select is(
  (
    select (snapshot #>> '{actor,role}') || '/'
      || (snapshot #>> '{actor,actualParticipation}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'HOST/true',
  'the snapshot carries the current actor role and actual participation'
);
select is(
  (
    select (snapshot #>> '{realtime,eventTopic}') || '/'
      || (snapshot #>> '{realtime,ephemeralTopic}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'session:a0400000-0000-4000-8000-000000000001:v3/session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
  'the sync response derives both private topics from the current epoch'
);
select ok(
  (
    select private.public_jsonb_keys_allowed(snapshot)
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  ),
  'the entire participant-facing snapshot passes the public key guard'
);
select is(
  (
    select jsonb_array_length(snapshot -> 'messages')::text || '/'
      || jsonb_array_length(snapshot -> 'events')::text
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 200, 200, 100
    )
  ),
  '5/5',
  'reconnect returns only messages and events after the known cursors'
);
select is(
  (
    select (snapshot #>> '{events,0,eventCursor}') || '/'
      || (snapshot #>> '{events,4,eventCursor}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 200, 200, 100
    )
  ),
  '201/205',
  'missed events are ordered by their durable cursor'
);
select is(
  (
    select (snapshot #>> '{cursors,hasMoreMessagesAfter}') || '/'
      || (snapshot #>> '{cursors,hasMoreEventsAfter}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 200, 200, 100
    )
  ),
  'false/false',
  'the reconnect response marks a fully consumed gap'
);
select is(
  (
    select jsonb_array_length(snapshot -> 'events')::text || '/'
      || (snapshot #>> '{cursors,hasMoreEventsAfter}')
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 1, 205, 100
    )
  ),
  '200/true',
  'large event gaps are bounded and explicitly paginated'
);
select is(
  (
    select jsonb_array_length(page -> 'messages')::text || '/'
      || (page #>> '{page,oldestMessageSeq}') || '/'
      || (page #>> '{page,newestMessageSeq}') || '/'
      || (page #>> '{page,hasMoreBefore}')
    from public.get_session_message_page(
      'a0300000-0000-4000-8000-000000000001', null, 50
    )
  ),
  '50/156/205/true',
  'the default history page returns the latest 50 messages'
);
select is(
  (
    select jsonb_array_length(page -> 'messages')::text || '/'
      || (page #>> '{page,oldestMessageSeq}') || '/'
      || (page #>> '{page,newestMessageSeq}') || '/'
      || (page #>> '{page,hasMoreBefore}')
    from public.get_session_message_page(
      'a0300000-0000-4000-8000-000000000001', 6, 50
    )
  ),
  '5/1/5/false',
  'a before-seq page reaches the beginning without losing order'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (
    select snapshot #>> '{actor,membershipStatus}'
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 1
    )
  ),
  'REGISTERED',
  'an active registered member can synchronize before actual participation'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok(
  $$
    select * from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  $$,
  '42501',
  'session_read_forbidden',
  'an outsider cannot read an active session snapshot'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok(
  $$
    select * from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000001', 0, 0, 100
    )
  $$,
  '42501',
  'session_read_forbidden',
  'a removed participant cannot recover the active session'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (
    select (snapshot -> 'realtime')::text || '/'
      || jsonb_array_length(snapshot -> 'participants')::text
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000002', 0, 0, 100
    )
  ),
  'null/1',
  'the host can reopen an ended room without receiving a realtime topic'
);
select is(
  (
    select jsonb_array_length(page -> 'messages')
    from public.get_session_message_page(
      'a0300000-0000-4000-8000-000000000002', null, 50
    )
  ),
  0,
  'the host can page the ended room in read-only mode'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(
  (
    select snapshot #>> '{actor,actualParticipation}'
    from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000002', 0, 0, 100
    )
  ),
  'true',
  'an actual participant keeps ended-room read access'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$
    select * from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000002', 0, 0, 100
    )
  $$,
  '42501',
  'session_read_forbidden',
  'a registered no-show cannot read the ended room'
);

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$
    select * from public.get_session_sync(
      'a0300000-0000-4000-8000-000000000003', 0, 0, 100
    )
  $$,
  '55000',
  'room_canceled',
  'a canceled room exposes no session snapshot'
);

set local role authenticated;
select set_config(
  'realtime.topic',
  'session:a0400000-0000-4000-8000-000000000001:v3',
  true
);

select ok(
  public.authorize_session_realtime_topic(
    'session:a0400000-0000-4000-8000-000000000001:v3', false
  ),
  'an active member is authorized for the current official topic'
);
select ok(
  public.authorize_session_realtime_topic(
    'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral', true
  ),
  'an active member is authorized for the current ephemeral topic'
);
select ok(
  not public.authorize_session_realtime_topic(
    'session:a0400000-0000-4000-8000-000000000001:v2', false
  ),
  'a stale channel epoch is rejected'
);
select is(
  (select count(*) from realtime.messages),
  205::bigint,
  'the official receive policy exposes only the requested official topic'
);
select throws_ok(
  $$
    insert into realtime.messages (topic, extension, event, private, payload)
    values (
      'session:a0400000-0000-4000-8000-000000000001:v3',
      'broadcast', 'session_event', true, '{"forged":true}'::jsonb
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'participants cannot forge an official session event'
);

select set_config(
  'realtime.topic',
  'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
  true
);
select lives_ok(
  $$
    insert into realtime.messages (topic, extension, event, private, payload)
    values (
      'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
      'presence', null, true, '{}'::jsonb
    )
  $$,
  'an active member can publish Presence only on the ephemeral topic'
);
select lives_ok(
  $$
    insert into realtime.messages (topic, extension, event, private, payload)
    values (
      'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
      'broadcast', 'typing', true, '{"typing":true}'::jsonb
    )
  $$,
  'an active member can publish typing on the ephemeral topic'
);
select is(
  (select count(*) from realtime.messages),
  2::bigint,
  'the ephemeral receive policy exposes only ephemeral Presence and typing rows'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select set_config(
  'realtime.topic',
  'session:a0400000-0000-4000-8000-000000000001:v3',
  true
);
select ok(
  not public.authorize_session_realtime_topic(
    'session:a0400000-0000-4000-8000-000000000001:v3', false
  ),
  'an outsider is not authorized for the official topic'
);
select is(
  (select count(*) from realtime.messages),
  0::bigint,
  'an outsider receives no official broadcasts'
);

select set_config(
  'realtime.topic',
  'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
  true
);
select throws_ok(
  $$
    insert into realtime.messages (topic, extension, event, private, payload)
    values (
      'session:a0400000-0000-4000-8000-000000000001:v3:ephemeral',
      'broadcast', 'typing', true, '{"typing":true}'::jsonb
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "messages"',
  'an outsider cannot publish ephemeral signals'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select ok(
  not public.authorize_session_realtime_topic(
    'session:a0400000-0000-4000-8000-000000000002:v1', false
  ),
  'an ended session cannot be rejoined as a realtime channel'
);

select * from finish();
rollback;
