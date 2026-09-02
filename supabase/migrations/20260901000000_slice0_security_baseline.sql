-- Slice 0 establishes schema ownership and least-privilege defaults.
-- Product tables and domain commands arrive in their owning vertical slices.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

comment on schema private is
  'Non-exposed storage for AI_PRIVATE content and restricted operational state.';

create table if not exists public.schema_migrations_guard (
  singleton boolean primary key default true check (singleton),
  migration_baseline text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.schema_migrations_guard enable row level security;

revoke all on table public.schema_migrations_guard from anon;
revoke all on table public.schema_migrations_guard from authenticated;

insert into public.schema_migrations_guard (singleton, migration_baseline)
values (true, 'slice-0')
on conflict (singleton) do update
set migration_baseline = excluded.migration_baseline,
    updated_at = timezone('utc', now());
