create extension if not exists pgcrypto with schema extensions;

alter table public.room_memberships
  drop constraint room_memberships_status_check;
alter table public.room_memberships
  add constraint room_memberships_status_check check (
    status in (
      'REGISTERED',
      'PARTICIPATED',
      'CANCELED',
      'CANCELED_BY_ROOM',
      'REMOVED',
      'NO_SHOW'
    )
  );

alter table public.session_runs
  drop constraint session_runs_phase_check;
alter table public.session_runs
  add constraint session_runs_phase_check check (
    phase in (
      'SCHEDULED',
      'OPENING',
      'CORE',
      'EXTENDED',
      'SYNTHESIS',
      'CLOSING',
      'ENDED',
      'CANCELED'
    )
  );

alter table private.room_command_receipts
  drop constraint room_command_receipts_command_type_check;
alter table private.room_command_receipts
  add column request_fingerprint text not null default 'legacy',
  add column response_aggregate_version integer not null default 1,
  add column response_payload jsonb not null default '{}'::jsonb;
alter table private.room_command_receipts
  alter column request_fingerprint drop default,
  alter column response_aggregate_version drop default,
  alter column response_payload drop default;
alter table private.room_command_receipts
  add constraint room_command_receipts_command_type_check check (
    command_type in (
      'CREATE_ROOM',
      'JOIN_ROOM',
      'UPDATE_ROOM',
      'CANCEL_MEMBERSHIP',
      'CANCEL_ROOM',
      'TRANSFER_HOST',
      'REMOVE_MEMBER'
    )
  ),
  add constraint room_command_receipts_fingerprint_nonempty check (
    length(btrim(request_fingerprint)) > 0
  );

create table private.room_password_failures (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default timezone('utc', now())
);

