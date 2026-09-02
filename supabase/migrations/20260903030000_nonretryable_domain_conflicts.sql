-- SQLSTATE 40001 is reserved for real transaction serialization failures.
-- PostgREST retries it automatically, so domain/optimistic-lock conflicts must
-- use a non-retryable application exception instead.
do $migration$
declare
  target record;
  definition text;
begin
  for target in
    select procedure.oid
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and procedure.prosrc like '%40001%'
  loop
    definition := pg_catalog.pg_get_functiondef(target.oid);
    execute pg_catalog.replace(definition, '''40001''', '''P0001''');
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prokind = 'f'
      and procedure.prosrc like '%40001%'
  ) then
    raise exception 'application functions still raise retryable SQLSTATE 40001';
  end if;
end
$migration$;
