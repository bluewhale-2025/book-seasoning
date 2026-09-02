begin;

set local search_path = public, extensions;

select plan(43);

select has_function(
  'public', 'append_session_message', array['uuid', 'uuid', 'text', 'uuid'],
  'atomic participant message command exists'
);
select ok(
  has_function_privilege(
    'authenticated', 'public.append_session_message(uuid,uuid,text,uuid)', 'EXECUTE'
  ),
  'authenticated actors can append through the command'
);
select ok(
  not has_function_privilege(
    'anon', 'public.append_session_message(uuid,uuid,text,uuid)', 'EXECUTE'
  ),
  'anonymous actors cannot append messages'
);
select ok(
  not has_table_privilege('authenticated', 'public.messages', 'INSERT'),
  'authenticated actors cannot bypass message append invariants'
);
select ok(
  not has_table_privilege('authenticated', 'public.messages', 'UPDATE'),
  'participants cannot edit confirmed messages directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.messages', 'DELETE'),
  'participants cannot delete confirmed messages directly'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('90000000-0000-4000-8000-000000000001', 'message-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"가입 당시 방장"}'::jsonb),
  ('90000000-0000-4000-8000-000000000002', 'message-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"답장 참가자"}'::jsonb),
  ('90000000-0000-4000-8000-000000000003', 'message-registered@example.test', 'authenticated', 'authenticated', '{"profile_name":"접속 전 참가자"}'::jsonb),
  ('90000000-0000-4000-8000-000000000004', 'message-outsider@example.test', 'authenticated', 'authenticated', '{"profile_name":"외부 사용자"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values ('90100000-0000-4000-8000-000000000001', '메시지 테스트 책', '메시지 작가', '양념 출판사', 2026);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  '90200000-0000-4000-8000-000000000001',
  '90100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', '메시지 테스트 Pack', timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  (
    '90300000-0000-4000-8000-000000000001', '진행 중인 메시지 방',
    '90200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '90000000-0000-4000-8000-000000000001'
  ),
  (
    '90300000-0000-4000-8000-000000000002', '예정 메시지 방',
    '90200000-0000-4000-8000-000000000001', timezone('utc', now()) + interval '1 day',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '90000000-0000-4000-8000-000000000001'
  ),
  (
    '90300000-0000-4000-8000-000000000003', '다른 세션 방',
    '90200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute',
    '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 5,
    '90000000-0000-4000-8000-000000000001'
  );

insert into public.session_runs (id, room_id, phase, phase_version, started_at)
values
  (
    '90400000-0000-4000-8000-000000000001',
    '90300000-0000-4000-8000-000000000001', 'OPENING', 1,
    timezone('utc', now()) - interval '1 minute'
  ),
  (
    '90400000-0000-4000-8000-000000000002',
    '90300000-0000-4000-8000-000000000002', 'SCHEDULED', 0, null
  ),
  (
    '90400000-0000-4000-8000-000000000003',
    '90300000-0000-4000-8000-000000000003', 'OPENING', 1,
    timezone('utc', now()) - interval '1 minute'
  );

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot
) values
  ('90300000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'PARTICIPATED', '가입 당시 방장'),
  ('90300000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002', 'PARTICIPATED', '답장 참가자'),
  ('90300000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000003', 'REGISTERED', '접속 전 참가자'),
  ('90300000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'PARTICIPATED', '가입 당시 방장'),
  ('90300000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000001', 'PARTICIPATED', '가입 당시 방장');

insert into public.messages (
  id, session_id, seq_no, kind, author_user_id,
  author_profile_name_snapshot, client_message_id, body
) values (
  '90500000-0000-4000-8000-000000000099',
  '90400000-0000-4000-8000-000000000003', 1, 'PARTICIPANT',
  '90000000-0000-4000-8000-000000000001', '다른 세션 작성자',
  '90600000-0000-4000-8000-000000000099', '다른 세션의 메시지'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select profile_name from public.update_my_profile('작성 시점 방장')),
  '작성 시점 방장',
  'the actor can change their profile name before writing'
);

select is(
  (
    select seq_no
    from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001',
      E'첫 줄\n둘째 줄', null
    )
  ),
  1::bigint,
  'the first confirmed message receives sequence one'
);