create table private.room_password_rate_limit_config (
  singleton boolean primary key default true check (singleton),
  attempts_per_minute integer not null check (attempts_per_minute > 0),
  attempts_per_hour integer not null check (attempts_per_hour >= attempts_per_minute),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into private.room_password_rate_limit_config (
  singleton, attempts_per_minute, attempts_per_hour
) values (true, 5, 20);

create index room_password_failures_lookup_idx
on private.room_password_failures (room_id, actor_user_id, attempted_at desc);

create table private.room_join_authorizations (
  token_hash text primary key check (length(token_hash) = 64),
  room_id uuid not null references public.rooms(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  password_version integer not null check (password_version > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index room_join_authorizations_actor_idx
on private.room_join_authorizations (actor_user_id, room_id, expires_at);

revoke all on table private.room_password_failures from public, anon, authenticated;
revoke all on table private.room_password_rate_limit_config from public, anon, authenticated;
revoke all on table private.room_join_authorizations from public, anon, authenticated;

drop function public.create_room(
  uuid,
  text,
  uuid,
  timestamptz,
  text,
  integer,
  integer
);

create function public.create_room(
  p_command_id uuid,
  p_request_fingerprint text,
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
  previous_receipt private.room_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if length(btrim(coalesce(p_request_fingerprint, ''))) = 0 then
    raise exception using errcode = '22023', message = 'request_fingerprint_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );

  select receipt.*
  into previous_receipt
  from private.room_command_receipts as receipt
  where receipt.actor_user_id = actor_id
    and receipt.command_id = p_command_id;

  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'CREATE_ROOM'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query
    select
      previous_receipt.room_id,
      previous_receipt.response_aggregate_version,
      true,
      occurred_at;
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
    actor_user_id,
    command_id,
    command_type,
    room_id,
    request_fingerprint,
    response_aggregate_version,
    response_payload,
    created_at
  ) values (
    actor_id,
    p_command_id,
    'CREATE_ROOM',
    created_room_id,
    p_request_fingerprint,
    1,
    '{}'::jsonb,
    occurred_at
  );

  return query select created_room_id, 1, false, occurred_at;
end;
$$;

revoke all on function public.create_room(
  uuid, text, text, uuid, timestamptz, text, integer, integer
) from public, anon;
grant execute on function public.create_room(
  uuid, text, text, uuid, timestamptz, text, integer, integer
) to authenticated;

create function public.get_room_join_challenge(
  p_actor_user_id uuid,
  p_room_id uuid
)
returns table (
  room_id uuid,
  challenge_state text,
  password_hash text,
  password_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
  target_phase text;
  membership_status text;
  failures_minute bigint;
  failures_hour bigint;
  limit_minute integer;
  limit_hour integer;
begin
  select room.*
  into target_room
  from public.rooms as room
  where room.id = p_room_id;

  select session.phase
  into target_phase
  from public.session_runs as session
  where session.room_id = p_room_id;

  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.canceled_at is not null or target_phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if target_phase = 'ENDED' then
    raise exception using errcode = '55000', message = 'room_ended';
  end if;

  select membership.status
  into membership_status
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = p_actor_user_id;

  if membership_status = 'REMOVED' then
    raise exception using errcode = '42501', message = 'room_member_removed';
  end if;
  if p_actor_user_id = target_room.host_user_id
    or membership_status in ('REGISTERED', 'PARTICIPATED') then
    return query
    select target_room.id, 'ALREADY_MEMBER'::text, null::text, target_room.password_version;
    return;
  end if;

  select
    count(*) filter (
      where failure.attempted_at > timezone('utc', now()) - interval '1 minute'
    ),
    count(*) filter (
      where failure.attempted_at > timezone('utc', now()) - interval '1 hour'
    )
  into failures_minute, failures_hour
  from private.room_password_failures as failure
  where failure.room_id = p_room_id
    and failure.actor_user_id = p_actor_user_id
    and failure.attempted_at > timezone('utc', now()) - interval '1 hour';

  select config.attempts_per_minute, config.attempts_per_hour
  into limit_minute, limit_hour
  from private.room_password_rate_limit_config as config
  where config.singleton;

  if failures_minute >= limit_minute or failures_hour >= limit_hour then
    raise exception using errcode = 'P0001', message = 'room_password_rate_limited';
  end if;

  return query
  select
    target_room.id,
    'PASSWORD_REQUIRED'::text,
    target_room.password_hash,
    target_room.password_version;
end;
$$;

revoke all on function public.get_room_join_challenge(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.get_room_join_challenge(uuid, uuid)
to service_role;

create function public.record_room_password_failure(
  p_actor_user_id uuid,
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users where id = p_actor_user_id)
    or not exists (select 1 from public.rooms where id = p_room_id) then
    return;
  end if;

  insert into private.room_password_failures (room_id, actor_user_id)
  values (p_room_id, p_actor_user_id);
end;
$$;

revoke all on function public.record_room_password_failure(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.record_room_password_failure(uuid, uuid)
to service_role;

create function public.authorize_room_join(
  p_actor_user_id uuid,
  p_room_id uuid,
  p_password_version integer,
  p_token_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_password_version integer;
begin
  if length(p_token_hash) <> 64 then
    raise exception using errcode = '22023', message = 'invalid_join_authorization';
  end if;

  select room.password_version
  into current_password_version
  from public.rooms as room
  join public.session_runs as session on session.room_id = room.id
  where room.id = p_room_id
    and room.canceled_at is null
    and session.phase <> 'ENDED'
    and session.phase <> 'CANCELED';

  if current_password_version is null
    or current_password_version <> p_password_version then
    raise exception using errcode = '40001', message = 'room_password_changed';
  end if;

  delete from private.room_join_authorizations
  where actor_user_id = p_actor_user_id
    and room_id = p_room_id;

  insert into private.room_join_authorizations (
    token_hash,
    room_id,
    actor_user_id,
    password_version,
    expires_at
  ) values (
    p_token_hash,
    p_room_id,
    p_actor_user_id,
    p_password_version,
    timezone('utc', now()) + interval '30 seconds'
  );
end;
$$;

revoke all on function public.authorize_room_join(uuid, uuid, integer, text)
from public, anon, authenticated;
grant execute on function public.authorize_room_join(uuid, uuid, integer, text)
to service_role;

create function public.join_room(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_authorization_token text default null
)
returns table (
  room_id uuid,
  aggregate_version integer,
  duplicate boolean,
  server_time timestamptz,
  membership_status text,
  participant_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_profile_name text;
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_phase text;
  current_membership_status text;
  authorization_record private.room_join_authorizations%rowtype;
  active_participant_count bigint;
  next_membership_status text;
  next_version integer;
  previous_receipt private.room_command_receipts%rowtype;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );

  select receipt.*
  into previous_receipt
  from private.room_command_receipts as receipt
  where receipt.actor_user_id = actor_id
    and receipt.command_id = p_command_id;

  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'JOIN_ROOM'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query
    select
      previous_receipt.room_id,
      previous_receipt.response_aggregate_version,
      true,
      occurred_at,
      previous_receipt.response_payload->>'membershipStatus',
      (previous_receipt.response_payload->>'participantCount')::bigint;
    return;
  end if;

  select room.*
  into target_room
  from public.rooms as room
  where room.id = p_room_id
  for update;

  select session.phase
  into target_phase
  from public.session_runs as session
  where session.room_id = p_room_id;

  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.canceled_at is not null or target_phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if target_phase = 'ENDED' then
    raise exception using errcode = '55000', message = 'room_ended';
  end if;

  select membership.status
  into current_membership_status
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = actor_id;

  if current_membership_status = 'REMOVED' then
    raise exception using errcode = '42501', message = 'room_member_removed';
  end if;

  if actor_id = target_room.host_user_id
    or current_membership_status in ('REGISTERED', 'PARTICIPATED') then
    next_membership_status := case
      when current_membership_status = 'PARTICIPATED' then 'PARTICIPATED'
      else 'REGISTERED'
    end;
    next_version := target_room.aggregate_version;
  else
    if p_authorization_token is null then
      raise exception using errcode = '42501', message = 'room_password_required';
    end if;

    select join_auth.*
    into authorization_record
    from private.room_join_authorizations as join_auth
    where join_auth.token_hash = encode(
        extensions.digest(p_authorization_token, 'sha256'),
        'hex'
      )
      and join_auth.actor_user_id = actor_id
      and join_auth.room_id = p_room_id
    for update;

    if authorization_record.token_hash is null
      or authorization_record.expires_at <= occurred_at then
      raise exception using errcode = '42501', message = 'invalid_join_authorization';
    end if;
    if authorization_record.password_version <> target_room.password_version then
      raise exception using errcode = '40001', message = 'room_password_changed';
    end if;

    select count(*)
    into active_participant_count
    from public.room_memberships as membership
    where membership.room_id = p_room_id
      and membership.status in ('REGISTERED', 'PARTICIPATED');

    if active_participant_count >= target_room.max_participants then
      raise exception using errcode = '40001', message = 'room_capacity_reached';
    end if;

    select profile.profile_name
    into actor_profile_name
    from public.profiles as profile
    where profile.user_id = actor_id;

    if actor_profile_name is null then
      raise exception using errcode = 'P0002', message = 'profile_not_found';
    end if;

    next_membership_status := case
      when target_phase = 'SCHEDULED' then 'REGISTERED'
      else 'PARTICIPATED'
    end;

    insert into public.room_memberships (
      room_id,
      user_id,
      status,
      profile_name_snapshot,
      joined_at,
      participated_at,
      canceled_at,
      removed_at
    ) values (
      p_room_id,
      actor_id,
      next_membership_status,
      actor_profile_name,
      occurred_at,
      case when next_membership_status = 'PARTICIPATED' then occurred_at end,
      null,
      null
    )
    on conflict on constraint room_memberships_pkey do update
    set status = excluded.status,
        profile_name_snapshot = excluded.profile_name_snapshot,
        joined_at = excluded.joined_at,
        participated_at = excluded.participated_at,
        canceled_at = null,
        removed_at = null;

    update public.rooms as updating_room
    set aggregate_version = updating_room.aggregate_version + 1,
        updated_at = occurred_at
    where updating_room.id = p_room_id
    returning updating_room.aggregate_version into next_version;

    delete from private.room_join_authorizations
    where token_hash = authorization_record.token_hash;
    delete from private.room_password_failures as failure
    where failure.room_id = p_room_id
      and failure.actor_user_id = actor_id;
  end if;

  select count(*)
  into active_participant_count
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED');

  insert into private.room_command_receipts (
    actor_user_id,
    command_id,
    command_type,
    room_id,
    request_fingerprint,
    response_aggregate_version,
    response_payload,
    created_at
  ) values (
    actor_id,
    p_command_id,
    'JOIN_ROOM',
    p_room_id,
    p_request_fingerprint,
    next_version,
    jsonb_build_object(
      'membershipStatus', next_membership_status,
      'participantCount', active_participant_count
    ),
    occurred_at
  );

  return query
  select
    p_room_id,
    next_version,
    false,
    occurred_at,
    next_membership_status,
    active_participant_count;
end;
$$;

revoke all on function public.join_room(uuid, text, uuid, text)
from public, anon;
grant execute on function public.join_room(uuid, text, uuid, text)
to authenticated;
