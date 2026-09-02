alter table public.books alter column publisher drop not null;
alter table public.books alter column publication_year drop not null;

alter table public.book_context_pack_versions
add column builder_revision integer not null default 0 check (builder_revision >= 0);

create or replace function private.reject_published_book_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_book_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if exists (
    select 1 from public.book_context_pack_versions as pack
    where pack.book_id = target_book_id
      and pack.status in ('PUBLISHED', 'RETIRED')
  ) and (
    tg_op = 'DELETE'
    or new.title is distinct from old.title
    or new.author is distinct from old.author
    or new.publisher is distinct from old.publisher
    or new.publication_year is distinct from old.publication_year
    or new.cover_url is distinct from old.cover_url
    or new.genre is distinct from old.genre
    or new.edition is distinct from old.edition
    or new.translator is distinct from old.translator
    or new.isbn is distinct from old.isbn
    or new.identity_note is distinct from old.identity_note
  ) then
    raise exception using errcode = '55000', message = 'published_book_identity_immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create table private.book_builder_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  pack_version_id uuid not null references public.book_context_pack_versions(id) on delete restrict,
  stage text not null check (stage in (
    'IDENTIFY_BOOK', 'DISCOVER_SOURCES', 'CAPTURE_SOURCE_METADATA',
    'EXTRACT_CLAIMS', 'CROSS_VALIDATE', 'BUILD_SECTIONS', 'VALIDATE_DRAFT'
  )),
  status text not null check (status in ('PENDING', 'RUNNING', 'RETRYING', 'SUCCEEDED', 'FAILED')),
  completed_stage_count integer not null default 0 check (completed_stage_count between 0 and 7),
  base_revision integer not null check (base_revision >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  scope text not null default 'INITIAL' check (scope in ('INITIAL','FULL','ITEM')),
  target_item_id uuid,
  current_job_id uuid,
  error_code text check (
    error_code is null or (length(error_code) between 1 and 100 and error_code ~ '^[A-Z][A-Z0-9_]*$')
  ),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  constraint book_builder_runs_time_check check (
    updated_at >= created_at and (completed_at is null or completed_at >= created_at)
  ),
  constraint book_builder_runs_scope_target_check check (
    (scope = 'ITEM' and target_item_id is not null)
    or (scope <> 'ITEM' and target_item_id is null)
  )
);

create table private.book_builder_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null references private.book_builder_runs(id) on delete restrict,
  pack_version_id uuid not null references public.book_context_pack_versions(id) on delete restrict,
  stage text not null check (stage in (
    'IDENTIFY_BOOK', 'DISCOVER_SOURCES', 'CAPTURE_SOURCE_METADATA',
    'EXTRACT_CLAIMS', 'CROSS_VALIDATE', 'BUILD_SECTIONS', 'VALIDATE_DRAFT'
  )),
  generation_no integer not null check (generation_no > 0),
  expected_revision integer not null check (expected_revision >= 0),
  queue_message_id bigint unique,
  status text not null default 'PENDING' check (
    status in ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED', 'SUCCEEDED', 'FAILED')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  error_code text check (
    error_code is null or (length(error_code) between 1 and 100 and error_code ~ '^[A-Z][A-Z0-9_]*$')
  ),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  unique (run_id, stage, generation_no),
  unique (run_id, id),
  constraint book_builder_jobs_completion_check check (
    (status in ('SUCCEEDED', 'FAILED') and completed_at is not null)
    or (status not in ('SUCCEEDED', 'FAILED') and completed_at is null)
  ),
  constraint book_builder_jobs_lease_check check (
    (status = 'PROCESSING' and lease_expires_at is not null)
    or (status <> 'PROCESSING' and lease_expires_at is null)
  ),
  constraint book_builder_jobs_retry_check check (
    (status = 'RETRY_SCHEDULED' and next_attempt_at is not null)
    or (status <> 'RETRY_SCHEDULED' and next_attempt_at is null)
  )
);

alter table private.book_builder_runs
add constraint book_builder_runs_current_job_fk
foreign key (id, current_job_id) references private.book_builder_jobs(run_id, id) on delete restrict;

create unique index book_builder_runs_one_active_pack_idx
on private.book_builder_runs(pack_version_id)
where status in ('PENDING', 'RUNNING', 'RETRYING');

create table private.book_builder_artifacts (
  id uuid primary key default extensions.gen_random_uuid(),
  job_id uuid not null unique references private.book_builder_jobs(id) on delete restrict,
  run_id uuid not null references private.book_builder_runs(id) on delete restrict,
  stage text not null,
  schema_version text not null,
  canonical_artifact jsonb not null check (
    jsonb_typeof(canonical_artifact) = 'object' and private.public_jsonb_keys_allowed(canonical_artifact)
  ),
  provider_metadata jsonb check (provider_metadata is null or jsonb_typeof(provider_metadata) = 'object'),
  created_at timestamptz not null default timezone('utc', now())
);

create table private.book_builder_proposals (
  id uuid primary key default extensions.gen_random_uuid(),
  run_id uuid not null unique references private.book_builder_runs(id) on delete restrict,
  pack_version_id uuid not null references public.book_context_pack_versions(id) on delete restrict,
  scope text not null check (scope in ('FULL','ITEM')),
  target_item_id uuid,
  base_revision integer not null check (base_revision >= 0),
  proposed_draft jsonb not null check (
    jsonb_typeof(proposed_draft) = 'object' and private.public_jsonb_keys_allowed(proposed_draft)
  ),
  status text not null default 'PENDING' check (status in ('PENDING','APPLIED','DISCARDED')),
  created_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  check ((scope='ITEM' and target_item_id is not null) or (scope='FULL' and target_item_id is null)),
  check ((status='PENDING' and resolved_at is null) or (status<>'PENDING' and resolved_at is not null))
);
create unique index book_builder_one_pending_proposal_idx
on private.book_builder_proposals(pack_version_id) where status = 'PENDING';

create table public.book_context_admin_audit (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  pack_version_id uuid not null references public.book_context_pack_versions(id) on delete restrict,
  action text not null check (action ~ '^[A-Z][A-Z0-9_]*$'),
  before_metadata jsonb,
  after_metadata jsonb,
  reason text,
  occurred_at timestamptz not null default timezone('utc', now())
);

