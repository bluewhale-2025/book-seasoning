create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  author text not null check (length(btrim(author)) > 0),
  publisher text not null check (length(btrim(publisher)) > 0),
  publication_year integer not null check (publication_year between 1 and 9999),
  cover_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.book_context_pack_versions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null check (status in ('DRAFT', 'REVIEW', 'PUBLISHED', 'RETIRED')),
  schema_version text not null check (length(btrim(schema_version)) > 0),
  short_description text not null check (length(btrim(short_description)) > 0),
  created_by uuid references auth.users(id) on delete set null,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  published_at timestamptz,
  retired_at timestamptz,
  unique (book_id, version),
  check (status <> 'PUBLISHED' or published_at is not null),
  check (status <> 'RETIRED' or retired_at is not null)
);

create unique index book_context_pack_one_published_per_book
on public.book_context_pack_versions (book_id)
where status = 'PUBLISHED';

create index books_title_search_idx on public.books (lower(title));
create index books_author_search_idx on public.books (lower(author));
create index book_context_pack_versions_published_idx
on public.book_context_pack_versions (published_at desc)
where status = 'PUBLISHED';

alter table public.books enable row level security;
alter table public.book_context_pack_versions enable row level security;

revoke all on table public.books from anon;
revoke all on table public.books from authenticated;
revoke all on table public.book_context_pack_versions from anon;
revoke all on table public.book_context_pack_versions from authenticated;
grant select on table public.books to authenticated;
grant select on table public.book_context_pack_versions to authenticated;

create policy books_select_with_published_pack
on public.books
for select
to authenticated
using (
  exists (
    select 1
    from public.book_context_pack_versions as pack
    where pack.book_id = books.id
      and pack.status = 'PUBLISHED'
  )
);

create policy book_context_pack_versions_select_published
on public.book_context_pack_versions
for select
to authenticated
using (status = 'PUBLISHED');

create view public.published_book_catalog
with (security_invoker = true)
as
select
  pack.id as pack_version_id,
  book.id as book_id,
  book.title,
  book.author,
  book.publisher,
  book.publication_year,
  book.cover_url,
  pack.short_description,
  pack.version as pack_version,
  pack.published_at
from public.book_context_pack_versions as pack
join public.books as book on book.id = pack.book_id
where pack.status = 'PUBLISHED';

revoke all on table public.published_book_catalog from anon;
revoke all on table public.published_book_catalog from authenticated;
grant select on table public.published_book_catalog to authenticated;

create function public.search_published_book_catalog(
  p_query text default '',
  p_sort text default 'recent',
  p_limit integer default 20
)
returns table (
  pack_version_id uuid,
  book_id uuid,
  title text,
  author text,
  publisher text,
  publication_year integer,
  cover_url text,
  short_description text,
  pack_version integer,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    catalog.pack_version_id,
    catalog.book_id,
    catalog.title,
    catalog.author,
    catalog.publisher,
    catalog.publication_year,
    catalog.cover_url,
    catalog.short_description,
    catalog.pack_version,
    catalog.published_at
  from public.published_book_catalog as catalog
  where btrim(coalesce(p_query, '')) = ''
     or catalog.title ilike '%' || btrim(p_query) || '%'
     or catalog.author ilike '%' || btrim(p_query) || '%'
  order by
    case when p_sort = 'title' then lower(catalog.title) end asc,
    case when p_sort = 'author' then lower(catalog.author) end asc,
    case when p_sort = 'recent' then catalog.published_at end desc,
    catalog.published_at desc,
    catalog.pack_version_id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_published_book_catalog(text, text, integer)
from public;
revoke all on function public.search_published_book_catalog(text, text, integer)
from anon;
grant execute on function public.search_published_book_catalog(text, text, integer)
to authenticated;
