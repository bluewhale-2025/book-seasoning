begin;

set local search_path = public, extensions;

select plan(33);

select is(
  (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and procedure.prosrc like '%40001%'
  ),
  0::bigint,
  'application functions do not use retryable serialization SQLSTATE for domain conflicts'
);

select has_table('private','book_builder_runs','Builder runs are durable');
select has_table('private','book_builder_jobs','Builder stages are durable jobs');
select has_table('private','book_builder_proposals','regeneration uses reviewable proposals');
select has_table('public','book_context_admin_audit','admin mutations are audited');
select has_table('private','book_catalog_external_identifiers','selected catalog identities are durable');
select has_function('public','admin_create_book_context_pack',array['uuid','text','text','text','jsonb'],'admin can create a Pack draft from a selected catalog book');
select has_function('public','admin_regenerate_book_context_pack',array['uuid','text','uuid','integer','text','uuid'],'admin can request scoped regeneration');
select ok(
  has_function_privilege('bookseasoning_ai_worker','private.complete_book_builder_stage(uuid,integer,text,jsonb,jsonb)','EXECUTE'),
  'worker can commit a Builder stage'
);
select ok(
  not has_function_privilege('authenticated','private.complete_book_builder_stage(uuid,integer,text,jsonb,jsonb)','EXECUTE'),
  'clients cannot forge Builder output'
);

insert into auth.users(id,email,aud,role,raw_user_meta_data) values
  ('e7100000-0000-4000-8000-000000000001','builder-admin@example.test','authenticated','authenticated','{"profile_name":"Builder 관리자"}'),
  ('e7100000-0000-4000-8000-000000000002','builder-user@example.test','authenticated','authenticated','{"profile_name":"일반 회원"}');
update public.profiles set role='ADMIN' where user_id='e7100000-0000-4000-8000-000000000001';

select set_config('request.jwt.claims','{"sub":"e7100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok(
  $$select public.admin_create_book_context_pack(
    'e7200000-0000-4000-8000-000000000001','non-admin','KAKAO','isbn13:9788990000001',
    '{"title":"테스트 책","author":"테스트 저자","publisher":"테스트 출판사","publicationYear":2026,"isbn10":null,"isbn13":"9788990000001","coverUrl":null,"translator":null,"description":null,"detailUrl":null}'::jsonb
  )$$,
  '42501','admin_required','ordinary users cannot access Builder commands'
);
reset role;

