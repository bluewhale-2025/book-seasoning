begin;

delete from public.session_runs
where id in (
  'b0400000-0000-4000-8000-000000000001',
  'b0400000-0000-4000-8000-000000000002',
  'b0400000-0000-4000-8000-000000000003',
  'b0400000-0000-4000-8000-000000000004'
);
delete from public.room_memberships
where room_id in (
  'b0300000-0000-4000-8000-000000000001',
  'b0300000-0000-4000-8000-000000000002',
  'b0300000-0000-4000-8000-000000000003',
  'b0300000-0000-4000-8000-000000000004'
);
delete from public.rooms
where id in (
  'b0300000-0000-4000-8000-000000000001',
  'b0300000-0000-4000-8000-000000000002',
  'b0300000-0000-4000-8000-000000000003',
  'b0300000-0000-4000-8000-000000000004'
);
delete from auth.users
where id = 'b0000000-0000-4000-8000-000000000001';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  'b0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'realtime-load@example.test',
  extensions.crypt('realtime-load-password', extensions.gen_salt('bf')),
  timezone('utc', now()),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"profile_name":"부하 테스트"}'::jsonb,
  timezone('utc', now()), timezone('utc', now()), '', '', '', ''
);

insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  'b0010000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000001',
  '{"sub":"b0000000-0000-4000-8000-000000000001","email":"realtime-load@example.test"}'::jsonb,
  'email', timezone('utc', now()), timezone('utc', now()), timezone('utc', now())
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'b0100000-0000-4000-8000-000000000001',
  'Realtime 부하 테스트 책', '테스트 작가', '테스트 출판사', 2026
) on conflict (id) do nothing;

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'b0200000-0000-4000-8000-000000000001',
  'b0100000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', 'Realtime 부하 테스트 Pack', timezone('utc', now())
) on conflict (id) do nothing;

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
  ('b0300000-0000-4000-8000-000000000001', 'Realtime 부하 테스트 방 1', 'b0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute', '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 15, 'b0000000-0000-4000-8000-000000000001'),
  ('b0300000-0000-4000-8000-000000000002', 'Realtime 부하 테스트 방 2', 'b0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute', '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 15, 'b0000000-0000-4000-8000-000000000001'),
  ('b0300000-0000-4000-8000-000000000003', 'Realtime 부하 테스트 방 3', 'b0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute', '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 15, 'b0000000-0000-4000-8000-000000000001'),
  ('b0300000-0000-4000-8000-000000000004', 'Realtime 부하 테스트 방 4', 'b0200000-0000-4000-8000-000000000001', timezone('utc', now()) - interval '1 minute', '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash', 2, 15, 'b0000000-0000-4000-8000-000000000001');

insert into public.session_runs (
  id, room_id, phase, phase_version, aggregate_version, channel_epoch,
  started_at, discussion_ends_at, extension_decision_deadline_at
) values
  ('b0400000-0000-4000-8000-000000000001', 'b0300000-0000-4000-8000-000000000001', 'OPENING', 1, 0, 1, timezone('utc', now()), timezone('utc', now()) + interval '30 minutes', timezone('utc', now()) + interval '25 minutes'),
  ('b0400000-0000-4000-8000-000000000002', 'b0300000-0000-4000-8000-000000000002', 'OPENING', 1, 0, 1, timezone('utc', now()), timezone('utc', now()) + interval '30 minutes', timezone('utc', now()) + interval '25 minutes'),
  ('b0400000-0000-4000-8000-000000000003', 'b0300000-0000-4000-8000-000000000003', 'OPENING', 1, 0, 1, timezone('utc', now()), timezone('utc', now()) + interval '30 minutes', timezone('utc', now()) + interval '25 minutes'),
  ('b0400000-0000-4000-8000-000000000004', 'b0300000-0000-4000-8000-000000000004', 'OPENING', 1, 0, 1, timezone('utc', now()), timezone('utc', now()) + interval '30 minutes', timezone('utc', now()) + interval '25 minutes');

insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, participated_at
) values
  ('b0300000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'PARTICIPATED', '부하 테스트', timezone('utc', now())),
  ('b0300000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'PARTICIPATED', '부하 테스트', timezone('utc', now())),
  ('b0300000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'PARTICIPATED', '부하 테스트', timezone('utc', now())),
  ('b0300000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'PARTICIPATED', '부하 테스트', timezone('utc', now()));

commit;
