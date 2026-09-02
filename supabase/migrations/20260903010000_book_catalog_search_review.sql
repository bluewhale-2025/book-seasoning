alter table public.book_context_pack_versions
  add column reviewed_by uuid references auth.users(id) on delete set null,
  add column reviewed_at timestamptz,
  add column reviewed_revision integer;

update public.book_context_pack_versions
set reviewed_by = created_by,
    reviewed_at = updated_at,
    reviewed_revision = builder_revision
where status = 'REVIEW';

alter table public.book_context_pack_versions
  add constraint book_context_pack_review_metadata_consistent check (
    (status = 'REVIEW' and reviewed_at is not null and reviewed_revision = builder_revision)
    or (status <> 'REVIEW')
  );

create table private.book_catalog_external_identifiers (
  provider text not null check (provider in ('KAKAO')),
  external_book_id text not null check (length(btrim(external_book_id)) > 0),
  book_id uuid not null references public.books(id) on delete restrict,
  isbn10 text check (isbn10 is null or isbn10 ~ '^[0-9]{9}[0-9X]$'),
  isbn13 text check (isbn13 is null or isbn13 ~ '^[0-9]{13}$'),
  selected_snapshot jsonb not null check (jsonb_typeof(selected_snapshot) = 'object'),
  observed_at timestamptz not null default timezone('utc', now()),
  primary key (provider, external_book_id)
);

create unique index book_catalog_external_identifiers_isbn13_idx
on private.book_catalog_external_identifiers (isbn13)
where isbn13 is not null;

revoke all on table private.book_catalog_external_identifiers from public, anon, authenticated;
grant select on table private.book_catalog_external_identifiers to service_role;

create or replace function private.book_context_validation_json(p_pack_version_id uuid)
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

revoke all on function public.admin_create_book_context_pack(uuid,text,text,text) from authenticated;
drop function public.admin_create_book_context_pack(uuid,text,text,text);

