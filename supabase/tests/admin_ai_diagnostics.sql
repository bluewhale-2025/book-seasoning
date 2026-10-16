begin;
set local search_path = public, extensions;
select plan(14);
select ok(not has_function_privilege('anon', 'public.admin_read_session_ai_diagnostics(uuid)', 'EXECUTE'), 'anonymous has no diagnostic access');
select ok(not has_table_privilege('authenticated', 'private.ai_evaluations', 'SELECT'), 'private tables stay private');
insert into auth.users (id, email, aud, role, raw_user_meta_data) values
  (
    'ad100000-0000-4000-8000-000000000001',
    'diagnostics-host@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"Diagnostics 방장"}'::jsonb
  ),
  (
    'ad100000-0000-4000-8000-000000000002',
    'diagnostics-member@example.test', 'authenticated', 'authenticated',
    '{"profile_name":"Diagnostics 참가자"}'::jsonb
  );

insert into public.books (id, title, author, publisher, publication_year)
values (
  'ad200000-0000-4000-8000-000000000001',
  'Diagnostics 테스트 책', '테스트 작가', '테스트 출판사', 2026
);
insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'ad300000-0000-4000-8000-000000000001',
  'ad200000-0000-4000-8000-000000000001',
  1, 'PUBLISHED', '1', 'diagnostics fixture', '2030-01-01T00:00:00Z'
);
insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values (
  'ad400000-0000-4000-8000-000000000001',
  'Diagnostics 테스트 방',
  'ad300000-0000-4000-8000-000000000001',
  '2030-01-01T09:00:00Z', '$argon2id$diagnostics', 2, 5,
  'ad100000-0000-4000-8000-000000000001'
);
insert into public.room_memberships (
  room_id, user_id, status, profile_name_snapshot, joined_at, participated_at
) values
  (
    'ad400000-0000-4000-8000-000000000001',
    'ad100000-0000-4000-8000-000000000001',
    'PARTICIPATED', 'Diagnostics 방장', '2030-01-01T09:00:00Z', '2030-01-01T09:00:00Z'
  ),
  (
    'ad400000-0000-4000-8000-000000000001',
    'ad100000-0000-4000-8000-000000000002',
    'PARTICIPATED', 'Diagnostics 참가자', '2030-01-01T09:00:00Z', '2030-01-01T09:00:00Z'
  );
insert into public.session_runs (
  id, room_id, phase, phase_version, started_at, discussion_ends_at,
  extension_decision_deadline_at, updated_at
) values (
  'ad500000-0000-4000-8000-000000000001',
  'ad400000-0000-4000-8000-000000000001',
  'SCHEDULED', 0, null, null, null, '2030-01-01T09:00:00Z'
);


insert into auth.users (id,email,aud,role,raw_user_meta_data) values
('ad100000-0000-4000-8000-000000000003','outside-admin@example.test','authenticated','authenticated','{"profile_name":"Outside admin"}');
update public.profiles set role='ADMIN' where user_id in ('ad100000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000003');
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($q$select public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')$q$, '42501','admin_required','ordinary member is denied');
reset role;
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($q$select public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')$q$, '42501','session_access_denied','admin outside the room is denied');
reset role;
select set_config('request.jwt.claim.sub','ad100000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')->>'phase','SCHEDULED','member admin can inspect session');
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')->'evaluations','[]'::jsonb,'empty history is explicit');
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')->>'awaitingParticipantResponse','false','no intervention is not awaiting response');
reset role;

insert into private.ai_job_runs(id,job_key,queue_name,job_type,session_id,base_wiki_version,target_through_seq,task_schema_version)
values('ad600000-0000-4000-8000-000000000001','diagnostics:test','ai-session','PUBLIC_EVALUATION','ad500000-0000-4000-8000-000000000001',0,0,'public-evaluator-output.v1');
insert into private.ai_evaluations(id,job_id,session_id,base_wiki_version,target_through_seq,schema_version,canonical_result,commit_status)
select 'ad700000-0000-4000-8000-000000000001','ad600000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001',0,0,'public-evaluator-output.v1',
jsonb_build_object('summaryState','AI_PRIVATE_CANARY_SECRET','participantState','AI_PRIVATE_CANARY_SECRET','confidence','HIGH','metrics',
(select jsonb_object_agg(metric,jsonb_build_object('level','LOW','reasonCodes',jsonb_build_array('BOOK_CONNECTION_NOT_OBSERVED'),'evidenceRefs',jsonb_build_array('AI_PRIVATE_CANARY_SECRET')))
from unnest(array['depth','expansion','bookGrounding','saturation','participationBalance','relevance','activity']) metric)), 'PATCH_REJECTED';
insert into private.ai_policy_actions(id,evaluation_id,session_id,action,reason_codes,supporting_evidence_refs,schema_version)
values('ad800000-0000-4000-8000-000000000001','ad700000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001','REVIVE','["OBJECTIVE_SILENCE_WITH_EXPLORATION_REMAINING"]','[]','policy-decision.v1');
insert into public.messages(id,session_id,seq_no,kind,author_profile_name_snapshot,body)
values('ad900000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001',1,'AI_HOST','AI','PUBLIC_BODY_CANARY');
insert into private.ai_interventions(message_id,policy_action_id,session_id,based_through_seq,schema_version,status,committed_at)
values('ad900000-0000-4000-8000-000000000001','ad800000-0000-4000-8000-000000000001','ad500000-0000-4000-8000-000000000001',0,'host-intervention-output.v1','COMMITTED',now());
set local role authenticated;
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')#>>'{latestJob,status}','PENDING','job progress is visible');
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')#>>'{evaluations,0,metrics,depth,level}','LOW','metric level is projected');
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')#>>'{evaluations,0,action}','REVIVE','policy is projected separately');
select ok(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')::text not like '%CANARY%', 'raw content and evidence never escape');
select is(public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')->>'awaitingParticipantResponse','true','unanswered intervention is explained');
select ok((public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')->>'cooldownRemainingSeconds')::integer between 0 and 90,'cooldown is nonnegative');
reset role;
update public.profiles set role='USER' where user_id='ad100000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($q$select public.admin_read_session_ai_diagnostics('ad400000-0000-4000-8000-000000000001')$q$, '42501','admin_required','revocation applies on every check');
reset role;
select * from finish();
rollback;
