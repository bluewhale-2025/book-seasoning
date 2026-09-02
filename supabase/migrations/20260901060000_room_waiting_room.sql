create table public.prep_entries (
  id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  author_profile_name_snapshot text not null check (
    length(btrim(author_profile_name_snapshot)) > 0
  ),
  prompt_type text not null check (prompt_type in (
    'QUOTE_THOUGHT', 'IMPRESSIVE_PART', 'DISCUSSION_QUESTION'
  )),
  visibility text not null check (visibility in ('PUBLIC', 'AI_PRIVATE')),
  public_body text,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (room_id, id),
  check (
    (visibility = 'PUBLIC' and length(btrim(public_body)) between 1 and 4000)
    or (visibility = 'AI_PRIVATE' and public_body is null)
  )
);

create table private.ai_private_prep_bodies (
  prep_entry_id uuid primary key references public.prep_entries(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete restrict,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table private.prep_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  command_type text not null check (command_type in ('UPSERT_PREP', 'DELETE_PREP')),
  room_id uuid not null references public.rooms(id) on delete cascade,
  entry_id uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  response_revision integer not null check (response_revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

create index prep_entries_room_idx
on public.prep_entries (room_id, visibility, updated_at, id);
create index ai_private_prep_author_idx
on private.ai_private_prep_bodies (author_user_id, room_id);

alter table public.prep_entries enable row level security;
revoke all on table public.prep_entries from public, anon, authenticated;
revoke all on table private.ai_private_prep_bodies from public, anon, authenticated;
revoke all on table private.prep_command_receipts from public, anon, authenticated;

create function private.room_display_status(
  p_scheduled_start_at timestamptz,
  p_phase text,
  p_canceled_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_canceled_at is not null or p_phase = 'CANCELED' then 'CANCELED'
    when p_phase = 'SCHEDULED' and p_scheduled_start_at > timezone('utc', now()) then 'SCHEDULED'
    when p_phase = 'SCHEDULED' then 'WAITING'
    when p_phase in ('OPENING', 'CORE') then 'DISCUSSING'
    when p_phase = 'EXTENDED' then 'EXTENDED'
    when p_phase in ('SYNTHESIS', 'CLOSING') then 'CLOSING'
    else 'ENDED'
  end;
$$;

revoke all on function private.room_display_status(timestamptz, text, timestamptz)
from public;

create function public.get_room_detail(p_room_id uuid)
returns table (
  room_id uuid,
  aggregate_version integer,
  title text,
  scheduled_start_at timestamptz,
  display_status text,
  availability text,
  participant_count bigint,
  min_participants integer,
  max_participants integer,
  actor_role text,
  membership_status text,
  pack_version_id uuid,
  book_title text,
  book_author text,
  book_cover_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_canceled_at timestamptz;
  target_phase text;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  select room.canceled_at, session.phase
  into target_canceled_at, target_phase
  from public.rooms as room
  join public.session_runs as session on session.room_id = room.id
  where room.id = p_room_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_canceled_at is not null or target_phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;

  return query
  select
    room.id,
    room.aggregate_version,
    room.title,
    room.scheduled_start_at,
    private.room_display_status(room.scheduled_start_at, session.phase, room.canceled_at),
    case when count(active_member.user_id) >= room.max_participants then 'FULL' else 'OPEN' end,
    count(active_member.user_id),
    room.min_participants,
    room.max_participants,
    case
      when room.host_user_id = actor_id then 'HOST'
      when actor_membership.status in ('REGISTERED', 'PARTICIPATED') then 'PARTICIPANT'
      else 'NONE'
    end,
    actor_membership.status,
    pack.id,
    book.title,
    book.author,
    book.cover_url
  from public.rooms as room
  join public.session_runs as session on session.room_id = room.id
  join public.book_context_pack_versions as pack
    on pack.id = room.book_context_pack_version_id
  join public.books as book on book.id = pack.book_id
  left join public.room_memberships as actor_membership
    on actor_membership.room_id = room.id
   and actor_membership.user_id = actor_id
  left join public.room_memberships as active_member
    on active_member.room_id = room.id
   and active_member.status in ('REGISTERED', 'PARTICIPATED')
  where room.id = p_room_id
  group by room.id, session.phase, actor_membership.status, pack.id, book.id;
end;
$$;

revoke all on function public.get_room_detail(uuid) from public, anon;
grant execute on function public.get_room_detail(uuid) to authenticated;

create function public.list_room_members(p_room_id uuid)
returns table (
  user_id uuid,
  profile_name text,
  membership_status text,
  is_host boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1
    from public.rooms as room
    join public.room_memberships as membership on membership.room_id = room.id
    where room.id = p_room_id
      and room.canceled_at is null
      and membership.user_id = actor_id
      and membership.status in ('REGISTERED', 'PARTICIPATED')
  ) then
    raise exception using errcode = '42501', message = 'room_membership_required';
  end if;

  return query
  select
    membership.user_id,
    membership.profile_name_snapshot,
    membership.status,
    membership.user_id = room.host_user_id
  from public.room_memberships as membership
  join public.rooms as room on room.id = membership.room_id
  where membership.room_id = p_room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED')
  order by (membership.user_id = room.host_user_id) desc, membership.joined_at, membership.user_id;
end;
$$;

revoke all on function public.list_room_members(uuid) from public, anon;
grant execute on function public.list_room_members(uuid) to authenticated;

create function public.list_my_rooms()
returns table (
  room_id uuid,
  title text,
  scheduled_start_at timestamptz,
  display_status text,
  actor_role text,
  membership_status text,
  pack_version_id uuid,
  book_title text,
  book_author text,
  book_cover_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  return query
  select
    room.id,
    room.title,
    room.scheduled_start_at,
    private.room_display_status(room.scheduled_start_at, session.phase, room.canceled_at),
    case when room.host_user_id = actor_id then 'HOST' else 'PARTICIPANT' end,
    membership.status,
    pack.id,
    book.title,
    book.author,
    book.cover_url
  from public.rooms as room
  join public.room_memberships as membership
    on membership.room_id = room.id
   and membership.user_id = actor_id
  join public.session_runs as session on session.room_id = room.id
  join public.book_context_pack_versions as pack
    on pack.id = room.book_context_pack_version_id
  join public.books as book on book.id = pack.book_id
  where membership.status in ('REGISTERED', 'PARTICIPATED', 'CANCELED_BY_ROOM')
     or room.host_user_id = actor_id
  order by room.scheduled_start_at desc, room.id;
end;
$$;

revoke all on function public.list_my_rooms() from public, anon;
grant execute on function public.list_my_rooms() to authenticated;

create function public.update_room(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_version integer,
  p_title text default null,
  p_pack_version_id uuid default null,
  p_scheduled_start_at timestamptz default null,
  p_password_hash text default null,
  p_min_participants integer default null,
  p_max_participants integer default null
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
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_phase text;
  active_count bigint;
  other_member_count bigint;
  next_min integer;
  next_max integer;
  next_version integer;
  previous_receipt private.room_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );
  select receipt.* into previous_receipt
  from private.room_command_receipts as receipt
  where receipt.actor_user_id = actor_id and receipt.command_id = p_command_id;
  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'UPDATE_ROOM'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select previous_receipt.room_id,
      previous_receipt.response_aggregate_version, true, occurred_at;
    return;
  end if;

  select room.* into target_room
  from public.rooms as room where room.id = p_room_id for update;
  select session.phase into target_phase
  from public.session_runs as session where session.room_id = p_room_id;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.host_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'room_host_required';
  end if;
  if target_room.canceled_at is not null or target_phase <> 'SCHEDULED' then
    raise exception using errcode = '55000', message = 'room_settings_locked';
  end if;
  if target_room.aggregate_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'aggregate_version_conflict';
  end if;
  if p_title is not null and btrim(p_title) = '' then
    raise exception using errcode = '22023', message = 'room_title_required';
  end if;
  if p_password_hash is not null and p_password_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'invalid_password_hash';
  end if;
  if p_pack_version_id is not null
    and not exists (
      select 1 from public.book_context_pack_versions as pack
      where pack.id = p_pack_version_id and pack.status = 'PUBLISHED'
    ) then
    raise exception using errcode = '22023', message = 'published_pack_required';
  end if;

  select count(*) filter (where membership.user_id <> actor_id), count(*)
  into other_member_count, active_count
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED');
  if p_pack_version_id is not null
    and p_pack_version_id <> target_room.book_context_pack_version_id
    and other_member_count > 0 then
    raise exception using errcode = '55000', message = 'room_book_locked_by_membership';
  end if;

  next_min := coalesce(p_min_participants, target_room.min_participants);
  next_max := coalesce(p_max_participants, target_room.max_participants);
  if next_min < 2 or next_min > next_max or next_max > 15 or next_max < active_count then
    raise exception using errcode = '22023', message = 'invalid_room_capacity';
  end if;

  update public.rooms as updating_room
  set title = coalesce(btrim(p_title), updating_room.title),
      book_context_pack_version_id = coalesce(
        p_pack_version_id, updating_room.book_context_pack_version_id
      ),
      scheduled_start_at = coalesce(p_scheduled_start_at, updating_room.scheduled_start_at),
      password_hash = coalesce(p_password_hash, updating_room.password_hash),
      password_version = updating_room.password_version
        + case when p_password_hash is null then 0 else 1 end,
      min_participants = next_min,
      max_participants = next_max,
      aggregate_version = updating_room.aggregate_version + 1,
      updated_at = occurred_at
  where updating_room.id = p_room_id
  returning updating_room.aggregate_version into next_version;

  insert into private.room_command_receipts (
    actor_user_id, command_id, command_type, room_id, request_fingerprint,
    response_aggregate_version, response_payload, created_at
  ) values (
    actor_id, p_command_id, 'UPDATE_ROOM', p_room_id, p_request_fingerprint,
    next_version, '{}'::jsonb, occurred_at
  );
  return query select p_room_id, next_version, false, occurred_at;
end;
$$;

revoke all on function public.update_room(
  uuid, text, uuid, integer, text, uuid, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.update_room(
  uuid, text, uuid, integer, text, uuid, timestamptz, text, integer, integer
) to authenticated;

create function private.complete_room_command(
  p_command_type text,
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_version integer,
  p_target_user_id uuid default null
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
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_phase text;
  target_membership_status text;
  next_version integer;
  previous_receipt private.room_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_command_type not in (
    'CANCEL_MEMBERSHIP', 'CANCEL_ROOM', 'TRANSFER_HOST', 'REMOVE_MEMBER'
  ) then
    raise exception using errcode = '22023', message = 'invalid_room_command';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );
  select receipt.* into previous_receipt
  from private.room_command_receipts as receipt
  where receipt.actor_user_id = actor_id and receipt.command_id = p_command_id;
  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> p_command_type
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select previous_receipt.room_id,
      previous_receipt.response_aggregate_version, true, occurred_at;
    return;
  end if;

  select room.* into target_room
  from public.rooms as room where room.id = p_room_id for update;
  select session.phase into target_phase
  from public.session_runs as session where session.room_id = p_room_id;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.aggregate_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'aggregate_version_conflict';
  end if;
  if target_room.canceled_at is not null or target_phase <> 'SCHEDULED' then
    raise exception using errcode = '55000', message = 'room_command_locked';
  end if;

  if p_command_type = 'CANCEL_MEMBERSHIP' then
    if target_room.host_user_id = actor_id then
      raise exception using errcode = '42501', message = 'host_cannot_cancel_membership';
    end if;
    update public.room_memberships as membership
    set status = 'CANCELED', canceled_at = occurred_at
    where membership.room_id = p_room_id
      and membership.user_id = actor_id
      and membership.status = 'REGISTERED';
    if not found then
      raise exception using errcode = 'P0002', message = 'registered_membership_not_found';
    end if;
  elsif p_command_type = 'CANCEL_ROOM' then
    if target_room.host_user_id <> actor_id then
      raise exception using errcode = '42501', message = 'room_host_required';
    end if;
    update public.rooms as room
    set canceled_at = occurred_at, updated_at = occurred_at
    where room.id = p_room_id;
    update public.session_runs as session
    set phase = 'CANCELED', phase_version = session.phase_version + 1
    where session.room_id = p_room_id;
    update public.room_memberships as membership
    set status = 'CANCELED_BY_ROOM', canceled_at = occurred_at
    where membership.room_id = p_room_id
      and membership.status = 'REGISTERED';
  elsif p_command_type = 'TRANSFER_HOST' then
    if target_room.host_user_id <> actor_id then
      raise exception using errcode = '42501', message = 'room_host_required';
    end if;
    if p_target_user_id is null or p_target_user_id = actor_id then
      raise exception using errcode = '22023', message = 'invalid_host_transfer_target';
    end if;
    select membership.status into target_membership_status
    from public.room_memberships as membership
    where membership.room_id = p_room_id and membership.user_id = p_target_user_id;
    if target_membership_status <> 'REGISTERED' then
      raise exception using errcode = '22023', message = 'host_transfer_target_not_registered';
    end if;
    update public.rooms as room
    set host_user_id = p_target_user_id, updated_at = occurred_at
    where room.id = p_room_id;
  else
    if target_room.host_user_id <> actor_id then
      raise exception using errcode = '42501', message = 'room_host_required';
    end if;
    if p_target_user_id is null or p_target_user_id = actor_id then
      raise exception using errcode = '22023', message = 'invalid_remove_target';
    end if;
    update public.room_memberships as membership
    set status = 'REMOVED', removed_at = occurred_at
    where membership.room_id = p_room_id
      and membership.user_id = p_target_user_id
      and membership.status = 'REGISTERED';
    if not found then
      raise exception using errcode = 'P0002', message = 'registered_membership_not_found';
    end if;
  end if;

  update public.rooms as updating_room
  set aggregate_version = updating_room.aggregate_version + 1,
      updated_at = occurred_at
  where updating_room.id = p_room_id
  returning updating_room.aggregate_version into next_version;

  insert into private.room_command_receipts (
    actor_user_id, command_id, command_type, room_id, request_fingerprint,
    response_aggregate_version, response_payload, created_at
  ) values (
    actor_id, p_command_id, p_command_type, p_room_id, p_request_fingerprint,
    next_version, '{}'::jsonb, occurred_at
  );
  return query select p_room_id, next_version, false, occurred_at;
end;
$$;

revoke all on function private.complete_room_command(
  text, uuid, text, uuid, integer, uuid
) from public, anon, authenticated;

create function public.cancel_room_membership(
  p_command_id uuid, p_request_fingerprint text, p_room_id uuid, p_expected_version integer
)
returns table (room_id uuid, aggregate_version integer, duplicate boolean, server_time timestamptz)
language sql security definer set search_path = ''
as $$
  select * from private.complete_room_command(
    'CANCEL_MEMBERSHIP', p_command_id, p_request_fingerprint,
    p_room_id, p_expected_version, null
  );
$$;

create function public.cancel_room(
  p_command_id uuid, p_request_fingerprint text, p_room_id uuid, p_expected_version integer
)
returns table (room_id uuid, aggregate_version integer, duplicate boolean, server_time timestamptz)
language sql security definer set search_path = ''
as $$
  select * from private.complete_room_command(
    'CANCEL_ROOM', p_command_id, p_request_fingerprint,
    p_room_id, p_expected_version, null
  );
$$;

create function public.transfer_room_host(
  p_command_id uuid, p_request_fingerprint text, p_room_id uuid,
  p_expected_version integer, p_target_user_id uuid
)
returns table (room_id uuid, aggregate_version integer, duplicate boolean, server_time timestamptz)
language sql security definer set search_path = ''
as $$
  select * from private.complete_room_command(
    'TRANSFER_HOST', p_command_id, p_request_fingerprint,
    p_room_id, p_expected_version, p_target_user_id
  );
$$;

create function public.remove_room_member(
  p_command_id uuid, p_request_fingerprint text, p_room_id uuid,
  p_expected_version integer, p_target_user_id uuid
)
returns table (room_id uuid, aggregate_version integer, duplicate boolean, server_time timestamptz)
language sql security definer set search_path = ''
as $$
  select * from private.complete_room_command(
    'REMOVE_MEMBER', p_command_id, p_request_fingerprint,
    p_room_id, p_expected_version, p_target_user_id
  );
$$;

revoke all on function public.cancel_room_membership(uuid, text, uuid, integer)
from public, anon;
revoke all on function public.cancel_room(uuid, text, uuid, integer)
from public, anon;
revoke all on function public.transfer_room_host(uuid, text, uuid, integer, uuid)
from public, anon;
revoke all on function public.remove_room_member(uuid, text, uuid, integer, uuid)
from public, anon;
grant execute on function public.cancel_room_membership(uuid, text, uuid, integer)
to authenticated;
grant execute on function public.cancel_room(uuid, text, uuid, integer)
to authenticated;
grant execute on function public.transfer_room_host(uuid, text, uuid, integer, uuid)
to authenticated;
grant execute on function public.remove_room_member(uuid, text, uuid, integer, uuid)
to authenticated;

create function public.upsert_room_prep(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_entry_id uuid,
  p_expected_revision integer,
  p_prompt_type text,
  p_visibility text,
  p_body text
)
returns table (
  entry_id uuid,
  revision integer,
  duplicate boolean,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  occurred_at timestamptz := timezone('utc', now());
  actor_profile_name text;
  current_entry public.prep_entries%rowtype;
  next_revision integer;
  previous_receipt private.prep_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );
  select receipt.* into previous_receipt
  from private.prep_command_receipts as receipt
  where receipt.actor_user_id = actor_id and receipt.command_id = p_command_id;
  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'UPSERT_PREP'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select previous_receipt.entry_id,
      previous_receipt.response_revision, true, occurred_at;
    return;
  end if;
  if p_prompt_type not in ('QUOTE_THOUGHT', 'IMPRESSIVE_PART', 'DISCUSSION_QUESTION')
    or p_visibility not in ('PUBLIC', 'AI_PRIVATE')
    or length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'invalid_prep_entry';
  end if;
  if not exists (
    select 1
    from public.rooms as room
    join public.session_runs as session on session.room_id = room.id
    join public.room_memberships as membership on membership.room_id = room.id
    where room.id = p_room_id
      and room.canceled_at is null
      and session.phase = 'SCHEDULED'
      and membership.user_id = actor_id
      and membership.status = 'REGISTERED'
  ) then
    raise exception using errcode = '42501', message = 'prep_write_not_allowed';
  end if;

  select entry.* into current_entry
  from public.prep_entries as entry
  where entry.id = p_entry_id
  for update;
  if current_entry.id is not null and current_entry.author_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'prep_author_required';
  end if;
  if current_entry.id is not null and current_entry.room_id <> p_room_id then
    raise exception using errcode = '40001', message = 'prep_room_mismatch';
  end if;
  if current_entry.id is null and p_expected_revision is not null then
    raise exception using errcode = '40001', message = 'prep_revision_conflict';
  end if;
  if current_entry.id is not null
    and (p_expected_revision is null or current_entry.revision <> p_expected_revision) then
    raise exception using errcode = '40001', message = 'prep_revision_conflict';
  end if;

  select profile.profile_name into actor_profile_name
  from public.profiles as profile where profile.user_id = actor_id;
  next_revision := coalesce(current_entry.revision + 1, 1);

  insert into public.prep_entries (
    id, room_id, author_user_id, author_profile_name_snapshot, prompt_type,
    visibility, public_body, revision, created_at, updated_at
  ) values (
    p_entry_id, p_room_id, actor_id, actor_profile_name, p_prompt_type,
    p_visibility, case when p_visibility = 'PUBLIC' then btrim(p_body) end,
    next_revision, occurred_at, occurred_at
  )
  on conflict (id) do update
  set prompt_type = excluded.prompt_type,
      visibility = excluded.visibility,
      public_body = excluded.public_body,
      revision = excluded.revision,
      updated_at = excluded.updated_at;

  if p_visibility = 'AI_PRIVATE' then
    insert into private.ai_private_prep_bodies (
      prep_entry_id, room_id, author_user_id, body, revision, created_at, updated_at
    ) values (
      p_entry_id, p_room_id, actor_id, btrim(p_body), next_revision, occurred_at, occurred_at
    )
    on conflict (prep_entry_id) do update
    set body = excluded.body,
        revision = excluded.revision,
        updated_at = excluded.updated_at;
  else
    delete from private.ai_private_prep_bodies as private_body
    where private_body.prep_entry_id = p_entry_id;
  end if;

  insert into private.prep_command_receipts (
    actor_user_id, command_id, command_type, room_id, entry_id,
    request_fingerprint, response_revision, created_at
  ) values (
    actor_id, p_command_id, 'UPSERT_PREP', p_room_id, p_entry_id,
    p_request_fingerprint, next_revision, occurred_at
  );
  return query select p_entry_id, next_revision, false, occurred_at;
end;
$$;

create function public.delete_room_prep(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_entry_id uuid,
  p_expected_revision integer
)
returns table (
  entry_id uuid,
  revision integer,
  duplicate boolean,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  occurred_at timestamptz := timezone('utc', now());
  current_entry public.prep_entries%rowtype;
  previous_receipt private.prep_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );
  select receipt.* into previous_receipt
  from private.prep_command_receipts as receipt
  where receipt.actor_user_id = actor_id and receipt.command_id = p_command_id;
  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'DELETE_PREP'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select previous_receipt.entry_id,
      previous_receipt.response_revision, true, occurred_at;
    return;
  end if;
  if not exists (
    select 1 from public.rooms as room
    join public.session_runs as session on session.room_id = room.id
    join public.room_memberships as membership on membership.room_id = room.id
    where room.id = p_room_id and room.canceled_at is null
      and session.phase = 'SCHEDULED'
      and membership.user_id = actor_id and membership.status = 'REGISTERED'
  ) then
    raise exception using errcode = '42501', message = 'prep_write_not_allowed';
  end if;
  select entry.* into current_entry
  from public.prep_entries as entry
  where entry.id = p_entry_id for update;
  if current_entry.id is null or current_entry.room_id <> p_room_id then
    raise exception using errcode = 'P0002', message = 'prep_entry_not_found';
  end if;
  if current_entry.author_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'prep_author_required';
  end if;
  if current_entry.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'prep_revision_conflict';
  end if;

  delete from public.prep_entries as entry where entry.id = p_entry_id;
  insert into private.prep_command_receipts (
    actor_user_id, command_id, command_type, room_id, entry_id,
    request_fingerprint, response_revision, created_at
  ) values (
    actor_id, p_command_id, 'DELETE_PREP', p_room_id, p_entry_id,
    p_request_fingerprint, p_expected_revision, occurred_at
  );
  return query select p_entry_id, p_expected_revision, false, occurred_at;
end;
$$;

create function public.list_room_prep(p_room_id uuid)
returns table (
  entry_id uuid,
  prompt_type text,
  visibility text,
  body text,
  author_user_id uuid,
  author_profile_name text,
  mine boolean,
  revision integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not exists (
    select 1 from public.rooms as room
    join public.session_runs as session on session.room_id = room.id
    join public.room_memberships as membership on membership.room_id = room.id
    where room.id = p_room_id and room.canceled_at is null
      and session.phase = 'SCHEDULED'
      and membership.user_id = actor_id and membership.status = 'REGISTERED'
  ) then
    raise exception using errcode = '42501', message = 'prep_read_not_allowed';
  end if;

  return query
  select
    entry.id,
    entry.prompt_type,
    entry.visibility,
    case
      when entry.visibility = 'PUBLIC' then entry.public_body
      when entry.author_user_id = actor_id then private_body.body
    end,
    entry.author_user_id,
    entry.author_profile_name_snapshot,
    entry.author_user_id = actor_id,
    entry.revision,
    entry.updated_at
  from public.prep_entries as entry
  join public.room_memberships as author_membership
    on author_membership.room_id = entry.room_id
   and author_membership.user_id = entry.author_user_id
   and author_membership.status = 'REGISTERED'
  left join private.ai_private_prep_bodies as private_body
    on private_body.prep_entry_id = entry.id
   and entry.author_user_id = actor_id
  where entry.room_id = p_room_id
    and (entry.visibility = 'PUBLIC' or entry.author_user_id = actor_id)
  order by entry.updated_at, entry.id;
end;
$$;

revoke all on function public.upsert_room_prep(
  uuid, text, uuid, uuid, integer, text, text, text
) from public, anon;
revoke all on function public.delete_room_prep(uuid, text, uuid, uuid, integer)
from public, anon;
revoke all on function public.list_room_prep(uuid) from public, anon;
grant execute on function public.upsert_room_prep(
  uuid, text, uuid, uuid, integer, text, text, text
) to authenticated;
grant execute on function public.delete_room_prep(uuid, text, uuid, uuid, integer)
to authenticated;
grant execute on function public.list_room_prep(uuid) to authenticated;

