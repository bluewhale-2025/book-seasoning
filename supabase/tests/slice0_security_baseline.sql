begin;

set local search_path = public, extensions;

select plan(3);

select has_schema('private', 'private schema exists');
select has_table('public', 'schema_migrations_guard', 'migration guard exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.schema_migrations_guard'::regclass),
  'migration guard has row level security enabled'
);

select * from finish();

rollback;