select is(
  (
    select kind || '/' || author_profile_name || '/' || duplicate::text
    from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001',
      E'첫 줄\n둘째 줄', null
    )
  ),
  'PARTICIPANT/작성 시점 방장/true',
  'an idempotent response preserves the participant author snapshot'
);

reset role;

select set_config(
  'test.first_message_id',
  (
    select id::text from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 1
  ),
  true
);

select is(
  (
    select last_message_seq::text || '/' || aggregate_version::text || '/' || last_event_seq::text
    from public.session_runs
    where id = '90400000-0000-4000-8000-000000000001'
  ),
  '1/1/1',
  'message, aggregate, and event cursors advance atomically'
);
select is(
  (
    select author_profile_name_snapshot
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
  ),
  '작성 시점 방장',
  'the message uses the current profile rather than the membership snapshot'
);
select is(
  (
    select public_payload #>> '{message,author,profileName}'
    from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_seq = 1
  ),
  '작성 시점 방장',
  'the public message event carries the same author snapshot'
);
select ok(
  (
    select private.public_jsonb_keys_allowed(public_payload)
    from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_seq = 1
  ),
  'the committed message event passes the public payload key guard'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select duplicate
    from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001',
      E'첫 줄\n둘째 줄', null
    )
  ),
  true,
  'retrying the same client message id returns the prior commit'
);
select is(
  (
    select aggregate_version::text || '/' || event_cursor::text
    from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001',
      E'첫 줄\n둘째 줄', null
    )
  ),
  '1/1',
  'an idempotent retry returns the original event position'
);

reset role;

select is(
  (
    select count(*) from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'retries do not duplicate confirmed messages'
);
select is(
  (
    select count(*) from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_type = 'MESSAGE_APPENDED'
  ),
  1::bigint,
  'retries do not duplicate message events'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001',
      '같은 id의 바뀐 본문', null
    )
  $$,
  'P0001',
  'command_payload_mismatch',
  'a client message id cannot be reused with another body'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select seq_no
    from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000002',
      '원문의 관점에 답합니다.',
      current_setting('test.first_message_id')::uuid
    )
  ),
  2::bigint,
  'an inline reply receives the next session sequence'
);

reset role;

select is(
  (
    select reply_to_message_id
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 2
  ),
  (
    select id
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 1
  ),
  'the inline reply preserves the original message reference'
);
select is(
  (
    select reply_author_profile_name_snapshot
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 2
  ),
  '작성 시점 방장',
  'the inline reply snapshots the original author name'
);
select is(
  (
    select reply_quote_snapshot
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 2
  ),
  E'첫 줄\n둘째 줄',
  'the inline reply snapshots the immutable original body'
);
select is(
  (
    select public_payload #>> '{message,reply,quote}'
    from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_seq = 2
  ),
  E'첫 줄\n둘째 줄',
  'the public event contains the same inline quote snapshot'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000002',
      '원문의 관점에 답합니다.', null
    )
  $$,
  'P0001',
  'command_payload_mismatch',
  'a reply retry cannot silently change its target'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select profile_name from public.update_my_profile('나중에 바꾼 방장')),
  '나중에 바꾼 방장',
  'the original author can change their profile later'
);

reset role;

select is(
  (
    select author_profile_name_snapshot
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 1
  ),
  '작성 시점 방장',
  'a later profile change does not rewrite the original message'
);
select is(
  (
    select reply_author_profile_name_snapshot
    from public.messages
    where session_id = '90400000-0000-4000-8000-000000000001'
      and seq_no = 2
  ),
  '작성 시점 방장',
  'a later profile change does not rewrite the inline reply snapshot'
);

