create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile_name text not null check (length(btrim(profile_name)) > 0),
  role text not null default 'USER' check (role in ('USER', 'ADMIN')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using ((select auth.uid()) = user_id);

create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_profile_name text;
begin
  normalized_profile_name := btrim(new.raw_user_meta_data ->> 'profile_name');

  if normalized_profile_name is null or normalized_profile_name = '' then
    raise exception using
      errcode = '22023',
      message = 'profile_name_required';
  end if;

  insert into public.profiles (user_id, profile_name)
  values (new.id, normalized_profile_name);

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;
revoke all on function private.handle_new_auth_user() from anon;
revoke all on function private.handle_new_auth_user() from authenticated;

create trigger auth_user_profile_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create function public.update_my_profile(p_profile_name text)
returns table (
  user_id uuid,
  profile_name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_profile_name text := btrim(p_profile_name);
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  if normalized_profile_name is null or normalized_profile_name = '' then
    raise exception using errcode = '22023', message = 'profile_name_required';
  end if;

  return query
  update public.profiles as profile
  set profile_name = normalized_profile_name,
      updated_at = timezone('utc', now())
  where profile.user_id = actor_id
  returning profile.user_id, profile.profile_name, profile.updated_at;

  if not found then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text) from public;
revoke all on function public.update_my_profile(text) from anon;
grant execute on function public.update_my_profile(text) to authenticated;

