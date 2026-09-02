begin;

set local search_path = public, extensions;

select plan(34);

select has_table('public', 'session_connections', 'durable session connection table exists');
select has_table('public', 'messages', 'confirmed message table exists');
select has_table('public', 'session_events', 'session event cursor table exists');
select has_column('public', 'session_runs', 'aggregate_version', 'session aggregate version exists');
select has_column('public', 'session_runs', 'channel_epoch', 'private channel epoch exists');
select has_column('public', 'session_runs', 'last_message_seq', 'message cursor source exists');
select has_column('public', 'session_runs', 'last_event_seq', 'event cursor source exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_connections'::regclass),
  'session connections have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.messages'::regclass),
  'messages have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.session_events'::regclass),
  'session events have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.session_connections', 'SELECT'),
  'authenticated clients cannot read heartbeat rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'authenticated clients cannot bypass the future message command'
);
select ok(
  not has_table_privilege('authenticated', 'public.session_events', 'SELECT'),
  'authenticated clients recover events only through an authorized snapshot query'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('70000000-0000-4000-8000-000000000001', 'session-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"세션 방장"}'::jsonb),
  ('70000000-0000-4000-8000-000000000002', 'session-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"세션 참가자"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values ('70100000-0000-4000-8000-000000000001', '세션 기반 책', '세션 작가', '양념 출판사', 2026);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  '70200000-0000-4000-8000-000000000001',
  '70100000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  '세션 기반 Pack',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  (
    '70300000-0000-4000-8000-000000000001', '첫 세션 방',
    '70200000-0000-4000-8000-000000000001', timezone('utc', now()),
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '70000000-0000-4000-8000-000000000001'
  ),
  (
    '70300000-0000-4000-8000-000000000002', '둘째 세션 방',
    '70200000-0000-4000-8000-000000000001', timezone('utc', now()),
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '70000000-0000-4000-8000-000000000001'
  );

insert into public.session_runs (id, room_id)
values
  ('70400000-0000-4000-8000-000000000001', '70300000-0000-4000-8000-000000000001'),
  ('70400000-0000-4000-8000-000000000002', '70300000-0000-4000-8000-000000000002');

select is(
  (select aggregate_version from public.session_runs where id = '70400000-0000-4000-8000-000000000001'),
  0::bigint,
  'new sessions start before their first committed public event'
);
select is(
  (select channel_epoch from public.session_runs where id = '70400000-0000-4000-8000-000000000001'),
  1,
  'new sessions begin on private channel epoch one'
);

insert into public.session_connections (
  session_id, user_id, device_id, last_seen_at
) values
  (
    '70400000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '70500000-0000-4000-8000-000000000001',
    timezone('utc', now())
  ),
  (
    '70400000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '70500000-0000-4000-8000-000000000002',
    timezone('utc', now())
  );

select is(
  (
    select count(distinct user_id)
    from public.session_connections
    where session_id = '70400000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'two devices remain one connected participant for server decisions'
);

select throws_ok(
  $$
    insert into public.session_connections (session_id, user_id, device_id)
    values (
      '70400000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000001',
      '70500000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "session_connections_device_unique"',
  'the same device heartbeat has one durable row'
);

select throws_ok(
  $$
    insert into public.session_connections (
      session_id, user_id, device_id, last_seen_at, disconnected_at
    ) values (
      '70400000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000002',
      '70500000-0000-4000-8000-000000000003',
      timezone('utc', now()),
      timezone('utc', now()) - interval '1 minute'
    )
  $$,
  '23514',
  'new row for relation "session_connections" violates check constraint "session_connections_disconnect_order_check"',
  'disconnect time cannot precede the last heartbeat'
);

insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body
) values (
  '70600000-0000-4000-8000-000000000001',
  '70400000-0000-4000-8000-000000000001',
  1,
  'PARTICIPANT',
  '70000000-0000-4000-8000-000000000001',
  '세션 방장',
  '70700000-0000-4000-8000-000000000001',
  '첫 번째로 확정된 메시지'
);

select is(
  (select body from public.messages where id = '70600000-0000-4000-8000-000000000001'),
  '첫 번째로 확정된 메시지',
  'a confirmed participant message is stored as raw data'
);

select throws_ok(
  $$
    insert into public.messages (
      session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, client_message_id, body
    ) values (
      '70400000-0000-4000-8000-000000000001', 2, 'PARTICIPANT',
      '70000000-0000-4000-8000-000000000001', '세션 방장',
      '70700000-0000-4000-8000-000000000002', repeat('가', 2001)
    )
  $$,
  '23514',
  'new row for relation "messages" violates check constraint "messages_body_check"',
  'message bodies cannot exceed 2000 characters'
);

select throws_ok(
  $$
    insert into public.messages (
      session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, client_message_id, body
    ) values (
      '70400000-0000-4000-8000-000000000001', 2, 'PARTICIPANT',
      '70000000-0000-4000-8000-000000000001', '세션 방장',
      '70700000-0000-4000-8000-000000000001', '재시도로 온 중복 메시지'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "messages_participant_idempotency_idx"',
  'the same client message id cannot be confirmed twice for one author'
);

insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body,
  reply_to_message_id, reply_author_profile_name_snapshot, reply_quote_snapshot
) values (
  '70600000-0000-4000-8000-000000000002',
  '70400000-0000-4000-8000-000000000001',
  2,
  'PARTICIPANT',
  '70000000-0000-4000-8000-000000000002',
  '세션 참가자',
  '70700000-0000-4000-8000-000000000001',
  '같은 client id라도 다른 참가자의 메시지입니다.',
  '70600000-0000-4000-8000-000000000001',
  '세션 방장',
  '첫 번째로 확정된 메시지'
);

select is(
  (select reply_to_message_id from public.messages where id = '70600000-0000-4000-8000-000000000002'),
  '70600000-0000-4000-8000-000000000001'::uuid,
  'an inline reply preserves its target in the same session'
);

select throws_ok(
  $$
    insert into public.messages (
      session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, client_message_id, body,
      reply_to_message_id, reply_author_profile_name_snapshot, reply_quote_snapshot
    ) values (
      '70400000-0000-4000-8000-000000000002', 1, 'PARTICIPANT',
      '70000000-0000-4000-8000-000000000002', '세션 참가자',
      '70700000-0000-4000-8000-000000000003', '다른 세션 메시지에 답장 시도',
      '70600000-0000-4000-8000-000000000001', '세션 방장', '잘못된 세션의 인용'
    )
  $$,
  '23503',
  'insert or update on table "messages" violates foreign key constraint "messages_reply_same_session_fk"',
  'an inline reply cannot target another session'
);

select throws_ok(
  $$
    insert into public.messages (
      session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, client_message_id, body
    ) values (
      '70400000-0000-4000-8000-000000000001', 2, 'PARTICIPANT',
      '70000000-0000-4000-8000-000000000002', '세션 참가자',
      '70700000-0000-4000-8000-000000000004', '중복 순서 메시지'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "messages_session_seq_unique"',
  'message sequence is unique inside a session'
);

select throws_ok(
  $$
    insert into public.messages (
      session_id, seq_no, kind, author_user_id,
      author_profile_name_snapshot, body
    ) values (
      '70400000-0000-4000-8000-000000000001', 3, 'AI_HOST',
      '70000000-0000-4000-8000-000000000001', 'AI Host', '잘못된 AI 작성자'
    )
  $$,
  '23514',
  'new row for relation "messages" violates check constraint "messages_kind_actor_check"',
  'AI Host messages cannot impersonate a user'
);

insert into public.session_events (
  id, session_id, event_seq, aggregate_version, channel_epoch,
  event_type, public_payload
) values
  (
    '70800000-0000-4000-8000-000000000001',
    '70400000-0000-4000-8000-000000000001',
    1, 1, 1, 'SESSION_STATE_CHANGED', '{"phase":"OPENING"}'::jsonb
  ),
  (
    '70800000-0000-4000-8000-000000000002',
    '70400000-0000-4000-8000-000000000001',
    2, 1, 1, 'SESSION_PARTICIPANT_CHANGED', '{"participantCount":2}'::jsonb
  );

select is(
  (select count(*) from public.session_events where aggregate_version = 1),
  2::bigint,
  'one aggregate commit may produce more than one ordered public event'
);

select throws_ok(
  $$
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch, event_type
    ) values (
      '70400000-0000-4000-8000-000000000001', 2, 2, 1, 'MESSAGE_APPENDED'
    )
  $$,
  '23505',
  'duplicate key value violates unique constraint "session_events_cursor_unique"',
  'event cursor is unique inside a session'
);

select throws_ok(
  $$
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload
    ) values (
      '70400000-0000-4000-8000-000000000001', 3, 2, 1,
      'MESSAGE_APPENDED', '[]'::jsonb
    )
  $$,
  '23514',
  'new row for relation "session_events" violates check constraint "session_events_public_payload_check"',
  'public event payload must be an object'
);

select throws_ok(
  $$
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload
    ) values (
      '70400000-0000-4000-8000-000000000001', 3, 2, 1,
      'MESSAGE_APPENDED', '{"aiPrivateBody":"canary"}'::jsonb
    )
  $$,
  '23514',
  'new row for relation "session_events" violates check constraint "session_events_public_payload_check"',
  'public event payload rejects direct private fields'
);

select throws_ok(
  $$
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload
    ) values (
      '70400000-0000-4000-8000-000000000001', 3, 2, 1,
      'MESSAGE_APPENDED', '{"message":{"accessToken":"canary"}}'::jsonb
    )
  $$,
  '23514',
  'new row for relation "session_events" violates check constraint "session_events_public_payload_check"',
  'public event payload rejects nested secret fields'
);

select ok(
  private.public_jsonb_keys_allowed(
    '{"state":{"extensionPromptedAt":"2026-09-01T12:23:00.000Z"}}'::jsonb
  ),
  'the DB privacy guard accepts public deadline metadata'
);

select has_index(
  'public', 'messages', 'messages_participant_idempotency_idx',
  'participant message retry has a dedicated unique index'
);

select has_index(
  'public', 'session_connections', 'session_connections_active_idx',
  'active heartbeat lookup has a dedicated index'
);

select has_index(
  'public', 'session_events', 'session_events_cursor_idx',
  'event cursor recovery has a dedicated index'
);

select * from finish();
rollback;
