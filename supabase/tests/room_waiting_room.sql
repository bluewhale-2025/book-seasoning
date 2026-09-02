begin;

set local search_path = public, extensions;

select plan(40);

select has_table('public', 'prep_entries', 'public prep metadata table exists');
select has_table('private', 'ai_private_prep_bodies', 'private prep body table exists');
select has_function('public', 'update_room', array['uuid','text','uuid','integer','text','uuid','timestamp with time zone','text','integer','integer'], 'room update command exists');
select has_function('public', 'cancel_room_membership', array['uuid','text','uuid','integer'], 'membership cancel command exists');
select has_function('public', 'cancel_room', array['uuid','text','uuid','integer'], 'room cancel command exists');
select has_function('public', 'transfer_room_host', array['uuid','text','uuid','integer','uuid'], 'host transfer command exists');
select has_function('public', 'remove_room_member', array['uuid','text','uuid','integer','uuid'], 'member removal command exists');
select has_function('public', 'list_my_rooms', array[]::text[], 'my rooms query exists');
select has_function('public', 'list_room_prep', array['uuid'], 'prep query exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.prep_entries'::regclass),
  'prep entries have RLS enabled'
);
select ok(
  not has_table_privilege('authenticated', 'public.prep_entries', 'SELECT'),
  'authenticated clients cannot bypass prep visibility through direct select'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values
  ('60000000-0000-4000-8000-000000000001', 'waiting-host@example.test', 'authenticated', 'authenticated', '{"profile_name":"대기 방장"}'::jsonb),
  ('60000000-0000-4000-8000-000000000002', 'waiting-member@example.test', 'authenticated', 'authenticated', '{"profile_name":"대기 회원"}'::jsonb),
  ('60000000-0000-4000-8000-000000000003', 'waiting-remove@example.test', 'authenticated', 'authenticated', '{"profile_name":"내보낼 회원"}'::jsonb),
  ('60000000-0000-4000-8000-000000000004', 'waiting-outsider@example.test', 'authenticated', 'authenticated', '{"profile_name":"외부 회원"}'::jsonb);

insert into public.books (id, title, author, publisher, publication_year)
values
  ('61000000-0000-4000-8000-000000000001', '대기실 책', '대기 작가', '양념 출판사', 2026),
  ('61000000-0000-4000-8000-000000000002', '바꿀 책', '다른 작가', '양념 출판사', 2026);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 1, 'PUBLISHED', '1', '대기실 Pack', timezone('utc', now())),
  ('62000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 1, 'PUBLISHED', '1', '다른 Pack', timezone('utc', now()));

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  '63000000-0000-4000-8000-000000000001',
  '대기실 테스트 방',
  '62000000-0000-4000-8000-000000000001',
  timezone('utc', now()) + interval '1 day',
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2,
  5,
  '60000000-0000-4000-8000-000000000001'
);
insert into public.session_runs (room_id)
values ('63000000-0000-4000-8000-000000000001');
insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot
) values
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'REGISTERED', '대기 방장'),
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', 'REGISTERED', '대기 회원'),
  ('63000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000003', 'REGISTERED', '내보낼 회원');

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (
    select aggregate_version from public.update_room(
      '64000000-0000-4000-8000-000000000001',
      'update-room-fingerprint',
      '63000000-0000-4000-8000-000000000001',
      1,
      '수정된 대기실 방',
      null,
      null,
      '$argon2id$v=19$m=19456,p=1,t=2$newtestsalt$newtesthash',
      null,
      null
    )
  ),
  2,
  'host updates room settings with the expected aggregate version'
);

reset role;

select is(
  (select password_version from public.rooms where id = '63000000-0000-4000-8000-000000000001'),
  2,
  'changing the password advances its independent version'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.update_room(
      '64000000-0000-4000-8000-000000000002',
      'locked-book-fingerprint',
      '63000000-0000-4000-8000-000000000001',
      2,
      null,
      '62000000-0000-4000-8000-000000000002',
      null,
      null,
      null,
      null
    )
  $$,
  '55000',
  'room_book_locked_by_membership',
  'book cannot change after another member registers'
);

select is(
  (select revision from public.upsert_room_prep(
    '64000000-0000-4000-8000-000000000010', 'host-public-prep',
    '63000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000001', null,
    'QUOTE_THOUGHT', 'PUBLIC', '공개하고 싶은 문장과 생각'
  )),
  1,
  'host creates a public prep entry'
);
select is(
  (select revision from public.upsert_room_prep(
    '64000000-0000-4000-8000-000000000011', 'host-private-prep',
    '63000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000002', null,
    'DISCUSSION_QUESTION', 'AI_PRIVATE', '방장만 다시 볼 비공개 질문'
  )),
  1,
  'host creates a private prep entry'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select revision from public.upsert_room_prep(
    '64000000-0000-4000-8000-000000000012', 'member-public-prep',
    '63000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000003', null,
    'IMPRESSIVE_PART', 'PUBLIC', '회원이 공개한 인상 깊은 장면'
  )),
  1,
  'member creates a public prep entry'
);
select is(
  (select revision from public.upsert_room_prep(
    '64000000-0000-4000-8000-000000000013', 'member-private-prep',
    '63000000-0000-4000-8000-000000000001',
    '65000000-0000-4000-8000-000000000004', null,
    'DISCUSSION_QUESTION', 'AI_PRIVATE', '회원 본인과 AI만 볼 질문'
  )),
  1,
  'member creates a private prep entry'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.list_room_prep('63000000-0000-4000-8000-000000000001')),
  3::bigint,
  'host sees all public entries and only the host private entry'
);
select is(
  (
    select count(*) from public.list_room_prep('63000000-0000-4000-8000-000000000001')
    where body = '회원 본인과 AI만 볼 질문'
  ),
  0::bigint,
  'host cannot see another member private body'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select count(*) from public.list_room_prep('63000000-0000-4000-8000-000000000001')),
  3::bigint,
  'member sees public entries and only the member private entry'
);

