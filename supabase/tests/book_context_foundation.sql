begin;

set local search_path = public, extensions;

select plan(21);

select has_table('public', 'book_context_sections', 'pack sections table exists');
select has_table('public', 'book_context_items', 'pack items table exists');
select has_table('public', 'book_context_item_links', 'pack item links table exists');
select has_table('public', 'book_context_sources', 'pack sources table exists');
select has_table('public', 'book_context_item_sources', 'pack evidence table exists');
select has_function(
  'public',
  'get_book_context_pack_document',
  array['uuid'],
  'canonical pack provider function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_book_context_pack_document(uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot call the internal pack provider directly'
);

insert into public.books (
  id,
  title,
  author,
  publisher,
  publication_year,
  genre,
  edition,
  identity_note
) values (
  '40000000-0000-4000-8000-000000000001',
  '질문이 자라는 책',
  '책은양념',
  '책은양념 출판부',
  2026,
  '에세이',
  '초판',
  'S2 contract 검증을 위한 합성 도서 fixture'
);

insert into public.book_context_pack_versions (
  id,
  book_id,
  version,
  status,
  schema_version,
  short_description,
  checksum
) values (
  '40000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  1,
  'DRAFT',
  '1',
  '구조화 Pack fixture',
  'fixture-v1'
);

insert into public.book_context_sections (
  id, pack_version_id, code, display_order, coverage, review_status
) values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'METADATA', 0, 'READY', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'STRUCTURE', 1, 'PARTIAL', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', 'THEMES', 2, 'PARTIAL', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000002', 'ENTITIES', 3, 'PARTIAL', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000002', 'SCENES_AND_CLAIMS', 4, 'PARTIAL', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'DISCUSSION_ISSUES', 5, 'PARTIAL', 'REVIEWED'),
  ('41000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000002', 'INTERPRETATION_CAUTIONS', 6, 'PARTIAL', 'REVIEWED');

insert into public.book_context_items (
  id,
  pack_version_id,
  section_id,
  display_order,
  kind,
  title,
  content,
  evidence_state,
  review_status
) values (
  '42000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000001',
  0,
  'FACT',
  '도서 식별',
  '이 항목은 합성 fixture임을 명시한다.',
  'SUPPORTED',
  'REVIEWED'
);

insert into public.book_context_sources (
  id,
  pack_version_id,
  tier,
  source_type,
  title,
  author_or_publisher,
  bibliographic_locator,
  researched_at,
  usage_note,
  rights_note
) values (
  '43000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  'A',
  'INTERNAL_FIXTURE',
  'S2 Book Context contract fixture',
  '책은양념',
  'packages/contracts/src/internal/book-context.fixture.ts',
  '2026-09-01T00:00:00Z',
  '자동 테스트에서만 사용',
  '합성 데이터'
);

insert into public.book_context_item_sources (
  pack_version_id,
  item_id,
  source_id,
  relation,
  evidence_locator
) values (
  '40000000-0000-4000-8000-000000000002',
  '42000000-0000-4000-8000-000000000001',
  '43000000-0000-4000-8000-000000000001',
  'SUPPORTS',
  'fixture declaration'
);

update public.book_context_pack_versions
set status = 'PUBLISHED',
    published_at = '2026-09-01T00:00:00Z',
    updated_at = '2026-09-01T00:00:00Z'
where id = '40000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)
    from public.book_context_sections
    where pack_version_id = '40000000-0000-4000-8000-000000000002'
  ),
  7::bigint,
  'fixture contains all seven canonical sections'
);
select is(
  (
    select count(*)
    from public.book_context_item_sources
    where pack_version_id = '40000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'fixture preserves item-source evidence'
);

set local role service_role;

select is(
  jsonb_array_length(
    public.get_book_context_pack_document(
      '40000000-0000-4000-8000-000000000002'
    )->'sections'
  ),
  7,
  'provider assembles seven sections'
);
select is(
  public.get_book_context_pack_document(
    '40000000-0000-4000-8000-000000000002'
  )->>'schemaVersion',
  '1',
  'provider preserves the schema version'
);
select is(
  public.get_book_context_pack_document(
    '40000000-0000-4000-8000-000000000002'
  )#>>'{sections,0,items,0,evidenceState}',
  'SUPPORTED',
  'provider preserves evidence state'
);

reset role;

select throws_ok(
  $$
    update public.book_context_items
    set content = '게시 후 변경 시도'
    where id = '42000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'published_pack_content_immutable',
  'published item updates are rejected'
);
select throws_ok(
  $$
    delete from public.book_context_sources
    where id = '43000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'published_pack_content_immutable',
  'published source deletion is rejected'
);
select throws_ok(
  $$
    update public.book_context_pack_versions
    set short_description = '게시 후 설명 변경'
    where id = '40000000-0000-4000-8000-000000000002'
  $$,
  '55000',
  'published_pack_version_immutable',
  'published version metadata is immutable'
);
select throws_ok(
  $$
    update public.books
    set title = '게시 후 책 제목 변경'
    where id = '40000000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'published_book_identity_immutable',
  'book identity used by a published version is immutable'
);

update public.book_context_pack_versions
set status = 'RETIRED',
    retired_at = timezone('utc', now()),
    retire_reason = 'fixture retirement',
    updated_at = timezone('utc', now())
where id = '40000000-0000-4000-8000-000000000002';

select is(
  (
    select count(*)
    from public.published_book_catalog
    where pack_version_id = '40000000-0000-4000-8000-000000000002'
  ),
  0::bigint,
  'retired version disappears from the new-room catalog'
);

set local role service_role;

select is(
  public.get_book_context_pack_document(
    '40000000-0000-4000-8000-000000000002'
  )->>'status',
  'RETIRED',
  'provider continues to load an exact retired version'
);

reset role;

select throws_ok(
  $$
    insert into public.book_context_sections (
      pack_version_id, code, display_order, coverage, review_status
    ) values (
      '40000000-0000-4000-8000-000000000002',
      'METADATA',
      99,
      'READY',
      'REVIEWED'
    )
  $$,
  '55000',
  'published_pack_content_immutable',
  'retired content remains immutable'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.book_context_items'::regclass),
  'pack items have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.book_context_sources'::regclass),
  'pack sources have RLS enabled'
);

select * from finish();

rollback;