select set_config('request.jwt.claims','{"sub":"e7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
create temporary table builder_test_state as
select created."packVersionId"::text::uuid as pack_id, (created."run"->>'runId')::uuid as run_id
from jsonb_to_record(public.admin_create_book_context_pack(
  'e7200000-0000-4000-8000-000000000002','create-v1','KAKAO','isbn13:9788990000001',
  '{"title":"테스트 책","author":"테스트 저자","publisher":"테스트 출판사","publicationYear":2026,"isbn10":null,"isbn13":"9788990000001","coverUrl":null,"translator":null,"description":"선택한 책 소개","detailUrl":null}'::jsonb
)) as created("packVersionId" text,"run" jsonb);
select ok(
  (public.admin_create_book_context_pack(
    'e7200000-0000-4000-8000-000000000002','create-v1','KAKAO','isbn13:9788990000001',
    '{"title":"테스트 책","author":"테스트 저자","publisher":"테스트 출판사","publicationYear":2026,"isbn10":null,"isbn13":"9788990000001","coverUrl":null,"translator":null,"description":"선택한 책 소개","detailUrl":null}'::jsonb
  )->>'duplicate')::boolean,
  'create replay is idempotent'
);
select throws_ok(
  $$select public.admin_create_book_context_pack(
    'e7200000-0000-4000-8000-000000000002','different','KAKAO','isbn13:9788990000002',
    '{"title":"다른 책","author":"테스트 저자","publisher":"테스트 출판사","publicationYear":2026,"isbn10":null,"isbn13":"9788990000002","coverUrl":null,"translator":null,"description":null,"detailUrl":null}'::jsonb
  )$$,
  'P0001','command_payload_mismatch','a command id cannot be reused with another payload'
);
reset role;

select is(
  (select count(*) from private.book_catalog_external_identifiers where book_id=(select book_id from public.book_context_pack_versions where id=(select pack_id from builder_test_state))),
  1::bigint,
  'selected external identity is stored with the book'
);

select set_config('request.jwt.claims','{"sub":"e7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(
  public.admin_create_book_context_pack(
    'e7200000-0000-4000-8000-000000000010','existing-selection','KAKAO','isbn13:9788990000001',
    '{"title":"테스트 책","author":"테스트 저자","publisher":"테스트 출판사","publicationYear":2026,"isbn10":null,"isbn13":"9788990000001","coverUrl":null,"translator":null,"description":"선택한 책 소개","detailUrl":null}'::jsonb
  )->>'outcome',
  'EXISTING',
  'selecting the same edition returns the existing Pack'
);
reset role;
select is((select count(*) from public.book_context_pack_versions where book_id=(select book_id from public.book_context_pack_versions where id=(select pack_id from builder_test_state))),1::bigint,'the same selected edition is not duplicated');

select is((select status from public.book_context_pack_versions where id=(select pack_id from builder_test_state)),'DRAFT','create starts as Draft');
select is((select count(*) from public.book_context_sections where pack_version_id=(select pack_id from builder_test_state)),7::bigint,'create materializes all seven sections');
select is((select scope from private.book_builder_runs where id=(select run_id from builder_test_state)),'INITIAL','the first run is an initial build');
select ok(
  not exists(
    select 1 from pgmq."q_book-builder" queued
    where queued.message ?| array['draft','title','author','sources']
  ),
  'queue envelopes contain ids and cursors rather than Pack contents'
);

do $$
declare selected_job private.book_builder_jobs%rowtype; stage_name text;
  final_draft jsonb; current_draft jsonb;
begin
  foreach stage_name in array array[
    'IDENTIFY_BOOK','DISCOVER_SOURCES','CAPTURE_SOURCE_METADATA',
    'EXTRACT_CLAIMS','CROSS_VALIDATE','BUILD_SECTIONS'
  ] loop
    select job.* into strict selected_job from private.book_builder_jobs job
    where job.id=(select run.current_job_id from private.book_builder_runs run where run.id=(select run_id from builder_test_state));
    update private.book_builder_jobs set status='PROCESSING',attempt_count=1,
      lease_expires_at=timezone('utc',now())+interval '5 minutes',updated_at=timezone('utc',now())
    where id=selected_job.id;
    perform private.complete_book_builder_stage(
      selected_job.id,1,'builder-stage-test.v1',
      pg_catalog.jsonb_build_object('schemaVersion','builder-stage-test.v1','stage',stage_name),null
    );
  end loop;

  current_draft:=private.book_builder_draft_json((select pack_id from builder_test_state));
  final_draft:=pg_catalog.jsonb_build_object(
    'schemaVersion','book-builder-draft.v1','shortDescription','검수할 자동 생성 초안',
    'book',(current_draft->'book') || '{"publisher":"테스트 출판사","publicationYear":2026}'::jsonb,
    'sections',(
      select jsonb_agg(
        (section - 'items') || pg_catalog.jsonb_build_object(
          'coverage',case when section->>'code'='STRUCTURE' then 'PARTIAL' else 'READY' end,
          'reviewStatus','UNREVIEWED','items',
          case when section->>'code'='METADATA' then pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'itemId','e7300000-0000-4000-8000-000000000001','displayOrder',0,
              'kind','INTERPRETATION','title','검수 항목','content','복수 해석을 위한 검수 항목입니다.',
              'bookLocator',null,'evidenceState','SUPPORTED','reviewStatus','UNREVIEWED'
            )
          ) else '[]'::jsonb end
        ) order by (section->>'displayOrder')::integer
      ) from jsonb_array_elements(current_draft->'sections') section
    ),
    'sources','[]'::jsonb,'itemLinks','[]'::jsonb,'itemSources','[]'::jsonb
  );
  select job.* into strict selected_job from private.book_builder_jobs job
  where job.id=(select run.current_job_id from private.book_builder_runs run where run.id=(select run_id from builder_test_state));
  update private.book_builder_jobs set status='PROCESSING',attempt_count=1,
    lease_expires_at=timezone('utc',now())+interval '5 minutes',updated_at=timezone('utc',now())
  where id=selected_job.id;
  perform private.complete_book_builder_stage(selected_job.id,1,'book-builder-draft.v1',final_draft,null);
end;
$$;

select is((select status from private.book_builder_runs where id=(select run_id from builder_test_state)),'SUCCEEDED','all seven durable stages complete the run');
select is((select builder_revision from public.book_context_pack_versions where id=(select pack_id from builder_test_state)),1,'initial Builder output advances the Draft revision once');
select ok(
  not ((private.book_context_validation_json((select pack_id from builder_test_state))->'hardBlockers') ? 'UNREVIEWED_CONTENT'),
  'generated items do not require individual review state changes'
);