create table private.book_context_admin_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_fingerprint text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

revoke all on table private.book_builder_runs, private.book_builder_jobs,
  private.book_builder_artifacts, private.book_builder_proposals,
  private.book_context_admin_command_receipts
from public, anon, authenticated, bookseasoning_ai_worker;
alter table public.book_context_admin_audit enable row level security;
revoke all on table public.book_context_admin_audit
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.is_admin(p_actor_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles as profile
    where profile.user_id = p_actor_user_id and profile.role = 'ADMIN'
  );
$$;
revoke all on function private.is_admin(uuid) from public, anon, authenticated;

create function private.replay_book_context_admin_command(
  p_actor_user_id uuid, p_command_id uuid, p_request_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare receipt private.book_context_admin_command_receipts%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_user_id::text || p_command_id::text, 0)
  );
  select stored.* into receipt
  from private.book_context_admin_command_receipts as stored
  where stored.actor_user_id = p_actor_user_id and stored.command_id = p_command_id;
  if not found then return null; end if;
  if receipt.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = '40001', message = 'command_payload_mismatch';
  end if;
  return receipt.response_payload;
end;
$$;

create function private.store_book_context_admin_command(
  p_actor_user_id uuid, p_command_id uuid, p_request_fingerprint text, p_response jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.book_context_admin_command_receipts(
    actor_user_id, command_id, request_fingerprint, response_payload
  ) values (p_actor_user_id, p_command_id, p_request_fingerprint, p_response);
$$;

create function private.book_builder_stage_index(p_stage text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'IDENTIFY_BOOK' then 1 when 'DISCOVER_SOURCES' then 2
    when 'CAPTURE_SOURCE_METADATA' then 3 when 'EXTRACT_CLAIMS' then 4
    when 'CROSS_VALIDATE' then 5 when 'BUILD_SECTIONS' then 6
    when 'VALIDATE_DRAFT' then 7 else null end;
$$;

create function private.book_builder_next_stage(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'IDENTIFY_BOOK' then 'DISCOVER_SOURCES'
    when 'DISCOVER_SOURCES' then 'CAPTURE_SOURCE_METADATA'
    when 'CAPTURE_SOURCE_METADATA' then 'EXTRACT_CLAIMS'
    when 'EXTRACT_CLAIMS' then 'CROSS_VALIDATE'
    when 'CROSS_VALIDATE' then 'BUILD_SECTIONS'
    when 'BUILD_SECTIONS' then 'VALIDATE_DRAFT'
    else null end;
$$;

create function private.enqueue_book_builder_job(
  p_run_id uuid,
  p_stage text,
  p_generation_no integer,
  p_expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run private.book_builder_runs%rowtype;
  inserted_job private.book_builder_jobs%rowtype;
  message_id bigint;
begin
  select run.* into strict target_run from private.book_builder_runs as run where run.id = p_run_id;
  insert into private.book_builder_jobs (
    run_id, pack_version_id, stage, generation_no, expected_revision
  ) values (
    target_run.id, target_run.pack_version_id, p_stage, p_generation_no, p_expected_revision
  ) returning * into inserted_job;
  select sent.message_id into message_id
  from pgmq.send('book-builder', pg_catalog.jsonb_build_object(
    'schemaVersion', 'book-builder-job.v1', 'jobId', inserted_job.id,
    'runId', inserted_job.run_id, 'packVersionId', inserted_job.pack_version_id,
    'stage', inserted_job.stage, 'generationNo', inserted_job.generation_no,
    'expectedRevision', inserted_job.expected_revision
  )) as sent(message_id);
  update private.book_builder_jobs as job
  set queue_message_id = message_id, updated_at = timezone('utc', now())
  where job.id = inserted_job.id;
  update private.book_builder_runs as run
  set current_job_id = inserted_job.id, stage = p_stage,
      status = case when run.retry_count > 0 then 'RETRYING' else 'PENDING' end,
      error_code = null, updated_at = timezone('utc', now())
  where run.id = target_run.id;
  return inserted_job.id;
end;
$$;

create function private.book_builder_draft_json(p_pack_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'schemaVersion', 'book-builder-draft.v1',
    'shortDescription', pack.short_description,
    'book', pg_catalog.jsonb_build_object(
      'title', book.title, 'author', book.author, 'publisher', book.publisher,
      'publicationYear', book.publication_year, 'genre', book.genre,
      'edition', book.edition, 'translator', book.translator, 'isbn', book.isbn,
      'identityNote', book.identity_note
    ),
    'sections', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sectionId', section.id, 'code', section.code,
        'displayOrder', section.display_order, 'coverage', section.coverage,
        'reviewStatus', section.review_status,
        'items', coalesce((select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'itemId', item.id, 'displayOrder', item.display_order,
            'kind', item.kind, 'title', item.title, 'content', item.content,
            'bookLocator', item.book_locator, 'evidenceState', item.evidence_state,
            'reviewStatus', item.review_status
          ) order by item.display_order, item.id)
          from public.book_context_items as item where item.section_id = section.id
        ), '[]'::jsonb)
      ) order by section.display_order, section.id)
      from public.book_context_sections as section where section.pack_version_id = pack.id
    ), '[]'::jsonb),
    'sources', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'sourceId', source.id, 'tier', source.tier, 'sourceType', source.source_type,
        'title', source.title, 'authorOrPublisher', source.author_or_publisher,
        'url', source.url, 'bibliographicLocator', source.bibliographic_locator,
        'publishedAt', source.published_at, 'researchedAt', source.researched_at,
        'unavailableAt', source.unavailable_at, 'usageNote', source.usage_note,
        'rightsNote', source.rights_note
      ) order by source.id) from public.book_context_sources as source
      where source.pack_version_id = pack.id
    ), '[]'::jsonb),
    'itemLinks', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'fromItemId', link.from_item_id, 'toItemId', link.to_item_id,
        'relation', link.relation
      ) order by link.from_item_id, link.to_item_id, link.relation)
      from public.book_context_item_links as link where link.pack_version_id = pack.id
    ), '[]'::jsonb),
    'itemSources', coalesce((select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'itemId', evidence.item_id, 'sourceId', evidence.source_id,
        'relation', evidence.relation, 'evidenceLocator', evidence.evidence_locator,
        'crossValidationGroup', evidence.cross_validation_group
      ) order by evidence.item_id, evidence.source_id, evidence.relation)
      from public.book_context_item_sources as evidence where evidence.pack_version_id = pack.id
    ), '[]'::jsonb)
  )
  from public.book_context_pack_versions as pack
  join public.books as book on book.id = pack.book_id
  where pack.id = p_pack_version_id;