select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000003',
      '다른 세션에 답장합니다.',
      '90500000-0000-4000-8000-000000000099'
    )
  $$,
  'P0002',
  'reply_message_not_found',
  'an inline reply cannot target another session'
);
select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000004',
      '없는 메시지에 답장합니다.',
      '90500000-0000-4000-8000-000000000098'
    )
  $$,
  'P0002',
  'reply_message_not_found',
  'an inline reply must target an existing confirmed message'
);
select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000005', '   ', null
    )
  $$,
  '22023',
  'message_body_invalid',
  'a blank message is rejected at the database boundary'
);
select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000006', repeat('가', 2001), null
    )
  $$,
  '22023',
  'message_body_invalid',
  'a message over 2000 characters is rejected at the database boundary'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000007', '아직 실제 참여 전입니다.', null
    )
  $$,
  '42501',
  'actual_participation_required',
  'a registered-only member cannot send before actual participation'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000008', '외부 메시지', null
    )
  $$,
  '42501',
  'actual_participation_required',
  'an outsider cannot append a session message'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000002',
      '90600000-0000-4000-8000-000000000009', '시작 전 메시지', null
    )
  $$,
  '55000',
  'message_write_not_allowed',
  'the scheduled phase does not accept participant messages'
);

reset role;
update public.session_runs set phase = 'CORE', phase_version = phase_version + 1
where id = '90400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select seq_no from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000010', 'Core 메시지', null
    )
  ),
  3::bigint,
  'the core phase accepts messages in sequence'
);

reset role;
update public.session_runs set phase = 'EXTENDED', phase_version = phase_version + 1
where id = '90400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select seq_no from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000011', '연장 메시지', null
    )
  ),
  4::bigint,
  'the extended phase accepts messages in sequence'
);

reset role;
update public.session_runs set phase = 'SYNTHESIS', phase_version = phase_version + 1
where id = '90400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select seq_no from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000012', '정리 단계 메시지', null
    )
  ),
  5::bigint,
  'the synthesis phase accepts messages in sequence'
);

reset role;
update public.session_runs set phase = 'CLOSING', phase_version = phase_version + 1
where id = '90400000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"90000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000013', 'Closing 메시지', null
    )
  $$,
  '55000',
  'message_write_not_allowed',
  'the closing phase blocks new discussion messages'
);
select is(
  (
    select duplicate from public.append_session_message(
      '90300000-0000-4000-8000-000000000001',
      '90600000-0000-4000-8000-000000000001', E'첫 줄\n둘째 줄', null
    )
  ),
  true,
  'a committed message can still be reconciled after the phase closes'
);

reset role;

select is(
  (
    select last_message_seq::text || '/' || aggregate_version::text || '/' || last_event_seq::text
    from public.session_runs
    where id = '90400000-0000-4000-8000-000000000001'
  ),
  '5/5/5',
  'five accepted messages leave all three authoritative cursors aligned'
);
select is(
  (
    select count(*) from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_type = 'MESSAGE_APPENDED'
  ),
  5::bigint,
  'every accepted message has one public append event'
);
select is(
  (
    select count(distinct public_payload #>> '{message,messageId}')
    from public.session_events
    where session_id = '90400000-0000-4000-8000-000000000001'
      and event_type = 'MESSAGE_APPENDED'
  ),
  5::bigint,
  'every append event identifies one distinct immutable message'
);
select is(
  (
    select count(*)
    from public.messages as message
    join public.session_events as event
      on event.session_id = message.session_id
     and event.event_type = 'MESSAGE_APPENDED'
     and event.public_payload #>> '{message,messageId}' = message.id::text
     and event.public_payload #>> '{message,body}' = message.body
    where message.session_id = '90400000-0000-4000-8000-000000000001'
  ),
  5::bigint,
  'message rows and participant-facing events contain the same immutable body'
);

select * from finish();
rollback;