select set_config('request.jwt.claims','{"sub":"e7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(
  (public.admin_update_book_context_draft(
    'e7200000-0000-4000-8000-000000000003','review-content-v1',(select pack_id from builder_test_state),1,
    jsonb_set(
      public.admin_get_book_context_pack((select pack_id from builder_test_state))->'draft',
      '{shortDescription}',
      '"운영자가 전체 내용을 읽고 다듬은 초안"'
    )
  )->>'revision')::integer,
  2,
  'admin edits are optimistic without item-level review controls'
);
select is(
  jsonb_array_length(public.admin_get_book_context_pack((select pack_id from builder_test_state))->'validation'->'hardBlockers'),
  0,
  'a valid whole draft clears review blockers'
);

create temporary table regeneration_state as
select (response->'run'->>'runId')::uuid run_id
from (select public.admin_regenerate_book_context_pack(
  'e7200000-0000-4000-8000-000000000004','regenerate-v1',(select pack_id from builder_test_state),2,'FULL',null
) response) generated;
reset role;

do $$
declare selected_job private.book_builder_jobs%rowtype; stage_name text; proposal_draft jsonb;
begin
  foreach stage_name in array array[
    'IDENTIFY_BOOK','DISCOVER_SOURCES','CAPTURE_SOURCE_METADATA','EXTRACT_CLAIMS',
    'CROSS_VALIDATE','BUILD_SECTIONS','VALIDATE_DRAFT'
  ] loop
    select job.* into strict selected_job from private.book_builder_jobs job
    where job.id=(select run.current_job_id from private.book_builder_runs run where run.id=(select run_id from regeneration_state));
    update private.book_builder_jobs set status='PROCESSING',attempt_count=1,
      lease_expires_at=timezone('utc',now())+interval '5 minutes',updated_at=timezone('utc',now()) where id=selected_job.id;
    proposal_draft:=private.book_builder_draft_json((select pack_id from builder_test_state)) ||
      pg_catalog.jsonb_build_object('shortDescription','재생성 변경안');
    perform private.complete_book_builder_stage(
      selected_job.id,1,
      case when stage_name='VALIDATE_DRAFT' then 'book-builder-draft.v1' else 'builder-stage-test.v1' end,
      case when stage_name='VALIDATE_DRAFT' then proposal_draft else pg_catalog.jsonb_build_object('schemaVersion','builder-stage-test.v1','stage',stage_name) end,
      null
    );
  end loop;
end;
$$;

select is((select builder_revision from public.book_context_pack_versions where id=(select pack_id from builder_test_state)),2,'regeneration never overwrites the current Draft automatically');
select is((select count(*) from private.book_builder_proposals where pack_version_id=(select pack_id from builder_test_state) and status='PENDING'),1::bigint,'regeneration creates one reviewable diff proposal');

select set_config('request.jwt.claims','{"sub":"e7100000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(
  (public.admin_apply_book_context_proposal(
    'e7200000-0000-4000-8000-000000000005','apply-proposal-v1',
    (public.admin_get_book_context_pack((select pack_id from builder_test_state))->'pendingProposal'->>'proposalId')::uuid,2
  )->>'revision')::integer,
  3,
  'an explicit apply command installs the reviewed regeneration proposal'
);
select throws_ok(
  $$select public.admin_review_book_context_pack(
    'e7200000-0000-4000-8000-000000000008','missing-warning-ack',(select pack_id from builder_test_state),3,'{}'::text[]
  )$$,
  '55000','book_context_warnings_unacknowledged','whole review requires the exact current warning set once'
);
select is(
  public.admin_review_book_context_pack(
    'e7200000-0000-4000-8000-000000000006','enter-review-v1',(select pack_id from builder_test_state),3,array['SECTION_COVERAGE_INCOMPLETE']
  )->>'status',
  'REVIEW',
  'one explicit command completes review for the whole Pack'
);
select is(
  public.admin_publish_book_context_pack(
    'e7200000-0000-4000-8000-000000000007','publish-v1',(select pack_id from builder_test_state),4
  )->>'status',
  'PUBLISHED',
  'reviewed content is explicitly published by an admin'
);
reset role;

select throws_ok(
  $$update public.book_context_items set content='게시 후 변경' where pack_version_id=(select pack_id from builder_test_state)$$,
  '55000','published_pack_content_immutable','Published Pack contents remain immutable'
);
select is((select count(*) from public.book_context_admin_audit where pack_version_id=(select pack_id from builder_test_state) and action='PUBLISH'),1::bigint,'Publish is recorded in the audit log');

select * from finish();
rollback;