$$;

create function private.book_context_validation_json(p_pack_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with hard as (
    select 'BOOK_IDENTITY_INCOMPLETE' as code
    where exists (
      select 1 from public.book_context_pack_versions pack join public.books book on book.id = pack.book_id
      where pack.id = p_pack_version_id and (book.publisher is null or book.publication_year is null)
    )
    union select 'SECTION_SET_INVALID' where (
      select count(distinct section.code) from public.book_context_sections section
      where section.pack_version_id = p_pack_version_id
    ) <> 7
    union select 'PACK_EMPTY' where not exists (
      select 1 from public.book_context_items item
      where item.pack_version_id = p_pack_version_id
    )
    union select 'UNREVIEWED_CONTENT' where exists (
      select 1 from public.book_context_sections section
      where section.pack_version_id = p_pack_version_id
        and section.review_status <> 'REVIEWED'
      union all
      select 1 from public.book_context_items item
      where item.pack_version_id = p_pack_version_id
        and item.review_status <> 'REVIEWED'
    )
    union select 'FACT_SOURCE_MISSING' where exists (
      select 1 from public.book_context_items item
      where item.pack_version_id = p_pack_version_id and item.kind = 'FACT'
        and not exists (select 1 from public.book_context_item_sources evidence
          where evidence.pack_version_id = item.pack_version_id and evidence.item_id = item.id and evidence.relation = 'SUPPORTS')
    )
    union select 'FACT_LOW_TIER_ONLY' where exists (
      select 1 from public.book_context_items item
      where item.pack_version_id = p_pack_version_id and item.kind = 'FACT'
        and exists (select 1 from public.book_context_item_sources evidence
          where evidence.pack_version_id = item.pack_version_id and evidence.item_id = item.id and evidence.relation = 'SUPPORTS')
        and not exists (select 1 from public.book_context_item_sources evidence
          join public.book_context_sources source on source.id = evidence.source_id and source.pack_version_id = evidence.pack_version_id
          where evidence.pack_version_id = item.pack_version_id and evidence.item_id = item.id
            and evidence.relation = 'SUPPORTS' and source.tier in ('A','B','C'))
    )
    union select 'AUTHOR_STATEMENT_SOURCE_MISSING' where exists (
      select 1 from public.book_context_items item
      where item.pack_version_id = p_pack_version_id
        and item.kind = 'AUTHOR_STATEMENT'
        and not exists (
          select 1 from public.book_context_item_sources evidence
          join public.book_context_sources source
            on source.id = evidence.source_id
           and source.pack_version_id = evidence.pack_version_id
          where evidence.pack_version_id = item.pack_version_id
            and evidence.item_id = item.id
            and evidence.relation = 'SUPPORTS'
            and source.tier = 'A'
        )
    )
  ), warnings as (
    select 'SECTION_COVERAGE_INCOMPLETE' as code where exists (
      select 1 from public.book_context_sections section where section.pack_version_id = p_pack_version_id and section.coverage <> 'READY'
    )
    union select 'LIMITED_OR_INSUFFICIENT_EVIDENCE' where exists (
      select 1 from public.book_context_items item where item.pack_version_id = p_pack_version_id and item.evidence_state in ('LIMITED','INSUFFICIENT')
    )
    union select 'SOURCE_CONFLICT_RETAINED' where exists (
      select 1 from public.book_context_items item where item.pack_version_id = p_pack_version_id and item.evidence_state = 'CONFLICT'
    )
    union select 'SOURCE_UNAVAILABLE' where exists (
      select 1 from public.book_context_sources source where source.pack_version_id = p_pack_version_id and source.unavailable_at is not null
    )
  )
  select pg_catalog.jsonb_build_object(
    'hardBlockers', coalesce((select pg_catalog.jsonb_agg(code order by code) from hard), '[]'::jsonb),
    'warnings', coalesce((select pg_catalog.jsonb_agg(code order by code) from warnings), '[]'::jsonb)
  );
$$;

create function private.replace_book_context_draft(
  p_pack_version_id uuid,
  p_expected_revision integer,
  p_draft jsonb,
  p_actor_user_id uuid,
  p_action text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pack public.book_context_pack_versions%rowtype;
  next_revision integer;
begin
  if jsonb_typeof(p_draft) <> 'object'
    or p_draft ->> 'schemaVersion' is distinct from 'book-builder-draft.v1'
    or jsonb_typeof(p_draft -> 'sections') <> 'array'
    or jsonb_array_length(p_draft -> 'sections') <> 7
    or not private.public_jsonb_keys_allowed(p_draft) then
    raise exception using errcode = '22023', message = 'book_builder_draft_invalid';
  end if;
  select pack.* into strict target_pack from public.book_context_pack_versions pack
  where pack.id = p_pack_version_id for update;
  if target_pack.status <> 'DRAFT' then
    raise exception using errcode = '55000', message = 'book_builder_draft_locked';
  end if;
  if target_pack.builder_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'book_builder_revision_conflict';
  end if;
  update public.books as book set
    title = p_draft #>> '{book,title}', author = p_draft #>> '{book,author}',
    publisher = p_draft #>> '{book,publisher}',
    publication_year = nullif(p_draft #>> '{book,publicationYear}', '')::integer,
    genre = p_draft #>> '{book,genre}', edition = p_draft #>> '{book,edition}',
    translator = p_draft #>> '{book,translator}', isbn = p_draft #>> '{book,isbn}',
    identity_note = p_draft #>> '{book,identityNote}', updated_at = timezone('utc', now())
  where book.id = target_pack.book_id;

  delete from public.book_context_item_sources where pack_version_id = p_pack_version_id;
  delete from public.book_context_item_links where pack_version_id = p_pack_version_id;
  delete from public.book_context_items where pack_version_id = p_pack_version_id;
  delete from public.book_context_sources where pack_version_id = p_pack_version_id;
  delete from public.book_context_sections where pack_version_id = p_pack_version_id;

  insert into public.book_context_sections (
    id, pack_version_id, code, display_order, coverage, review_status
  ) select
    (section ->> 'sectionId')::uuid, p_pack_version_id, section ->> 'code',
    (section ->> 'displayOrder')::integer, section ->> 'coverage', section ->> 'reviewStatus'
  from pg_catalog.jsonb_array_elements(p_draft -> 'sections') as section;
  insert into public.book_context_items (
    id, pack_version_id, section_id, display_order, kind, title, content,
    book_locator, evidence_state, review_status, last_reviewed_by
  ) select
    (item ->> 'itemId')::uuid, p_pack_version_id, (section ->> 'sectionId')::uuid,
    (item ->> 'displayOrder')::integer, item ->> 'kind', item ->> 'title',
    item ->> 'content', item ->> 'bookLocator', item ->> 'evidenceState',
    item ->> 'reviewStatus', case when item ->> 'reviewStatus' = 'REVIEWED' then p_actor_user_id else null end
  from pg_catalog.jsonb_array_elements(p_draft -> 'sections') section
  cross join lateral pg_catalog.jsonb_array_elements(section -> 'items') item;
  insert into public.book_context_sources (
    id, pack_version_id, tier, source_type, title, author_or_publisher, url,
    bibliographic_locator, published_at, researched_at, unavailable_at,
    usage_note, rights_note
  ) select
    (source ->> 'sourceId')::uuid, p_pack_version_id, source ->> 'tier',
    source ->> 'sourceType', source ->> 'title', source ->> 'authorOrPublisher',
    source ->> 'url', source ->> 'bibliographicLocator',
    (source ->> 'publishedAt')::timestamptz, (source ->> 'researchedAt')::timestamptz,
    (source ->> 'unavailableAt')::timestamptz, source ->> 'usageNote', source ->> 'rightsNote'
  from pg_catalog.jsonb_array_elements(p_draft -> 'sources') source;
  insert into public.book_context_item_links (
    pack_version_id, from_item_id, to_item_id, relation
  ) select p_pack_version_id, (link ->> 'fromItemId')::uuid,
    (link ->> 'toItemId')::uuid, link ->> 'relation'
  from pg_catalog.jsonb_array_elements(p_draft -> 'itemLinks') link;
  insert into public.book_context_item_sources (
    pack_version_id, item_id, source_id, relation, evidence_locator, cross_validation_group
  ) select p_pack_version_id, (evidence ->> 'itemId')::uuid,
    (evidence ->> 'sourceId')::uuid, evidence ->> 'relation',
    evidence ->> 'evidenceLocator', evidence ->> 'crossValidationGroup'
  from pg_catalog.jsonb_array_elements(p_draft -> 'itemSources') evidence;

  next_revision := target_pack.builder_revision + 1;
  update public.book_context_pack_versions as pack
  set short_description = p_draft ->> 'shortDescription',
      builder_revision = next_revision, updated_at = timezone('utc', now())
  where pack.id = p_pack_version_id;
  insert into public.book_context_admin_audit (
    actor_user_id, pack_version_id, action, before_metadata, after_metadata, occurred_at
  ) values (
    p_actor_user_id, p_pack_version_id, p_action,
    pg_catalog.jsonb_build_object('revision', target_pack.builder_revision),
    pg_catalog.jsonb_build_object('revision', next_revision), timezone('utc', now())
  );
  return next_revision;
end;
$$;

create function private.book_builder_run_json(p_run_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'runId', run.id, 'packVersionId', run.pack_version_id,
    'stage', run.stage, 'status', run.status,
    'completedStageCount', run.completed_stage_count,
    'errorCode', run.error_code, 'updatedAt', run.updated_at,
    'scope', run.scope, 'targetItemId', run.target_item_id
  ) from private.book_builder_runs run where run.id = p_run_id;
$$;

create function private.book_context_admin_summary_json(p_pack_version_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'packVersionId', pack.id, 'bookId', book.id, 'title', book.title,
    'author', book.author, 'version', pack.version, 'status', pack.status,
    'revision', pack.builder_revision, 'updatedAt', pack.updated_at,
    'builderRun', case when run.id is null then null else private.book_builder_run_json(run.id) end
  )
  from public.book_context_pack_versions pack join public.books book on book.id = pack.book_id
  left join lateral (
    select candidate.id from private.book_builder_runs candidate
    where candidate.pack_version_id = pack.id order by candidate.created_at desc limit 1
  ) run on true where pack.id = p_pack_version_id;
$$;

create function public.admin_create_book_context_pack(
  p_command_id uuid, p_request_fingerprint text, p_title text, p_author text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid(); receipt private.book_context_admin_command_receipts%rowtype;
  target_book public.books%rowtype; target_pack public.book_context_pack_versions%rowtype;
  run_id uuid; response jsonb; next_version integer;
  codes text[] := array['METADATA','STRUCTURE','THEMES','ENTITIES','SCENES_AND_CLAIMS','DISCUSSION_ISSUES','INTERPRETATION_CAUTIONS'];
begin
  if not private.is_admin(actor_id) then raise exception using errcode = '42501', message = 'admin_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0));
  select stored.* into receipt from private.book_context_admin_command_receipts stored
  where stored.actor_user_id = actor_id and stored.command_id = p_command_id;
  if found then
    if receipt.request_fingerprint <> p_request_fingerprint then raise exception using errcode = '40001', message = 'command_payload_mismatch'; end if;
    return receipt.response_payload || pg_catalog.jsonb_build_object('duplicate', true, 'serverTime', timezone('utc', now()));
  end if;
  if length(btrim(coalesce(p_title,''))) = 0 or length(btrim(coalesce(p_author,''))) = 0 then
    raise exception using errcode = '22023', message = 'book_identity_required';
  end if;
  select book.* into target_book from public.books book
  where lower(book.title) = lower(btrim(p_title)) and lower(book.author) = lower(btrim(p_author))
  order by book.created_at limit 1 for update;
  if not found then
    insert into public.books(title,author,publisher,publication_year)
    values(btrim(p_title),btrim(p_author),null,null) returning * into target_book;
  end if;
  select coalesce(max(pack.version),0)+1 into next_version from public.book_context_pack_versions pack where pack.book_id = target_book.id;
  insert into public.book_context_pack_versions(
    book_id,version,status,schema_version,short_description,created_by
  ) values(target_book.id,next_version,'DRAFT','1','검수 전 초안',actor_id) returning * into target_pack;
  insert into public.book_context_sections(pack_version_id,code,display_order,coverage,review_status)
  select target_pack.id, code, ordinal-1, 'MISSING', 'UNREVIEWED'
  from unnest(codes) with ordinality as section(code,ordinal);
  insert into private.book_builder_runs(pack_version_id,stage,status,base_revision,created_by)
  values(target_pack.id,'IDENTIFY_BOOK','PENDING',0,actor_id) returning id into run_id;
  perform private.enqueue_book_builder_job(run_id,'IDENTIFY_BOOK',1,0);
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target_pack.id,'CREATE_DRAFT',pg_catalog.jsonb_build_object('version',next_version));
  response := pg_catalog.jsonb_build_object(
    'packVersionId', target_pack.id, 'status', 'DRAFT', 'revision', 0,
    'run', private.book_builder_run_json(run_id), 'duplicate', false
  );
  insert into private.book_context_admin_command_receipts(actor_user_id,command_id,request_fingerprint,response_payload)
  values(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime', timezone('utc', now()));
end;
$$;

create function public.admin_list_book_context_packs()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception using errcode = '42501', message = 'admin_required'; end if;
  return coalesce((select pg_catalog.jsonb_agg(private.book_context_admin_summary_json(pack.id) order by pack.updated_at desc)
    from public.book_context_pack_versions pack), '[]'::jsonb);
end;
$$;

create function public.admin_get_book_context_pack(p_pack_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin(auth.uid()) then raise exception using errcode = '42501', message = 'admin_required'; end if;
  if not exists(select 1 from public.book_context_pack_versions where id = p_pack_version_id) then
    raise exception using errcode = 'P0002', message = 'book_context_pack_not_found';
  end if;
  return pg_catalog.jsonb_build_object(
    'pack', private.book_context_admin_summary_json(p_pack_version_id),
    'draft', private.book_builder_draft_json(p_pack_version_id),
    'validation', private.book_context_validation_json(p_pack_version_id),
    'pendingProposal', (
      select pg_catalog.jsonb_build_object(
        'proposalId', proposal.id, 'runId', proposal.run_id,
        'scope', proposal.scope, 'targetItemId', proposal.target_item_id,
        'baseRevision', proposal.base_revision, 'draft', proposal.proposed_draft,
        'createdAt', proposal.created_at
      )
      from private.book_builder_proposals proposal
      where proposal.pack_version_id = p_pack_version_id and proposal.status = 'PENDING'
      order by proposal.created_at desc limit 1
    )
  );
end;
$$;

create function public.admin_update_book_context_draft(
  p_command_id uuid, p_request_fingerprint text, p_pack_version_id uuid,
  p_expected_revision integer, p_draft jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); next_revision integer; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode = '42501', message = 'admin_required'; end if;
  replay := private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  next_revision := private.replace_book_context_draft(
    p_pack_version_id,p_expected_revision,p_draft,actor_id,'UPDATE_DRAFT'
  );
  response := pg_catalog.jsonb_build_object(
    'packVersionId',p_pack_version_id,'status','DRAFT','revision',next_revision,
    'duplicate',false
  );
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_review_book_context_pack(
  p_command_id uuid, p_request_fingerprint text, p_pack_version_id uuid, p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid := auth.uid(); target public.book_context_pack_versions%rowtype; run private.book_builder_runs%rowtype; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode = '42501', message = 'admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status <> 'DRAFT' or target.builder_revision <> p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  select candidate.* into run from private.book_builder_runs candidate where candidate.pack_version_id=target.id order by candidate.created_at desc limit 1;
  if run.status is distinct from 'SUCCEEDED' then raise exception using errcode='55000',message='book_builder_run_incomplete'; end if;
  update public.book_context_pack_versions pack set status='REVIEW',builder_revision=pack.builder_revision+1,updated_at=timezone('utc',now()) where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action) values(actor_id,target.id,'ENTER_REVIEW');
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','REVIEW','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_return_book_context_pack_to_draft(
  p_command_id uuid, p_request_fingerprint text, p_pack_version_id uuid, p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target public.book_context_pack_versions%rowtype; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status<>'REVIEW' or target.builder_revision<>p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  update public.book_context_pack_versions pack set status='DRAFT',builder_revision=pack.builder_revision+1,updated_at=timezone('utc',now()) where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action) values(actor_id,target.id,'RETURN_TO_DRAFT');
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','DRAFT','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_publish_book_context_pack(
  p_command_id uuid, p_request_fingerprint text, p_pack_version_id uuid,
  p_expected_revision integer, p_acknowledged_warnings text[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target public.book_context_pack_versions%rowtype; validation jsonb; warnings text[]; checksum_value text; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status<>'REVIEW' or target.builder_revision<>p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  validation:=private.book_context_validation_json(target.id);
  if jsonb_array_length(validation->'hardBlockers')>0 then raise exception using errcode='55000',message='book_context_publish_blocked'; end if;
  select coalesce(array_agg(value order by value),'{}'::text[]) into warnings from jsonb_array_elements_text(validation->'warnings') value;
  if warnings <> (select coalesce(array_agg(value order by value),'{}'::text[]) from unnest(coalesce(p_acknowledged_warnings,'{}'::text[])) value) then
    raise exception using errcode='55000',message='book_context_warnings_unacknowledged';
  end if;
  update public.book_context_pack_versions pack set status='RETIRED',retired_at=timezone('utc',now()),retired_by=actor_id,
    retire_reason='새 Pack version Publish',updated_at=timezone('utc',now())
  where pack.book_id=target.book_id and pack.status='PUBLISHED';
  checksum_value:=encode(extensions.digest(convert_to(private.book_builder_draft_json(target.id)::text,'UTF8'),'sha256'),'hex');
  update public.book_context_pack_versions pack set status='PUBLISHED',published_at=timezone('utc',now()),published_by=actor_id,
    checksum=checksum_value,builder_revision=pack.builder_revision+1,updated_at=timezone('utc',now()) where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target.id,'PUBLISH',pg_catalog.jsonb_build_object('checksum',checksum_value,'acknowledgedWarnings',warnings));
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','PUBLISHED','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_retire_book_context_pack(
  p_command_id uuid,p_request_fingerprint text,p_pack_version_id uuid,p_expected_revision integer,p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target public.book_context_pack_versions%rowtype; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  if length(btrim(coalesce(p_reason,'')))=0 then raise exception using errcode='22023',message='retire_reason_required'; end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status<>'PUBLISHED' or target.builder_revision<>p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  update public.book_context_pack_versions pack set status='RETIRED',retired_at=timezone('utc',now()),retired_by=actor_id,
    retire_reason=btrim(p_reason),builder_revision=pack.builder_revision+1,updated_at=timezone('utc',now()) where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,reason) values(actor_id,target.id,'RETIRE',btrim(p_reason));
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','RETIRED','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function private.read_book_builder_queue(
  p_visibility_timeout_seconds integer default 180,p_quantity integer default 1,p_max_poll_seconds integer default 0
)
returns table(queue_message_id bigint,queue_read_count integer,enqueued_at timestamptz,lease_expires_at timestamptz,message jsonb)
language sql security definer set search_path = '' as $$
  select queued.msg_id,queued.read_ct,queued.enqueued_at,queued.vt,queued.message
  from pgmq.read_with_poll('book-builder',p_visibility_timeout_seconds,p_quantity,p_max_poll_seconds,100,'{}'::jsonb) queued;
$$;

create function private.archive_book_builder_message(p_queue_message_id bigint)
returns boolean language sql security definer set search_path = '' as $$
  select pgmq.archive('book-builder', p_queue_message_id);
$$;

create function private.claim_book_builder_job(
  p_job_id uuid,p_queue_message_id bigint,p_queue_read_count integer,p_lease_expires_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job private.book_builder_jobs%rowtype; run private.book_builder_runs%rowtype; now_at timestamptz:=timezone('utc',now());
begin
  select target.* into job from private.book_builder_jobs target where target.id=p_job_id for update;
  if not found or job.queue_message_id<>p_queue_message_id then return pg_catalog.jsonb_build_object('claimState','POISON'); end if;
  if job.status in ('SUCCEEDED','FAILED') then return pg_catalog.jsonb_build_object('claimState','TERMINAL'); end if;
  if job.status='PROCESSING' and job.lease_expires_at>now_at then return pg_catalog.jsonb_build_object('claimState','LEASE_CONFLICT'); end if;
  if job.attempt_count>=job.max_attempts then
    update private.book_builder_jobs set status='FAILED',lease_expires_at=null,next_attempt_at=null,error_code='ATTEMPTS_EXHAUSTED',completed_at=now_at,updated_at=now_at where id=job.id;
    update private.book_builder_runs set status='FAILED',error_code='ATTEMPTS_EXHAUSTED',updated_at=now_at where id=job.run_id;
    return pg_catalog.jsonb_build_object('claimState','EXHAUSTED');
  end if;
  update private.book_builder_jobs set status='PROCESSING',attempt_count=attempt_count+1,lease_expires_at=p_lease_expires_at,next_attempt_at=null,updated_at=now_at where id=job.id returning * into job;
  update private.book_builder_runs set status='RUNNING',updated_at=now_at where id=job.run_id returning * into run;
  return pg_catalog.jsonb_build_object(
    'claimState','CLAIMED','jobId',job.id,'runId',job.run_id,'packVersionId',job.pack_version_id,
    'stage',job.stage,'generationNo',job.generation_no,'expectedRevision',job.expected_revision,
    'attemptNo',job.attempt_count,'maxAttempts',job.max_attempts,'leaseExpiresAt',job.lease_expires_at
  );
end;
$$;

create function private.read_book_builder_input(p_job_id uuid,p_attempt_no integer)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare job private.book_builder_jobs%rowtype; run private.book_builder_runs%rowtype;
begin
  select target.* into strict job from private.book_builder_jobs target where target.id=p_job_id;
  if job.status<>'PROCESSING' or job.attempt_count<>p_attempt_no then raise exception using errcode='55000',message='book_builder_attempt_stale'; end if;
  select target.* into strict run from private.book_builder_runs target where target.id=job.run_id;
  return pg_catalog.jsonb_build_object(
    'jobId',job.id,'runId',run.id,'packVersionId',job.pack_version_id,'stage',job.stage,
    'expectedRevision',job.expected_revision,'scope',run.scope,
    'targetItemId',run.target_item_id,
    'draft',private.book_builder_draft_json(job.pack_version_id),
    'artifacts',coalesce((select pg_catalog.jsonb_agg(artifact.canonical_artifact order by artifact.created_at)
      from private.book_builder_artifacts artifact where artifact.run_id=run.id),'[]'::jsonb)
  );
end;
$$;

create function private.complete_book_builder_stage(
  p_job_id uuid,p_attempt_no integer,p_artifact_schema_version text,p_artifact jsonb,p_provider_metadata jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job private.book_builder_jobs%rowtype; run private.book_builder_runs%rowtype; next_stage text; next_job uuid; next_revision integer; now_at timestamptz:=timezone('utc',now());
begin
  select target.* into strict job from private.book_builder_jobs target where target.id=p_job_id for update;
  select target.* into strict run from private.book_builder_runs target where target.id=job.run_id for update;
  if exists(select 1 from private.book_builder_artifacts where job_id=job.id) then
    return pg_catalog.jsonb_build_object('status','SUCCEEDED','duplicate',true);
  end if;
  if job.status<>'PROCESSING' or job.attempt_count<>p_attempt_no or job.lease_expires_at<=now_at then raise exception using errcode='55000',message='book_builder_attempt_stale'; end if;
  if jsonb_typeof(p_artifact)<>'object' or not private.public_jsonb_keys_allowed(p_artifact) then raise exception using errcode='22023',message='book_builder_artifact_invalid'; end if;
  insert into private.book_builder_artifacts(job_id,run_id,stage,schema_version,canonical_artifact,provider_metadata)
  values(job.id,run.id,job.stage,p_artifact_schema_version,p_artifact,p_provider_metadata);
  if job.stage='VALIDATE_DRAFT' and run.scope='INITIAL' then
    next_revision:=private.replace_book_context_draft(job.pack_version_id,job.expected_revision,p_artifact,null,'BUILDER_APPLY');
  elsif job.stage='VALIDATE_DRAFT' then
    insert into private.book_builder_proposals(
      run_id,pack_version_id,scope,target_item_id,base_revision,proposed_draft
    ) values (
      run.id,job.pack_version_id,run.scope,run.target_item_id,job.expected_revision,p_artifact
    );
  end if;
  update private.book_builder_jobs set status='SUCCEEDED',lease_expires_at=null,completed_at=now_at,updated_at=now_at where id=job.id;
  next_stage:=private.book_builder_next_stage(job.stage);
  if next_stage is null then
    update private.book_builder_runs set status='SUCCEEDED',completed_stage_count=7,completed_at=now_at,updated_at=now_at where id=run.id;
  else
    update private.book_builder_runs set completed_stage_count=private.book_builder_stage_index(job.stage),updated_at=now_at where id=run.id;
    next_job:=private.enqueue_book_builder_job(run.id,next_stage,1,job.expected_revision);
  end if;
  perform pgmq.archive('book-builder',job.queue_message_id);
  return pg_catalog.jsonb_build_object('status','SUCCEEDED','nextJobId',next_job,'revision',next_revision,'duplicate',false);
end;
$$;

create function private.fail_book_builder_job(p_job_id uuid,p_attempt_no integer,p_error_code text,p_retry boolean,p_delay_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job private.book_builder_jobs%rowtype; now_at timestamptz:=timezone('utc',now());
begin
  select target.* into strict job from private.book_builder_jobs target where target.id=p_job_id for update;
  if job.status<>'PROCESSING' or job.attempt_count<>p_attempt_no then return false; end if;
  if p_retry and job.attempt_count<job.max_attempts then
    perform pgmq.set_vt('book-builder',job.queue_message_id,p_delay_seconds);
    update private.book_builder_jobs set status='RETRY_SCHEDULED',lease_expires_at=null,next_attempt_at=now_at+make_interval(secs=>p_delay_seconds),error_code=p_error_code,updated_at=now_at where id=job.id;
    update private.book_builder_runs set status='RETRYING',error_code=p_error_code,updated_at=now_at where id=job.run_id;
  else
    perform pgmq.archive('book-builder',job.queue_message_id);
    update private.book_builder_jobs set status='FAILED',lease_expires_at=null,next_attempt_at=null,error_code=p_error_code,completed_at=now_at,updated_at=now_at where id=job.id;
    update private.book_builder_runs set status='FAILED',error_code=p_error_code,updated_at=now_at where id=job.run_id;
  end if;
  return true;
end;
$$;

create function private.extend_book_builder_lease(p_job_id uuid,p_attempt_no integer,p_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job private.book_builder_jobs%rowtype; expiry timestamptz;
begin
  select target.* into strict job from private.book_builder_jobs target where target.id=p_job_id for update;
  if job.status<>'PROCESSING' or job.attempt_count<>p_attempt_no then return false; end if;
  expiry:=timezone('utc',now())+make_interval(secs=>p_seconds);
  perform pgmq.set_vt('book-builder',job.queue_message_id,p_seconds);
  update private.book_builder_jobs set lease_expires_at=expiry,updated_at=timezone('utc',now()) where id=job.id;
  return true;
end;
$$;

create function public.admin_regenerate_book_context_pack(
  p_command_id uuid,p_request_fingerprint text,p_pack_version_id uuid,
  p_expected_revision integer,p_scope text,p_target_item_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target public.book_context_pack_versions%rowtype;
  replay jsonb; response jsonb; run_id uuid; next_job uuid;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  if p_scope not in ('FULL','ITEM') or ((p_scope='ITEM') <> (p_target_item_id is not null)) then
    raise exception using errcode='22023',message='book_builder_scope_invalid';
  end if;
  select pack.* into strict target from public.book_context_pack_versions pack
  where pack.id=p_pack_version_id for update;
  if target.status<>'DRAFT' or target.builder_revision<>p_expected_revision then
    raise exception using errcode='40001',message='book_builder_revision_conflict';
  end if;
  if exists(select 1 from private.book_builder_proposals proposal where proposal.pack_version_id=target.id and proposal.status='PENDING') then
    raise exception using errcode='55000',message='book_builder_proposal_pending';
  end if;
  if p_scope='ITEM' and not exists(
    select 1 from public.book_context_items item
    where item.pack_version_id=target.id and item.id=p_target_item_id
  ) then raise exception using errcode='P0002',message='book_context_item_not_found'; end if;
  insert into private.book_builder_runs(
    pack_version_id,stage,status,base_revision,scope,target_item_id,created_by
  ) values(target.id,'IDENTIFY_BOOK','PENDING',target.builder_revision,p_scope,p_target_item_id,actor_id)
  returning id into run_id;
  next_job:=private.enqueue_book_builder_job(run_id,'IDENTIFY_BOOK',1,target.builder_revision);
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target.id,'START_REGENERATION',pg_catalog.jsonb_build_object('scope',p_scope,'targetItemId',p_target_item_id));
  response:=pg_catalog.jsonb_build_object(
    'run',private.book_builder_run_json(run_id),'jobId',next_job,'duplicate',false
  );
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_apply_book_context_proposal(
  p_command_id uuid,p_request_fingerprint text,p_proposal_id uuid,p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); proposal private.book_builder_proposals%rowtype;
  replay jsonb; response jsonb; next_revision integer;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select target.* into strict proposal from private.book_builder_proposals target
  where target.id=p_proposal_id for update;
  if proposal.status<>'PENDING' then raise exception using errcode='55000',message='book_builder_proposal_resolved'; end if;
  if proposal.base_revision<>p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  next_revision:=private.replace_book_context_draft(
    proposal.pack_version_id,p_expected_revision,proposal.proposed_draft,actor_id,'APPLY_REGENERATION'
  );
  update private.book_builder_proposals set status='APPLIED',resolved_at=timezone('utc',now()),resolved_by=actor_id
  where id=proposal.id;
  response:=pg_catalog.jsonb_build_object('packVersionId',proposal.pack_version_id,'status','DRAFT','revision',next_revision,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_discard_book_context_proposal(
  p_command_id uuid,p_request_fingerprint text,p_proposal_id uuid,p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); proposal private.book_builder_proposals%rowtype;
  target public.book_context_pack_versions%rowtype; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select candidate.* into strict proposal from private.book_builder_proposals candidate
  where candidate.id=p_proposal_id for update;
  select pack.* into strict target from public.book_context_pack_versions pack
  where pack.id=proposal.pack_version_id for update;
  if proposal.status<>'PENDING' then raise exception using errcode='55000',message='book_builder_proposal_resolved'; end if;
  if target.status<>'DRAFT' or target.builder_revision<>p_expected_revision or proposal.base_revision<>p_expected_revision then
    raise exception using errcode='40001',message='book_builder_revision_conflict';
  end if;
  update private.book_builder_proposals set status='DISCARDED',resolved_at=timezone('utc',now()),resolved_by=actor_id
  where id=proposal.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action)
  values(actor_id,target.id,'DISCARD_REGENERATION');
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','DRAFT','revision',target.builder_revision,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

create function public.admin_retry_book_builder_run(p_command_id uuid,p_request_fingerprint text,p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); run private.book_builder_runs%rowtype; next_job uuid; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select target.* into strict run from private.book_builder_runs target where target.id=p_run_id for update;
  if run.status<>'FAILED' then raise exception using errcode='55000',message='book_builder_retry_unavailable'; end if;
  if (select builder_revision from public.book_context_pack_versions where id=run.pack_version_id)<>run.base_revision then
    raise exception using errcode='55000',message='book_builder_retry_stale';
  end if;
  update private.book_builder_runs set retry_count=retry_count+1,status='RETRYING',error_code=null,completed_at=null,updated_at=timezone('utc',now()) where id=run.id returning * into run;
  next_job:=private.enqueue_book_builder_job(run.id,run.stage,run.retry_count+1,run.base_revision);
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action) values(actor_id,run.pack_version_id,'RETRY_BUILDER');
  response:=private.book_builder_run_json(run.id) || pg_catalog.jsonb_build_object('jobId',next_job,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

revoke all on function private.enqueue_book_builder_job(uuid,text,integer,integer),
  private.replay_book_context_admin_command(uuid,uuid,text),
  private.store_book_context_admin_command(uuid,uuid,text,jsonb),
  private.book_builder_draft_json(uuid), private.book_context_validation_json(uuid),
  private.replace_book_context_draft(uuid,integer,jsonb,uuid,text),
  private.book_builder_run_json(uuid), private.book_context_admin_summary_json(uuid),
  private.read_book_builder_queue(integer,integer,integer),
  private.archive_book_builder_message(bigint),
  private.claim_book_builder_job(uuid,bigint,integer,timestamptz),
  private.read_book_builder_input(uuid,integer),
  private.complete_book_builder_stage(uuid,integer,text,jsonb,jsonb),
  private.fail_book_builder_job(uuid,integer,text,boolean,integer),
  private.extend_book_builder_lease(uuid,integer,integer)
from public,anon,authenticated;
grant execute on function private.read_book_builder_queue(integer,integer,integer),
  private.archive_book_builder_message(bigint),
  private.claim_book_builder_job(uuid,bigint,integer,timestamptz),
  private.read_book_builder_input(uuid,integer),
  private.complete_book_builder_stage(uuid,integer,text,jsonb,jsonb),
  private.fail_book_builder_job(uuid,integer,text,boolean,integer),
  private.extend_book_builder_lease(uuid,integer,integer)
to bookseasoning_ai_worker;

revoke all on function public.admin_create_book_context_pack(uuid,text,text,text),
  public.admin_list_book_context_packs(), public.admin_get_book_context_pack(uuid),
  public.admin_update_book_context_draft(uuid,text,uuid,integer,jsonb),
  public.admin_review_book_context_pack(uuid,text,uuid,integer),
  public.admin_return_book_context_pack_to_draft(uuid,text,uuid,integer),
  public.admin_publish_book_context_pack(uuid,text,uuid,integer,text[]),
  public.admin_retire_book_context_pack(uuid,text,uuid,integer,text),
  public.admin_regenerate_book_context_pack(uuid,text,uuid,integer,text,uuid),
  public.admin_apply_book_context_proposal(uuid,text,uuid,integer),
  public.admin_discard_book_context_proposal(uuid,text,uuid,integer),
  public.admin_retry_book_builder_run(uuid,text,uuid)
from public,anon;
grant execute on function public.admin_create_book_context_pack(uuid,text,text,text),
  public.admin_list_book_context_packs(), public.admin_get_book_context_pack(uuid),
  public.admin_update_book_context_draft(uuid,text,uuid,integer,jsonb),
  public.admin_review_book_context_pack(uuid,text,uuid,integer),
  public.admin_return_book_context_pack_to_draft(uuid,text,uuid,integer),
  public.admin_publish_book_context_pack(uuid,text,uuid,integer,text[]),
  public.admin_retire_book_context_pack(uuid,text,uuid,integer,text),
  public.admin_regenerate_book_context_pack(uuid,text,uuid,integer,text,uuid),
  public.admin_apply_book_context_proposal(uuid,text,uuid,integer),
  public.admin_discard_book_context_proposal(uuid,text,uuid,integer),
  public.admin_retry_book_builder_run(uuid,text,uuid)
to authenticated;