reset role;

select is(
  (
    select count(*) from public.prep_entries
    where visibility = 'AI_PRIVATE' and public_body is null
  ),
  2::bigint,
  'AI_PRIVATE bodies are absent from public rows'
);
select is(
  (select count(*) from private.ai_private_prep_bodies),
  2::bigint,
  'AI_PRIVATE bodies live only in the private schema'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$
    select * from public.upsert_room_prep(
      '64000000-0000-4000-8000-000000000014', 'other-author-prep',
      '63000000-0000-4000-8000-000000000001',
      '65000000-0000-4000-8000-000000000004', 1,
      'DISCUSSION_QUESTION', 'PUBLIC', '다른 작성자의 항목 수정 시도'
    )
  $$,
  '42501',
  'prep_author_required',
  'a participant cannot mutate another author private entry'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ select * from public.list_room_members('63000000-0000-4000-8000-000000000001') $$,
  '42501',
  'room_membership_required',
  'an outsider cannot enumerate room members'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select aggregate_version from public.transfer_room_host(
    '64000000-0000-4000-8000-000000000020', 'transfer-host-fingerprint',
    '63000000-0000-4000-8000-000000000001', 2,
    '60000000-0000-4000-8000-000000000002'
  )),
  3,
  'host transfers authority to a registered member'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select aggregate_version from public.remove_room_member(
    '64000000-0000-4000-8000-000000000021', 'remove-member-fingerprint',
    '63000000-0000-4000-8000-000000000001', 3,
    '60000000-0000-4000-8000-000000000003'
  )),
  4,
  'new host removes a registered member atomically'
);

reset role;

select is(
  (
    select status from public.room_memberships
    where room_id = '63000000-0000-4000-8000-000000000001'
      and user_id = '60000000-0000-4000-8000-000000000003'
  ),
  'REMOVED',
  'removed membership preserves its blocked state'
);

set local role service_role;
select throws_ok(
  $$
    select * from public.get_room_join_challenge(
      '60000000-0000-4000-8000-000000000003',
      '63000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  'room_member_removed',
  'a removed member cannot obtain a new join challenge'
);

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select aggregate_version from public.cancel_room_membership(
    '64000000-0000-4000-8000-000000000022', 'cancel-membership-fingerprint',
    '63000000-0000-4000-8000-000000000001', 4
  )),
  5,
  'former host can cancel registration after authority transfer'
);

reset role;

select is(
  (
    select status from public.room_memberships
    where room_id = '63000000-0000-4000-8000-000000000001'
      and user_id = '60000000-0000-4000-8000-000000000001'
  ),
  'CANCELED',
  'membership cancellation releases the registration'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.list_my_rooms()), 0::bigint, 'self-canceled room leaves My Discussions');

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  (select aggregate_version from public.cancel_room(
    '64000000-0000-4000-8000-000000000023', 'cancel-room-fingerprint',
    '63000000-0000-4000-8000-000000000001', 5
  )),
  6,
  'current host cancels a scheduled room'
);

reset role;

select is(
  (select phase from public.session_runs where room_id = '63000000-0000-4000-8000-000000000001'),
  'CANCELED',
  'room cancellation sets the terminal session phase'
);

select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.search_rooms('', 20)), 0::bigint, 'canceled room disappears from search');

reset role;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(
  (select display_status from public.list_my_rooms()),
  'CANCELED',
  'room cancellation remains visible in the registered host history'
);
select throws_ok(
  $$ select * from public.get_room_detail('63000000-0000-4000-8000-000000000001') $$,
  '55000',
  'room_canceled',
  'a canceled room detail cannot be opened'
);
select throws_ok(
  $$ select * from public.list_room_prep('63000000-0000-4000-8000-000000000001') $$,
  '42501',
  'prep_read_not_allowed',
  'canceled room prep cannot be opened'
);

reset role;

select is(
  (
    select count(*) from public.room_memberships
    where room_id = '63000000-0000-4000-8000-000000000001'
      and status = 'CANCELED_BY_ROOM'
  ),
  1::bigint,
  'room cancellation releases remaining registered memberships'
);
select is(
  (select count(*) from private.ai_private_prep_bodies),
  2::bigint,
  'room cancellation blocks access without silently deleting private raw data'
);

select * from finish();

rollback;
