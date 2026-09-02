begin;

set local search_path = public, extensions;

select plan(14);

select has_table('public', 'profiles', 'profiles table exists');
select columns_are(
  'public',
  'profiles',
  array['user_id', 'profile_name', 'role', 'created_at', 'updated_at'],
  'profiles exposes the expected columns'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles has row level security enabled'
);
select has_function(
  'public',
  'update_my_profile',
  array['text'],
  'profile update command exists'
);
select has_trigger(
  'auth',
  'users',
  'auth_user_profile_created',
  'auth user creation installs the profile trigger'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  '10000000-0000-4000-8000-000000000001',
  'profile-one@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"  같은 이름  "}'::jsonb
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  '10000000-0000-4000-8000-000000000002',
  'profile-two@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"같은 이름"}'::jsonb
);

select is(
  (select profile_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  '같은 이름',
  'signup trims the required profile name'
);
select is(
  (select count(*) from public.profiles where profile_name = '같은 이름'),
  2::bigint,
  'profile names do not need to be unique'
);
select throws_ok(
  $$
    insert into auth.users (id, email, aud, role, raw_user_meta_data)
    values (
      '10000000-0000-4000-8000-000000000003',
      'blank-profile@example.test',
      'authenticated',
      'authenticated',
      '{"profile_name":"   "}'::jsonb
    )
  $$,
  '22023',
  'profile_name_required',
  'signup rejects a blank profile name atomically'
);
select is(
  (select count(*) from auth.users where id = '10000000-0000-4000-8000-000000000003'),
  0::bigint,
  'failed profile creation also rolls back the auth user'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.profiles),
  1::bigint,
  'RLS only exposes the authenticated user profile'
);
select throws_ok(
  $$update public.profiles set profile_name = '직접 변경'$$,
  '42501',
  'permission denied for table profiles',
  'authenticated users cannot update the table directly'
);
select is(
  (select profile_name from public.update_my_profile('  변경된 이름  ')),
  '변경된 이름',
  'the command updates and trims the authenticated user profile'
);

reset role;

select is(
  (select profile_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000001'),
  '변경된 이름',
  'the profile command persisted the new name'
);
select is(
  (select profile_name from public.profiles where user_id = '10000000-0000-4000-8000-000000000002'),
  '같은 이름',
  'the profile command did not update another user'
);

select * from finish();

rollback;
