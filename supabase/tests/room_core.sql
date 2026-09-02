begin;

set local search_path = public, extensions;

select plan(17);

select has_table('public', 'rooms', 'rooms table exists');
select has_table('public', 'room_memberships', 'room memberships table exists');
select has_table('public', 'session_runs', 'session runs table exists');
select has_function(
  'public',
  'create_room',
  array['uuid', 'text', 'text', 'uuid', 'timestamp with time zone', 'text', 'integer', 'integer'],
  'create room command exists'
);
select has_function(
  'public',
  'search_rooms',
  array['text', 'integer'],
  'room search query exists'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  '30000000-0000-4000-8000-000000000001',
  'room-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"방장 이름"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  '31000000-0000-4000-8000-000000000001',
  '방을 위한 책',
  '방 작가',
  '양념 출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  '32000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  '방 생성용 공개 Pack',
  timezone('utc', now())
);

select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table created_room_result as
select *
from public.create_room(
  '33000000-0000-4000-8000-000000000001',
  'fingerprint-create-room',
  '  첫 번째 방  ',
  '32000000-0000-4000-8000-000000000001',
  timezone('utc', now()) + interval '1 day',
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5
);

create temporary table duplicate_room_result as
select *
from public.create_room(
  '33000000-0000-4000-8000-000000000001',
  'fingerprint-create-room',
  '첫 번째 방',
  '32000000-0000-4000-8000-000000000001',
  timezone('utc', now()) + interval '1 day',
  '$argon2id$v=19$m=19456,p=1,t=2$another$hash',
  2,
  5
);

reset role;

select is((select count(*) from public.rooms), 1::bigint, 'one room was created');
select is(
  (select duplicate from duplicate_room_result),
  true,
  'the same command id returns a duplicate result'
);
select is(
  (select room_id from duplicate_room_result),
  (select room_id from created_room_result),
  'duplicate command returns the original room'
);
select is((select title from public.rooms), '첫 번째 방', 'room title is trimmed');
select is(
  (select host_user_id from public.rooms),
  '30000000-0000-4000-8000-000000000001'::uuid,
  'authenticated actor becomes the host'
);
select is(
  (select count(*) from public.room_memberships where status = 'REGISTERED'),
  1::bigint,
  'host membership is created atomically'
);
select is(
  (select profile_name_snapshot from public.room_memberships),
  '방장 이름',
  'host membership snapshots the current profile name'
);
select is(
  (select phase from public.session_runs),
  'SCHEDULED',
  'scheduled session is created atomically'
);
select is(
  (select participant_count from public.search_rooms('방을 위한 책', 20)),
  1::bigint,
  'room search includes the host in participant count'
);
select is(
  (select availability from public.search_rooms('', 20)),
  'OPEN',
  'room search reports capacity separately from phase'
);
select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'search_rooms'
      and column_name = 'password_hash'
  ),
  'room search contract has no password hash field'
);
select throws_ok(
  $$
    select * from public.create_room(
      '33000000-0000-4000-8000-000000000002',
      'fingerprint-invalid-capacity',
      '잘못된 정원',
      '32000000-0000-4000-8000-000000000001',
      timezone('utc', now()),
      '$argon2id$invalid',
      1,
      16
    )
  $$,
  '22023',
  'invalid_room_capacity',
  'invalid capacity is rejected before mutation'
);

select * from finish();

rollback;
