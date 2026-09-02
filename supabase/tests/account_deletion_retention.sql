begin;

set local search_path = public, extensions;

select plan(37);

select has_table('private','account_deletion_requests','account deletion has a durable request');
select hasnt_table('private','deleted_account_email_blocks','deleted email is not retained as a permanent block');
select has_table('private','account_deletion_restore_tombstones','restore anonymization has a bounded tombstone');
select has_table('private','ai_diagnostic_retention','AI diagnostics have explicit retention state');
select has_function('public','prepare_account_deletion',array['uuid','text'],'deletion preparation is transactional');
select has_function('private','purge_expired_ai_diagnostics',array['timestamp with time zone','integer'],'expired AI diagnostics have a purge job');
select ok(not has_table_privilege('authenticated','private.account_deletion_requests','SELECT'),'clients cannot inspect deletion internals');

insert into auth.users(id,email,aud,role,raw_user_meta_data) values
  ('f8100000-0000-4000-8000-000000000001','delete-admin@example.test','authenticated','authenticated','{"profile_name":"삭제 관리자"}'),
  ('f8100000-0000-4000-8000-000000000002','delete-host@example.test','authenticated','authenticated','{"profile_name":"예정 방장"}'),
  ('f8100000-0000-4000-8000-000000000003','delete-active@example.test','authenticated','authenticated','{"profile_name":"진행 참가자"}'),
  ('f8100000-0000-4000-8000-000000000004','delete-user@example.test','authenticated','authenticated','{"profile_name":"탈퇴 대상"}'),
  ('f8100000-0000-4000-8000-000000000005','delete-other@example.test','authenticated','authenticated','{"profile_name":"기록 방장"}');
update public.profiles set role='ADMIN' where user_id='f8100000-0000-4000-8000-000000000001';
insert into public.books(id,title,author,publisher,publication_year)
values('f8200000-0000-4000-8000-000000000001','탈퇴 테스트 책','작가','출판사',2026);
insert into public.book_context_pack_versions(id,book_id,version,status,schema_version,short_description,published_at)
values('f8300000-0000-4000-8000-000000000001','f8200000-0000-4000-8000-000000000001',1,'PUBLISHED','1','탈퇴 테스트',timezone('utc',now()));
insert into public.rooms(id,title,book_context_pack_version_id,scheduled_start_at,password_hash,min_participants,max_participants,host_user_id) values
  ('f8400000-0000-4000-8000-000000000001','예정 방','f8300000-0000-4000-8000-000000000001',timezone('utc',now())+interval '1 day','$argon2id$delete1',2,5,'f8100000-0000-4000-8000-000000000002'),
  ('f8400000-0000-4000-8000-000000000002','진행 방','f8300000-0000-4000-8000-000000000001',timezone('utc',now()),'$argon2id$delete2',2,5,'f8100000-0000-4000-8000-000000000005'),
  ('f8400000-0000-4000-8000-000000000003','종료 방','f8300000-0000-4000-8000-000000000001',timezone('utc',now())-interval '1 day','$argon2id$delete3',2,5,'f8100000-0000-4000-8000-000000000005');
insert into public.room_memberships(room_id,user_id,status,profile_name_snapshot,participated_at) values
  ('f8400000-0000-4000-8000-000000000001','f8100000-0000-4000-8000-000000000002','REGISTERED','예정 방장',null),
  ('f8400000-0000-4000-8000-000000000002','f8100000-0000-4000-8000-000000000003','PARTICIPATED','진행 참가자',timezone('utc',now())),
  ('f8400000-0000-4000-8000-000000000002','f8100000-0000-4000-8000-000000000005','PARTICIPATED','기록 방장',timezone('utc',now())),
  ('f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','PARTICIPATED','탈퇴 대상',timezone('utc',now())-interval '1 day'),
  ('f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000005','PARTICIPATED','기록 방장',timezone('utc',now())-interval '1 day');
insert into public.session_runs(id,room_id,phase,phase_version,aggregate_version) values
  ('f8500000-0000-4000-8000-000000000001','f8400000-0000-4000-8000-000000000001','SCHEDULED',0,0),
  ('f8500000-0000-4000-8000-000000000002','f8400000-0000-4000-8000-000000000002','CORE',2,1),
  ('f8500000-0000-4000-8000-000000000003','f8400000-0000-4000-8000-000000000003','CORE',2,1);
update public.session_runs set phase='ENDED',phase_version=3,ended_at=timezone('utc',now())-interval '1 day'
where id='f8500000-0000-4000-8000-000000000003';