create function public.admin_create_book_context_pack(
  p_command_id uuid,
  p_request_fingerprint text,
  p_provider text,
  p_external_book_id text,
  p_selection jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  receipt private.book_context_admin_command_receipts%rowtype;
  target_book public.books%rowtype;
  target_pack public.book_context_pack_versions%rowtype;
  run_id uuid;
  response jsonb;
  next_version integer;
  normalized_isbn13 text := nullif(btrim(p_selection ->> 'isbn13'), '');
  normalized_isbn10 text := nullif(upper(btrim(p_selection ->> 'isbn10')), '');
  normalized_title text := btrim(coalesce(p_selection ->> 'title', ''));
  normalized_author text := btrim(coalesce(p_selection ->> 'author', ''));
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

  if coalesce(p_provider, '') <> 'KAKAO'
    or length(btrim(coalesce(p_external_book_id, ''))) = 0
    or length(p_external_book_id) > 1000
    or length(normalized_title) = 0
    or length(normalized_author) = 0
    or jsonb_typeof(p_selection) <> 'object'
    or not private.public_jsonb_keys_allowed(p_selection)
    or (normalized_isbn13 is not null and normalized_isbn13 !~ '^[0-9]{13}$')
    or (normalized_isbn10 is not null and normalized_isbn10 !~ '^[0-9]{9}[0-9X]$') then
    raise exception using errcode = '22023', message = 'book_selection_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_provider || ':' || p_external_book_id || ':' || coalesce(normalized_isbn13, ''), 0)
  );

  select book.* into target_book
  from private.book_catalog_external_identifiers identifier
  join public.books book on book.id = identifier.book_id
  where (identifier.provider = p_provider and identifier.external_book_id = p_external_book_id)
     or (normalized_isbn13 is not null and identifier.isbn13 = normalized_isbn13)
  order by case when identifier.provider = p_provider and identifier.external_book_id = p_external_book_id then 0 else 1 end
  limit 1;

  if not found then
    insert into public.books(
      title, author, publisher, publication_year, cover_url, translator, isbn
    ) values (
      normalized_title,
      normalized_author,
      nullif(btrim(p_selection ->> 'publisher'), ''),
      nullif(p_selection ->> 'publicationYear', '')::integer,
      nullif(btrim(p_selection ->> 'coverUrl'), ''),
      nullif(btrim(p_selection ->> 'translator'), ''),
      coalesce(normalized_isbn13, normalized_isbn10)
    ) returning * into target_book;
  end if;

  insert into private.book_catalog_external_identifiers(
    provider, external_book_id, book_id, isbn10, isbn13, selected_snapshot
  ) values (
    p_provider, p_external_book_id, target_book.id, normalized_isbn10,
    normalized_isbn13, p_selection
  )
  on conflict (provider, external_book_id) do nothing;

  select pack.* into target_pack
  from public.book_context_pack_versions pack
  where pack.book_id = target_book.id
  order by pack.version desc
  limit 1;
  if found then
    response := pg_catalog.jsonb_build_object(
      'packVersionId', target_pack.id,
      'status', target_pack.status,
      'revision', target_pack.builder_revision,
      'run', (
        select private.book_builder_run_json(run.id)
        from private.book_builder_runs run
        where run.pack_version_id=target_pack.id
        order by run.created_at desc
        limit 1
      ),
      'outcome', 'EXISTING',
      'duplicate', false
    );
    insert into private.book_context_admin_command_receipts(actor_user_id,command_id,request_fingerprint,response_payload)
    values(actor_id,p_command_id,p_request_fingerprint,response);
    return response || pg_catalog.jsonb_build_object('serverTime', timezone('utc', now()));
  end if;

  select coalesce(max(pack.version),0)+1 into next_version
  from public.book_context_pack_versions pack where pack.book_id = target_book.id;
  insert into public.book_context_pack_versions(
    book_id,version,status,schema_version,short_description,created_by
  ) values(
    target_book.id,next_version,'DRAFT','1',
    coalesce(nullif(btrim(p_selection ->> 'description'), ''), '검수 전 초안'),actor_id
  ) returning * into target_pack;
  insert into public.book_context_sections(pack_version_id,code,display_order,coverage,review_status)
  select target_pack.id, code, ordinal-1, 'MISSING', 'UNREVIEWED'
  from unnest(codes) with ordinality as section(code,ordinal);
  insert into private.book_builder_runs(pack_version_id,stage,status,base_revision,created_by)
  values(target_pack.id,'IDENTIFY_BOOK','PENDING',0,actor_id) returning id into run_id;
  perform private.enqueue_book_builder_job(run_id,'IDENTIFY_BOOK',1,0);
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target_pack.id,'CREATE_DRAFT',pg_catalog.jsonb_build_object(
    'version',next_version,'provider',p_provider,'externalBookId',p_external_book_id
  ));
  response := pg_catalog.jsonb_build_object(
    'packVersionId', target_pack.id, 'status', 'DRAFT', 'revision', 0,
    'run', private.book_builder_run_json(run_id), 'outcome', 'CREATED', 'duplicate', false
  );
  insert into private.book_context_admin_command_receipts(actor_user_id,command_id,request_fingerprint,response_payload)
  values(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime', timezone('utc', now()));
end;
$$;

revoke all on function public.admin_create_book_context_pack(uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.admin_create_book_context_pack(uuid,text,text,text,jsonb) to authenticated;

revoke all on function public.admin_review_book_context_pack(uuid,text,uuid,integer) from authenticated;
drop function public.admin_review_book_context_pack(uuid,text,uuid,integer);

create function public.admin_review_book_context_pack(
  p_command_id uuid,
  p_request_fingerprint text,
  p_pack_version_id uuid,
  p_expected_revision integer,
  p_acknowledged_warnings text[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  target public.book_context_pack_versions%rowtype;
  run private.book_builder_runs%rowtype;
  validation jsonb;
  warnings text[];
  next_revision integer;
  replay jsonb;
  response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status <> 'DRAFT' or target.builder_revision <> p_expected_revision then raise exception using errcode='40001',message='book_builder_revision_conflict'; end if;
  select candidate.* into run from private.book_builder_runs candidate where candidate.pack_version_id=target.id order by candidate.created_at desc limit 1;
  if run.status is distinct from 'SUCCEEDED' then raise exception using errcode='55000',message='book_builder_run_incomplete'; end if;
  validation:=private.book_context_validation_json(target.id);
  if jsonb_array_length(validation->'hardBlockers') > 0 then raise exception using errcode='55000',message='book_context_review_blocked'; end if;
  select coalesce(array_agg(value order by value),'{}'::text[]) into warnings
  from jsonb_array_elements_text(validation->'warnings') value;
  if warnings <> (
    select coalesce(array_agg(value order by value),'{}'::text[])
    from unnest(coalesce(p_acknowledged_warnings,'{}'::text[])) value
  ) then
    raise exception using errcode='55000',message='book_context_warnings_unacknowledged';
  end if;

  update public.book_context_sections set review_status='REVIEWED',updated_at=timezone('utc',now())
  where pack_version_id=target.id;
  update public.book_context_items set review_status='REVIEWED',last_reviewed_by=actor_id,updated_at=timezone('utc',now())
  where pack_version_id=target.id;
  next_revision:=target.builder_revision+1;
  update public.book_context_pack_versions pack
  set status='REVIEW',builder_revision=next_revision,reviewed_by=actor_id,
      reviewed_at=timezone('utc',now()),reviewed_revision=next_revision,
      updated_at=timezone('utc',now())
  where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target.id,'COMPLETE_REVIEW',pg_catalog.jsonb_build_object('acknowledgedWarnings',warnings,'reviewedRevision',next_revision));
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','REVIEW','revision',next_revision,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

revoke all on function public.admin_review_book_context_pack(uuid,text,uuid,integer,text[]) from public, anon;
grant execute on function public.admin_review_book_context_pack(uuid,text,uuid,integer,text[]) to authenticated;

create or replace function public.admin_return_book_context_pack_to_draft(
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
  update public.book_context_sections set review_status='UNREVIEWED',updated_at=timezone('utc',now()) where pack_version_id=target.id;
  update public.book_context_items set review_status='UNREVIEWED',last_reviewed_by=null,updated_at=timezone('utc',now()) where pack_version_id=target.id;
  update public.book_context_pack_versions pack
  set status='DRAFT',builder_revision=pack.builder_revision+1,reviewed_by=null,
      reviewed_at=null,reviewed_revision=null,updated_at=timezone('utc',now())
  where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action) values(actor_id,target.id,'RETURN_TO_DRAFT');
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','DRAFT','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

revoke all on function public.admin_publish_book_context_pack(uuid,text,uuid,integer,text[]) from authenticated;
drop function public.admin_publish_book_context_pack(uuid,text,uuid,integer,text[]);

create function public.admin_publish_book_context_pack(
  p_command_id uuid,
  p_request_fingerprint text,
  p_pack_version_id uuid,
  p_expected_revision integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor_id uuid:=auth.uid(); target public.book_context_pack_versions%rowtype; validation jsonb; checksum_value text; replay jsonb; response jsonb;
begin
  if not private.is_admin(actor_id) then raise exception using errcode='42501',message='admin_required'; end if;
  replay:=private.replay_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint);
  if replay is not null then return replay || pg_catalog.jsonb_build_object('duplicate',true,'serverTime',timezone('utc',now())); end if;
  select pack.* into strict target from public.book_context_pack_versions pack where pack.id=p_pack_version_id for update;
  if target.status<>'REVIEW' or target.builder_revision<>p_expected_revision or target.reviewed_revision<>target.builder_revision then
    raise exception using errcode='40001',message='book_builder_revision_conflict';
  end if;
  validation:=private.book_context_validation_json(target.id);
  if jsonb_array_length(validation->'hardBlockers')>0 then raise exception using errcode='55000',message='book_context_publish_blocked'; end if;
  update public.book_context_pack_versions pack set status='RETIRED',retired_at=timezone('utc',now()),retired_by=actor_id,
    retire_reason='새 Pack version Publish',updated_at=timezone('utc',now())
  where pack.book_id=target.book_id and pack.status='PUBLISHED';
  checksum_value:=encode(extensions.digest(convert_to(private.book_builder_draft_json(target.id)::text,'UTF8'),'sha256'),'hex');
  update public.book_context_pack_versions pack set status='PUBLISHED',published_at=timezone('utc',now()),published_by=actor_id,
    checksum=checksum_value,builder_revision=pack.builder_revision+1,updated_at=timezone('utc',now()) where pack.id=target.id;
  insert into public.book_context_admin_audit(actor_user_id,pack_version_id,action,after_metadata)
  values(actor_id,target.id,'PUBLISH',pg_catalog.jsonb_build_object('checksum',checksum_value,'reviewedRevision',target.reviewed_revision));
  response:=pg_catalog.jsonb_build_object('packVersionId',target.id,'status','PUBLISHED','revision',target.builder_revision+1,'duplicate',false);
  perform private.store_book_context_admin_command(actor_id,p_command_id,p_request_fingerprint,response);
  return response || pg_catalog.jsonb_build_object('serverTime',timezone('utc',now()));
end;
$$;

revoke all on function public.admin_publish_book_context_pack(uuid,text,uuid,integer) from public, anon;
grant execute on function public.admin_publish_book_context_pack(uuid,text,uuid,integer) to authenticated;

create or replace function private.reject_immutable_book_context_pack_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'RETIRED' then
    raise exception using errcode = '55000', message = 'retired_pack_version_immutable';
  end if;
  if old.status = 'PUBLISHED' then
    if tg_op = 'UPDATE'
      and new.status = 'RETIRED'
      and new.book_id = old.book_id
      and new.version = old.version
      and new.schema_version = old.schema_version
      and new.short_description = old.short_description
      and new.checksum is not distinct from old.checksum
      and new.created_by is not distinct from old.created_by
      and new.published_by is not distinct from old.published_by
      and new.reviewed_by is not distinct from old.reviewed_by
      and new.reviewed_at is not distinct from old.reviewed_at
      and new.reviewed_revision is not distinct from old.reviewed_revision
      and new.created_at = old.created_at
      and new.published_at = old.published_at then
      return new;
    end if;
    raise exception using errcode = '55000', message = 'published_pack_version_immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
