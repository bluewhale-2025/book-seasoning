alter table public.books
  add column genre text,
  add column edition text,
  add column translator text,
  add column isbn text,
  add column identity_note text;

alter table public.books
  add constraint books_genre_nonempty check (genre is null or length(btrim(genre)) > 0),
  add constraint books_edition_nonempty check (edition is null or length(btrim(edition)) > 0),
  add constraint books_translator_nonempty check (translator is null or length(btrim(translator)) > 0),
  add constraint books_isbn_nonempty check (isbn is null or length(btrim(isbn)) > 0),
  add constraint books_identity_note_nonempty check (
    identity_note is null or length(btrim(identity_note)) > 0
  );

alter table public.book_context_pack_versions
  add column checksum text,
  add column retired_by uuid references auth.users(id) on delete set null,
  add column retire_reason text,
  add column updated_at timestamptz not null default timezone('utc', now());

alter table public.book_context_pack_versions
  add constraint book_context_pack_checksum_nonempty check (
    checksum is null or length(btrim(checksum)) > 0
  ),
  add constraint book_context_pack_retire_reason_required check (
    status <> 'RETIRED' or length(btrim(retire_reason)) > 0
  );

create table public.book_context_sections (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  code text not null check (code in (
    'METADATA',
    'STRUCTURE',
    'THEMES',
    'ENTITIES',
    'SCENES_AND_CLAIMS',
    'DISCUSSION_ISSUES',
    'INTERPRETATION_CAUTIONS'
  )),
  display_order integer not null check (display_order >= 0),
  coverage text not null check (coverage in ('MISSING', 'PARTIAL', 'READY')),
  review_status text not null check (review_status in ('UNREVIEWED', 'REVIEWED')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (pack_version_id, code),
  unique (id, pack_version_id)
);

create table public.book_context_items (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  section_id uuid not null,
  display_order integer not null check (display_order >= 0),
  kind text not null check (kind in (
    'FACT', 'AUTHOR_STATEMENT', 'INTERPRETATION', 'DISCUSSION_SIGNAL'
  )),
  title text not null check (length(btrim(title)) > 0),
  content text not null check (length(btrim(content)) > 0),
  book_locator text check (book_locator is null or length(btrim(book_locator)) > 0),
  evidence_state text not null check (evidence_state in (
    'SUPPORTED', 'LIMITED', 'CONFLICT', 'INSUFFICIENT'
  )),
  review_status text not null check (review_status in ('UNREVIEWED', 'REVIEWED')),
  last_reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  foreign key (section_id, pack_version_id)
    references public.book_context_sections(id, pack_version_id) on delete restrict,
  unique (id, pack_version_id),
  unique (section_id, display_order)
);

create table public.book_context_item_links (
  pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  from_item_id uuid not null,
  to_item_id uuid not null,
  relation text not null check (relation in (
    'RELATED_TO', 'SUPPORTS', 'CONTRASTS', 'LOCATED_IN'
  )),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (pack_version_id, from_item_id, to_item_id, relation),
  foreign key (from_item_id, pack_version_id)
    references public.book_context_items(id, pack_version_id) on delete restrict,
  foreign key (to_item_id, pack_version_id)
    references public.book_context_items(id, pack_version_id) on delete restrict,
  check (from_item_id <> to_item_id)
);

create table public.book_context_sources (
  id uuid primary key default gen_random_uuid(),
  pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  tier text not null check (tier in ('A', 'B', 'C', 'D', 'E')),
  source_type text not null check (length(btrim(source_type)) > 0),
  title text not null check (length(btrim(title)) > 0),
  author_or_publisher text check (
    author_or_publisher is null or length(btrim(author_or_publisher)) > 0
  ),
  url text check (url is null or length(btrim(url)) > 0),
  bibliographic_locator text check (
    bibliographic_locator is null or length(btrim(bibliographic_locator)) > 0
  ),
  published_at timestamptz,
  researched_at timestamptz not null,
  unavailable_at timestamptz,
  usage_note text check (usage_note is null or length(btrim(usage_note)) > 0),
  rights_note text check (rights_note is null or length(btrim(rights_note)) > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, pack_version_id)
);

create table public.book_context_item_sources (
  pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  item_id uuid not null,
  source_id uuid not null,
  relation text not null check (relation in (
    'SUPPORTS', 'CONTRADICTS', 'CONTEXT_ONLY'
  )),
  evidence_locator text not null check (length(btrim(evidence_locator)) > 0),
  cross_validation_group text check (
    cross_validation_group is null or length(btrim(cross_validation_group)) > 0
  ),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (pack_version_id, item_id, source_id, relation),
  foreign key (item_id, pack_version_id)
    references public.book_context_items(id, pack_version_id) on delete restrict,
  foreign key (source_id, pack_version_id)
    references public.book_context_sources(id, pack_version_id) on delete restrict
);

create index book_context_sections_pack_idx
on public.book_context_sections (pack_version_id, display_order);
create index book_context_items_pack_idx
on public.book_context_items (pack_version_id, section_id, display_order);
create index book_context_sources_pack_idx
on public.book_context_sources (pack_version_id);

alter table public.book_context_sections enable row level security;
alter table public.book_context_items enable row level security;
alter table public.book_context_item_links enable row level security;
alter table public.book_context_sources enable row level security;
alter table public.book_context_item_sources enable row level security;

revoke all on table public.book_context_sections from public, anon, authenticated;
revoke all on table public.book_context_items from public, anon, authenticated;
revoke all on table public.book_context_item_links from public, anon, authenticated;
revoke all on table public.book_context_sources from public, anon, authenticated;
revoke all on table public.book_context_item_sources from public, anon, authenticated;

grant select on table public.books to service_role;
grant select on table public.book_context_pack_versions to service_role;
grant select on table public.book_context_sections to service_role;
grant select on table public.book_context_items to service_role;
grant select on table public.book_context_item_links to service_role;
grant select on table public.book_context_sources to service_role;
grant select on table public.book_context_item_sources to service_role;

create function private.reject_immutable_book_context_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pack_version_id uuid := case
    when tg_op = 'DELETE' then old.pack_version_id
    else new.pack_version_id
  end;
  target_status text;
begin
  select pack.status
  into target_status
  from public.book_context_pack_versions as pack
  where pack.id = target_pack_version_id;

  if target_status in ('PUBLISHED', 'RETIRED') then
    raise exception using errcode = '55000', message = 'published_pack_content_immutable';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.reject_immutable_book_context_content() from public;

create function private.reject_immutable_book_context_pack_version()
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
      and new.created_at = old.created_at
      and new.published_at = old.published_at then
      return new;
    end if;
    raise exception using errcode = '55000', message = 'published_pack_version_immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.reject_immutable_book_context_pack_version() from public;

create function private.reject_published_book_identity_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_book_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  if exists (
    select 1
    from public.book_context_pack_versions as pack
    where pack.book_id = target_book_id
      and pack.status in ('PUBLISHED', 'RETIRED')
  ) then
    raise exception using errcode = '55000', message = 'published_book_identity_immutable';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.reject_published_book_identity_mutation() from public;

create trigger published_book_identity_immutable
before update or delete on public.books
for each row execute function private.reject_published_book_identity_mutation();

create trigger book_context_pack_version_immutable
before update or delete on public.book_context_pack_versions
for each row execute function private.reject_immutable_book_context_pack_version();

create trigger book_context_sections_immutable
before insert or update or delete on public.book_context_sections
for each row execute function private.reject_immutable_book_context_content();

create trigger book_context_items_immutable
before insert or update or delete on public.book_context_items
for each row execute function private.reject_immutable_book_context_content();

create trigger book_context_item_links_immutable
before insert or update or delete on public.book_context_item_links
for each row execute function private.reject_immutable_book_context_content();

create trigger book_context_sources_immutable
before insert or update or delete on public.book_context_sources
for each row execute function private.reject_immutable_book_context_content();

create trigger book_context_item_sources_immutable
before insert or update or delete on public.book_context_item_sources
for each row execute function private.reject_immutable_book_context_content();

create function public.get_book_context_pack_document(p_pack_version_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', pack.schema_version,
    'packVersionId', pack.id,
    'packVersion', pack.version,
    'status', pack.status,
    'checksum', pack.checksum,
    'publishedAt', pack.published_at,
    'retiredAt', pack.retired_at,
    'book', jsonb_build_object(
      'bookId', book.id,
      'title', book.title,
      'author', book.author,
      'publisher', book.publisher,
      'publicationYear', book.publication_year,
      'genre', book.genre,
      'edition', book.edition,
      'translator', book.translator,
      'isbn', book.isbn,
      'coverUrl', book.cover_url,
      'identityNote', book.identity_note
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sectionId', section.id,
          'code', section.code,
          'displayOrder', section.display_order,
          'coverage', section.coverage,
          'reviewStatus', section.review_status,
          'items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'itemId', item.id,
                'sectionCode', section.code,
                'displayOrder', item.display_order,
                'kind', item.kind,
                'title', item.title,
                'content', item.content,
                'bookLocator', item.book_locator,
                'evidenceState', item.evidence_state,
                'reviewStatus', item.review_status
              ) order by item.display_order, item.id
            )
            from public.book_context_items as item
            where item.section_id = section.id
          ), '[]'::jsonb)
        ) order by section.display_order, section.id
      )
      from public.book_context_sections as section
      where section.pack_version_id = pack.id
    ), '[]'::jsonb),
    'itemLinks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'fromItemId', link.from_item_id,
          'toItemId', link.to_item_id,
          'relation', link.relation
        ) order by link.from_item_id, link.to_item_id, link.relation
      )
      from public.book_context_item_links as link
      where link.pack_version_id = pack.id
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sourceId', source.id,
          'tier', source.tier,
          'sourceType', source.source_type,
          'title', source.title,
          'authorOrPublisher', source.author_or_publisher,
          'url', source.url,
          'bibliographicLocator', source.bibliographic_locator,
          'publishedAt', source.published_at,
          'researchedAt', source.researched_at,
          'unavailableAt', source.unavailable_at,
          'usageNote', source.usage_note,
          'rightsNote', source.rights_note
        ) order by source.id
      )
      from public.book_context_sources as source
      where source.pack_version_id = pack.id
    ), '[]'::jsonb),
    'itemSources', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'itemId', evidence.item_id,
          'sourceId', evidence.source_id,
          'relation', evidence.relation,
          'evidenceLocator', evidence.evidence_locator,
          'crossValidationGroup', evidence.cross_validation_group
        ) order by evidence.item_id, evidence.source_id, evidence.relation
      )
      from public.book_context_item_sources as evidence
      where evidence.pack_version_id = pack.id
    ), '[]'::jsonb)
  )
  from public.book_context_pack_versions as pack
  join public.books as book on book.id = pack.book_id
  where pack.id = p_pack_version_id
    and pack.status in ('PUBLISHED', 'RETIRED');
$$;

revoke all on function public.get_book_context_pack_document(uuid)
from public, anon, authenticated;
grant execute on function public.get_book_context_pack_document(uuid)
to service_role;