select set_config('request.jwt.claims','{"sub":"f8100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.get_account_deletion_preview()->'blockers'->>0,'ADMIN_ROLE','ADMIN accounts must be demoted first');
reset role;
select set_config('request.jwt.claims','{"sub":"f8100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select ok((public.get_account_deletion_preview()->'blockers') ? 'HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL','scheduled hosts must transfer or cancel first');
reset role;
select set_config('request.jwt.claims','{"sub":"f8100000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select ok((public.get_account_deletion_preview()->'blockers') ? 'ACTIVE_PARTICIPATION','actual participants cannot leave an active session');
reset role;

insert into public.messages(id,session_id,seq_no,kind,author_user_id,author_profile_name_snapshot,client_message_id,body,confirmed_at) values
  ('f8600000-0000-4000-8000-000000000001','f8500000-0000-4000-8000-000000000003',1,'PARTICIPANT','f8100000-0000-4000-8000-000000000004','탈퇴 대상','f8610000-0000-4000-8000-000000000001','남겨야 할 공동 메시지',timezone('utc',now())-interval '1 day'),
  ('f8600000-0000-4000-8000-000000000002','f8500000-0000-4000-8000-000000000003',2,'PARTICIPANT','f8100000-0000-4000-8000-000000000005','기록 방장','f8610000-0000-4000-8000-000000000002','답글 메시지',timezone('utc',now())-interval '1 day');
update public.messages set reply_to_message_id='f8600000-0000-4000-8000-000000000001',reply_author_profile_name_snapshot='탈퇴 대상',reply_quote_snapshot='남겨야 할 공동 메시지'
where id='f8600000-0000-4000-8000-000000000002';
insert into public.prep_entries(id,room_id,author_user_id,author_profile_name_snapshot,prompt_type,visibility,public_body) values
  ('f8700000-0000-4000-8000-000000000001','f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','탈퇴 대상','DISCUSSION_QUESTION','PUBLIC','남겨야 할 공개 준비 답변'),
  ('f8700000-0000-4000-8000-000000000002','f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','탈퇴 대상','QUOTE_THOUGHT','AI_PRIVATE',null);
insert into private.ai_private_prep_bodies(prep_entry_id,room_id,author_user_id,body,revision)
values('f8700000-0000-4000-8000-000000000002','f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','삭제되어야 할 비공개 준비 답변',1);
insert into public.session_closing_responses(session_id,participant_identity_id,author_user_id,profile_name_snapshot,status,body,revision)
select 'f8500000-0000-4000-8000-000000000003',participant_identity_id,user_id,'탈퇴 대상','SUBMITTED','남겨야 할 마지막 한 줄',1
from public.room_memberships where room_id='f8400000-0000-4000-8000-000000000003' and user_id='f8100000-0000-4000-8000-000000000004';
insert into public.session_connections(session_id,user_id,device_id,last_seen_at)
values('f8500000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','f8800000-0000-4000-8000-000000000001',timezone('utc',now()));

select set_config('request.jwt.claims','{"sub":"f8100000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select ok((public.get_account_deletion_preview()->>'allowed')::boolean,'an ended-session participant can delete the account');
select is((public.get_account_deletion_preview()->'affected'->>'privatePrep')::integer,1,'preview reports private content that will be deleted');
create temporary table deletion_state as
select (response->>'deletionId')::uuid deletion_id
from (select public.prepare_account_deletion('f8900000-0000-4000-8000-000000000001','delete-v1') response) prepared;
reset role;

select is((select count(*) from public.profiles where user_id='f8100000-0000-4000-8000-000000000004'),0::bigint,'profile identity is deleted immediately');
select is((select count(*) from private.ai_private_prep_bodies where author_user_id='f8100000-0000-4000-8000-000000000004'),0::bigint,'AI_PRIVATE bodies are deleted');
select is((select count(*) from public.prep_entries where id='f8700000-0000-4000-8000-000000000002'),0::bigint,'AI_PRIVATE entry metadata is deleted');
select is((select author_profile_name_snapshot from public.prep_entries where id='f8700000-0000-4000-8000-000000000001'),'탈퇴한 사용자','PUBLIC prep remains with an anonymous author');
select is((select body from public.messages where id='f8600000-0000-4000-8000-000000000001'),'남겨야 할 공동 메시지','shared message content remains');
select is((select author_profile_name_snapshot from public.messages where id='f8600000-0000-4000-8000-000000000001'),'탈퇴한 사용자','shared message author is anonymous');
select is((select reply_author_profile_name_snapshot from public.messages where id='f8600000-0000-4000-8000-000000000002'),'탈퇴한 사용자','reply snapshots are anonymized too');
select is((select profile_name_snapshot from public.session_closing_responses where session_id='f8500000-0000-4000-8000-000000000003'),'탈퇴한 사용자','Closing reflection remains anonymously');
select is((select count(*) from public.session_connections where user_id='f8100000-0000-4000-8000-000000000004'),0::bigint,'all active connection grants are revoked');
select is((select profile_name_snapshot from public.room_memberships where user_id='f8100000-0000-4000-8000-000000000004'),'탈퇴한 사용자','participant history retains only an unlinked pseudonymous id');
select is((select status from private.account_deletion_requests where id=(select deletion_id from deletion_state)),'PROCESSING','Auth deletion is durably recoverable');

delete from auth.users where id='f8100000-0000-4000-8000-000000000004';
select is((select count(*) from auth.users where id='f8100000-0000-4000-8000-000000000004'),0::bigint,'Auth identity can be hard-deleted after preparation');
insert into auth.users(id,email,aud,role,raw_user_meta_data)
values('f8100000-0000-4000-8000-000000000004','delete-user@example.test','authenticated','authenticated','{"profile_name":"복원된 탈퇴 계정"}');
insert into public.prep_entries(id,room_id,author_user_id,author_profile_name_snapshot,prompt_type,visibility,public_body)
values('f8700000-0000-4000-8000-000000000003','f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','복원된 탈퇴 계정','QUOTE_THOUGHT','AI_PRIVATE',null);
insert into private.ai_private_prep_bodies(prep_entry_id,room_id,author_user_id,body,revision)
values('f8700000-0000-4000-8000-000000000003','f8400000-0000-4000-8000-000000000003','f8100000-0000-4000-8000-000000000004','백업에서 부활하면 안 되는 비공개 입력',1);
select lives_ok(
  format(
    'select private.reapply_account_deletion_tombstone(%L::uuid,%L::uuid[])',
    'f8100000-0000-4000-8000-000000000004',
    (select participant_identity_ids::text from private.account_deletion_restore_tombstones where deletion_id=(select deletion_id from deletion_state))
  ),
  'restore tombstones can be reapplied idempotently before service resumes'
);
select is((select count(*) from auth.users where id='f8100000-0000-4000-8000-000000000004'),0::bigint,'tombstone replay removes a restored Auth identity');
select is((select count(*) from private.ai_private_prep_bodies where author_user_id='f8100000-0000-4000-8000-000000000004'),0::bigint,'tombstone replay removes restored AI_PRIVATE content');
insert into auth.users(id,email,aud,role,raw_user_meta_data)
values('f8100000-0000-4000-8000-000000000006','delete-user@example.test','authenticated','authenticated','{"profile_name":"재가입"}');
select is((select count(*) from public.profiles where user_id='f8100000-0000-4000-8000-000000000006'),1::bigint,'the same email can register as a new account');

grant select on deletion_state to service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select ok(public.complete_account_deletion((select deletion_id from deletion_state)),'service recovery can finalize deletion');
reset role;
select is((select status from private.account_deletion_requests where id=(select deletion_id from deletion_state)),'COMPLETED','deletion reaches an irreversible terminal state');
select is((select count(*) from private.account_deletion_restore_tombstones where deletion_id=(select deletion_id from deletion_state)),1::bigint,'restore tombstone is retained for 37 days');
select is(private.purge_expired_account_restore_tombstones(timezone('utc',now())+interval '38 days'),1,'expired restore tombstones are removed');
select is((select former_user_id from private.account_deletion_requests where id=(select deletion_id from deletion_state)),null::uuid,'restore metadata no longer links the former account after expiry');
select is((select count(*) from public.room_memberships where user_id='f8100000-0000-4000-8000-000000000006'),0::bigint,'the new same-email account is not linked to former participation');

select is((select count(*) from private.ai_diagnostic_retention where session_id='f8500000-0000-4000-8000-000000000003'),1::bigint,'ending a session schedules 90-day diagnostic expiry');
select is(private.purge_expired_ai_diagnostics(timezone('utc',now())+interval '91 days',1),1,'daily retention purge processes an expired session');
select ok((select purged_at is not null from private.ai_diagnostic_retention where session_id='f8500000-0000-4000-8000-000000000003'),'diagnostic purge completion is durable');

select * from finish();
rollback;
