begin;

set local search_path = public, extensions;

select plan(20);

select has_table(
  'private',
  'room_password_rate_limit_config',
  'durable password limiter configuration exists'
);

select has_function(
  'public',
  'get_room_join_challenge',
  array['uuid', 'uuid'],
  'join challenge function exists'
);
select has_function(
  'public',
  'authorize_room_join',
  array['uuid', 'uuid', 'integer', 'text'],
  'join authorization function exists'
);
select has_function(
  'public',
  'record_room_password_failure',
  array['uuid', 'uuid'],
  'durable password failure function exists'
);
select has_function(
  'public',
  'join_room',
  array['uuid', 'text', 'uuid', 'text'],
  'atomic join command exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_room_join_challenge(uuid,uuid)',
    'EXECUTE'
  ),
  'browser clients cannot read the Argon2 hash'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.authorize_room_join(uuid,uuid,integer,text)',
    'EXECUTE'
  ),
  'browser clients cannot mint join authorizations'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('50000000-0000-4000-8000-000000000001', 'join-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"참가 방장"}'::jsonb),
  ('50000000-0000-4000-8000-000000000002', 'join-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"참가 회원"}'::jsonb),
  ('50000000-0000-4000-8000-000000000003', 'join-full@example.test', 'authenticated', 'authenticated', '{"profile_name":"정원 경쟁자"}'::jsonb),
  ('50000000-0000-4000-8000-000000000004', 'join-limit@example.test', 'authenticated', 'authenticated', '{"profile_name":"제한 회원"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values (
  '51000000-0000-4000-8000-000000000001',
  '참가 테스트 책',
  '참가 작가',
  '양념 출판사',
  2026
);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  '52000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  '참가 테스트 Pack',
  timezone('utc', now())
);

select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table join_room_fixture as
select *
from public.create_room(
  '53000000-0000-4000-8000-000000000001',
  'create-join-room-fingerprint',
  '참가 테스트 방',
  '52000000-0000-4000-8000-000000000001',
  timezone('utc', now()) + interval '1 day',
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  2
);
grant select on join_room_fixture to authenticated, service_role;

select throws_ok(
  $$
    select * from public.create_room(
      '53000000-0000-4000-8000-000000000001',
      'different-create-fingerprint',
      '다른 요청',
      '52000000-0000-4000-8000-000000000001',
      timezone('utc', now()) + interval '1 day',
      '$argon2id$invalid',
      2,
      2
    )
  $$,
  '40001',
  'command_payload_mismatch',
  'same command id with a different payload is rejected'
);

reset role;
set local role service_role;

select is(
  (
    select challenge_state
    from public.get_room_join_challenge(
      '50000000-0000-4000-8000-000000000002',
      (select room_id from join_room_fixture)
    )
  ),
  'PASSWORD_REQUIRED',
  'a new member must pass the room password'
);
select is(
  (
    select password_version
    from public.get_room_join_challenge(
      '50000000-0000-4000-8000-000000000002',
      (select room_id from join_room_fixture)
    )
  ),
  1,
  'challenge pins the password version'
);

select public.authorize_room_join(
  '50000000-0000-4000-8000-000000000002',
  (select room_id from join_room_fixture),
  1,
  encode(extensions.digest('member-valid-token', 'sha256'), 'hex')
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table member_join_result as
select *
from public.join_room(
  '53000000-0000-4000-8000-000000000002',
  'member-join-fingerprint',
  (select room_id from join_room_fixture),
  'member-valid-token'
);

select is(
  (select membership_status from member_join_result),
  'REGISTERED',
  'a scheduled-room join creates a registered membership'
);
select is(
  (select participant_count from member_join_result),
  2::bigint,
  'the host and new member fill the two-person room'
);
select is(
  (select aggregate_version from member_join_result),
  2,
  'membership mutation advances the room version'
);
select is(
  (
    select duplicate
    from public.join_room(
      '53000000-0000-4000-8000-000000000002',
      'member-join-fingerprint',
      (select room_id from join_room_fixture),
      null
    )
  ),
  true,
  'repeating the same join command returns its stored result'
);
select throws_ok(
  $$
    select * from public.join_room(
      '53000000-0000-4000-8000-000000000002',
      'changed-member-join-fingerprint',
      (select room_id from join_room_fixture),
      null
    )
  $$,
  '40001',
  'command_payload_mismatch',
  'join idempotency rejects a changed payload'
);

reset role;
set local role service_role;

select public.authorize_room_join(
  '50000000-0000-4000-8000-000000000003',
  (select room_id from join_room_fixture),
  1,
  encode(extensions.digest('full-room-token', 'sha256'), 'hex')
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select * from public.join_room(
      '53000000-0000-4000-8000-000000000003',
      'full-room-fingerprint',
      (select room_id from join_room_fixture),
      'full-room-token'
    )
  $$,
  '40001',
  'room_capacity_reached',
  'capacity is checked while the room row is locked'
);

reset role;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select membership_status
    from public.join_room(
      '53000000-0000-4000-8000-000000000004',
      'existing-member-reentry',
      (select room_id from join_room_fixture),
      null
    )
  ),
  'REGISTERED',
  'an existing member re-enters without password even when full'
);

reset role;
set local role service_role;

select public.record_room_password_failure(
  '50000000-0000-4000-8000-000000000004',
  (select room_id from join_room_fixture)
)
from generate_series(1, 5);

select throws_ok(
  format(
    'select * from public.get_room_join_challenge(%L, %L)',
    '50000000-0000-4000-8000-000000000004',
    (select room_id from join_room_fixture)
  ),
  'P0001',
  'room_password_rate_limited',
  'five failures in one minute activate the durable actor-room limiter'
);

select is(
  (
    select count(*)
    from public.room_memberships
    where room_id = (select room_id from join_room_fixture)
      and status in ('REGISTERED', 'PARTICIPATED')
  ),
  2::bigint,
  'failed and capacity-rejected attempts do not consume seats'
);

reset role;

select is(
  (
    select count(*)
    from private.room_join_authorizations
    where expires_at > timezone('utc', now())
  ),
  1::bigint,
  'a capacity failure leaves only its short-lived retry authorization'
);

select * from finish();

rollback;
