create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0),
  book_context_pack_version_id uuid not null
    references public.book_context_pack_versions(id) on delete restrict,
  scheduled_start_at timestamptz not null,
  password_hash text not null check (password_hash like '$argon2id$%'),
  password_version integer not null default 1 check (password_version > 0),
  min_participants integer not null,
  max_participants integer not null,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  aggregate_version integer not null default 1 check (aggregate_version > 0),
  canceled_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    min_participants >= 2
    and min_participants <= max_participants
    and max_participants <= 15
  )
);

create table public.room_memberships (
  room_id uuid not null references public.rooms(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (
    status in ('REGISTERED', 'PARTICIPATED', 'CANCELED', 'REMOVED', 'NO_SHOW')
  ),
  profile_name_snapshot text not null check (length(btrim(profile_name_snapshot)) > 0),
  joined_at timestamptz not null default timezone('utc', now()),
  participated_at timestamptz,
  canceled_at timestamptz,
  removed_at timestamptz,
  primary key (room_id, user_id)
);

create table public.session_runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete restrict,
  phase text not null default 'SCHEDULED' check (
    phase in ('SCHEDULED', 'OPENING', 'CORE', 'EXTENDED', 'SYNTHESIS', 'CLOSING', 'ENDED')
  ),
  phase_version integer not null default 0 check (phase_version >= 0),
  started_at timestamptz,
  discussion_ends_at timestamptz,
  closing_ends_at timestamptz,
  ended_at timestamptz,
  extension_count integer not null default 0 check (extension_count >= 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index rooms_search_schedule_idx
on public.rooms (scheduled_start_at asc)
where canceled_at is null;
create index room_memberships_user_idx
on public.room_memberships (user_id, status);

alter table public.rooms enable row level security;
alter table public.room_memberships enable row level security;
alter table public.session_runs enable row level security;

create table private.room_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  command_type text not null check (command_type = 'CREATE_ROOM'),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

revoke all on table private.room_command_receipts from public, anon, authenticated;

revoke all on table public.rooms from anon, authenticated;
revoke all on table public.room_memberships from anon, authenticated;
revoke all on table public.session_runs from anon, authenticated;

create function public.create_room(
  p_command_id uuid,
  p_title text,
  p_pack_version_id uuid,
  p_scheduled_start_at timestamptz,
  p_password_hash text,
  p_min_participants integer,
  p_max_participants integer
)
returns table (
  room_id uuid,
  aggregate_version integer,
  duplicate boolean,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile_name text;
  created_room_id uuid;
  occurred_at timestamptz := timezone('utc', now());
  previous_room_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );

  select receipt.room_id
  into previous_room_id
  from private.room_command_receipts as receipt
  where receipt.actor_user_id = actor_id
    and receipt.command_id = p_command_id;

  if previous_room_id is not null then
    return query
    select previous_room_id, room.aggregate_version, true, occurred_at
    from public.rooms as room
    where room.id = previous_room_id;
    return;
  end if;

  if btrim(coalesce(p_title, '')) = '' then
    raise exception using errcode = '22023', message = 'room_title_required';
  end if;

  if p_min_participants < 2
    or p_min_participants > p_max_participants
    or p_max_participants > 15 then
    raise exception using errcode = '22023', message = 'invalid_room_capacity';
  end if;

  if p_password_hash is null or p_password_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'invalid_password_hash';
  end if;

  if not exists (
    select 1
    from public.book_context_pack_versions as pack
    where pack.id = p_pack_version_id
      and pack.status = 'PUBLISHED'
  ) then
    raise exception using errcode = '22023', message = 'published_pack_required';
  end if;

  select profile.profile_name
  into actor_profile_name
  from public.profiles as profile
  where profile.user_id = actor_id;

  if actor_profile_name is null then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;

  insert into public.rooms (
    title,
    book_context_pack_version_id,
    scheduled_start_at,
    password_hash,
    min_participants,
    max_participants,
    host_user_id,
    created_at,
    updated_at
  ) values (
    btrim(p_title),
    p_pack_version_id,
    p_scheduled_start_at,
    p_password_hash,
    p_min_participants,
    p_max_participants,
    actor_id,
    occurred_at,
    occurred_at
  )
  returning id into created_room_id;

  insert into public.room_memberships (
    room_id,
    user_id,
    status,
    profile_name_snapshot,
    joined_at
  ) values (
    created_room_id,
    actor_id,
    'REGISTERED',
    actor_profile_name,
    occurred_at
  );

  insert into public.session_runs (room_id, created_at)
  values (created_room_id, occurred_at);

  insert into private.room_command_receipts (
    actor_user_id, command_id, command_type, room_id, created_at
  ) values (
    actor_id, p_command_id, 'CREATE_ROOM', created_room_id, occurred_at
  );

  return query select created_room_id, 1, false, occurred_at;
end;
$$;

revoke all on function public.create_room(uuid, text, uuid, timestamptz, text, integer, integer)
from public, anon;
grant execute on function public.create_room(uuid, text, uuid, timestamptz, text, integer, integer)
to authenticated;

create function public.search_rooms(
  p_query text default '',
  p_limit integer default 20
)
returns table (
  room_id uuid,
  title text,
  scheduled_start_at timestamptz,
  display_status text,
  availability text,
  participant_count bigint,
  max_participants integer,
  host_profile_name text,
  pack_version_id uuid,
  book_title text,
  book_author text,
  book_cover_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    room.id,
    room.title,
    room.scheduled_start_at,
    case
      when session.phase = 'SCHEDULED' and room.scheduled_start_at > timezone('utc', now())
        then 'SCHEDULED'
      when session.phase = 'SCHEDULED' then 'WAITING'
      when session.phase in ('OPENING', 'CORE') then 'DISCUSSING'
      when session.phase = 'EXTENDED' then 'EXTENDED'
      when session.phase in ('SYNTHESIS', 'CLOSING') then 'CLOSING'
      else 'ENDED'
    end,
    case
      when count(membership.user_id) >= room.max_participants then 'FULL'
      else 'OPEN'
    end,
    count(membership.user_id),
    room.max_participants,
    host_profile.profile_name,
    pack.id,
    book.title,
    book.author,
    book.cover_url
  from public.rooms as room
  join public.session_runs as session on session.room_id = room.id
  join public.book_context_pack_versions as pack
    on pack.id = room.book_context_pack_version_id
  join public.books as book on book.id = pack.book_id
  join public.profiles as host_profile on host_profile.user_id = room.host_user_id
  left join public.room_memberships as membership
    on membership.room_id = room.id
   and membership.status in ('REGISTERED', 'PARTICIPATED')
  where room.canceled_at is null
    and session.phase <> 'ENDED'
    and (
      btrim(coalesce(p_query, '')) = ''
      or room.title ilike '%' || btrim(p_query) || '%'
      or book.title ilike '%' || btrim(p_query) || '%'
      or book.author ilike '%' || btrim(p_query) || '%'
    )
  group by room.id, session.phase, host_profile.profile_name, pack.id, book.id
  order by room.scheduled_start_at asc, room.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.search_rooms(text, integer) from public, anon;
grant execute on function public.search_rooms(text, integer) to authenticated;
