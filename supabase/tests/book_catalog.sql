begin;

set local search_path = public, extensions;

select plan(14);

select has_table('public', 'books', 'books table exists');
select has_table(
  'public',
  'book_context_pack_versions',
  'book context pack versions table exists'
);
select has_view(
  'public',
  'published_book_catalog',
  'published book catalog view exists'
);
select has_function(
  'public',
  'search_published_book_catalog',
  array['text', 'text', 'integer'],
  'published book search function exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.books'::regclass),
  'books has row level security enabled'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.book_context_pack_versions'::regclass
  ),
  'pack versions have row level security enabled'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  '20000000-0000-4000-8000-000000000001',
  'catalog-user@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"카탈로그 사용자"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '공개된 책',
    '공개 작가',
    '양념 출판사',
    2026
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '초안만 있는 책',
    '비공개 작가',
    '양념 출판사',
    2025
  );

insert into public.book_context_pack_versions (
  id,
  book_id,
  version,
  status,
  schema_version,
  short_description,
  published_at
)
values
  (
    '22000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    1,
    'PUBLISHED',
    '1',
    '공개된 소개',
    timezone('utc', now())
  ),
  (
    '22000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000002',
    1,
    'DRAFT',
    '1',
    '비공개 소개',
    null
  );

select throws_ok(
  $$
    insert into public.book_context_pack_versions (
      book_id, version, status, schema_version, short_description, published_at
    ) values (
      '21000000-0000-4000-8000-000000000001',
      2,
      'PUBLISHED',
      '1',
      '두 번째 공개본',
      timezone('utc', now())
    )
  $$,
  '23505',
  null,
  'only one pack version can be published for a book'
);

select throws_ok(
  $$
    insert into public.book_context_pack_versions (
      book_id, version, status, schema_version, short_description
    ) values (
      '21000000-0000-4000-8000-000000000002',
      2,
      'PUBLISHED',
      '1',
      '게시 시각 없는 공개본'
    )
  $$,
  '23514',
  null,
  'a published pack requires a published timestamp'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.books),
  1::bigint,
  'authenticated users only see books with a published pack'
);
select is(
  (select count(*) from public.book_context_pack_versions),
  1::bigint,
  'authenticated users only see published pack versions'
);
select is(
  (select count(*) from public.published_book_catalog),
  1::bigint,
  'catalog only contains a published selection item'
);
select is(
  (select short_description from public.published_book_catalog),
  '공개된 소개',
  'catalog exposes the published short description'
);
select is(
  (
    select count(*)
    from public.published_book_catalog
    where title ilike '%공개%'
       or author ilike '%공개%'
  ),
  1::bigint,
  'catalog supports title and author search'
);
select is(
  (
    select count(*)
    from public.search_published_book_catalog('없는 책', 'recent', 20)
  ),
  0::bigint,
  'search excludes unrelated books'
);

select * from finish();

rollback;
