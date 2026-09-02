create function private.append_session_participant_change(
  p_room_id uuid,
  p_user_id uuid,
  p_actor_user_id uuid,
  p_removed boolean,
  p_rotate_channel boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  target_membership public.room_memberships%rowtype;
  participant_payload jsonb;
  participant_count bigint;
  connected_count bigint;
begin
  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;

  if target_session.phase = 'SCHEDULED' then
    return;
  end if;
  if target_session.phase in ('ENDED', 'CANCELED') then
    raise exception using errcode = '55000', message = 'room_command_locked';
  end if;

  select membership.* into target_membership
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = p_user_id;

  select count(*) into participant_count
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED');

  select count(distinct connection.user_id) into connected_count
  from public.session_connections as connection
  join public.room_memberships as membership
    on membership.room_id = p_room_id
   and membership.user_id = connection.user_id
   and membership.status in ('REGISTERED', 'PARTICIPATED')
  where connection.session_id = target_session.id
    and connection.disconnected_at is null
    and connection.last_seen_at >= occurred_at - interval '30 seconds';

  participant_payload := case
    when p_removed then 'null'::jsonb
    else pg_catalog.jsonb_build_object(
      'userId', p_user_id,
      'profileName', target_membership.profile_name_snapshot,
      'role', case when target_room.host_user_id = p_user_id
        then 'HOST' else 'PARTICIPANT' end,
      'membershipStatus', target_membership.status,
      'connectionStatus', case when exists (
        select 1
        from public.session_connections as connection
        where connection.session_id = target_session.id
          and connection.user_id = p_user_id
          and connection.disconnected_at is null
          and connection.last_seen_at >= occurred_at - interval '30 seconds'
      ) then 'ONLINE' else 'OFFLINE' end,
      'actualParticipation', target_membership.status = 'PARTICIPATED'
    )
  end;

  update public.session_runs as session
  set aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      channel_epoch = session.channel_epoch + case when p_rotate_channel then 1 else 0 end,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.* into target_session;

  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, occurred_at
  ) values (
    target_session.id,
    target_session.last_event_seq,
    target_session.aggregate_version,
    target_session.channel_epoch,
    'SESSION_PARTICIPANT_CHANGED',
    pg_catalog.jsonb_build_object(
      'participantUserId', p_user_id,
      'participant', participant_payload,
      'participantCount', participant_count,
      'connectedParticipantCount', connected_count
    ),
    p_actor_user_id,
    occurred_at
  );
end;
$$;

revoke all on function private.append_session_participant_change(
  uuid, uuid, uuid, boolean, boolean
) from public, anon, authenticated;

create function private.on_active_session_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'PARTICIPATED'
    and exists (
      select 1
      from private.room_join_authorizations as join_auth
      where join_auth.room_id = new.room_id
        and join_auth.actor_user_id = new.user_id
        and join_auth.expires_at > timezone('utc', now())
    ) then
    perform private.append_session_participant_change(
      new.room_id, new.user_id, new.user_id, false, false
    );
  elsif tg_op = 'UPDATE'
    and new.status = 'REMOVED'
    and old.status in ('REGISTERED', 'PARTICIPATED') then
    update public.session_connections as connection
    set disconnected_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    from public.session_runs as session
    where session.room_id = new.room_id
      and connection.session_id = session.id
      and connection.user_id = new.user_id
      and connection.disconnected_at is null;

    perform private.append_session_participant_change(
      new.room_id, new.user_id, auth.uid(), true, true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.on_active_session_membership_change()
from public, anon, authenticated;

create trigger active_session_membership_change
after insert or update of status on public.room_memberships
for each row execute function private.on_active_session_membership_change();

create function private.on_active_session_host_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.host_user_id is distinct from new.host_user_id then
    perform private.append_session_participant_change(
      new.id, old.host_user_id, auth.uid(), false, false
    );
    perform private.append_session_participant_change(
      new.id, new.host_user_id, auth.uid(), false, false
    );
  end if;
  return new;
end;
$$;

revoke all on function private.on_active_session_host_change()
from public, anon, authenticated;

create trigger active_session_host_change
after update of host_user_id on public.rooms
for each row execute function private.on_active_session_host_change();

create or replace function private.complete_room_command(
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
  target_session public.session_runs%rowtype;
  target_membership_status text;
  required_target_status text;
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
  where receipt.actor_user_id = actor_id
    and receipt.command_id = p_command_id;
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
  from public.rooms as room
  where room.id = p_room_id
  for update;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if target_room.aggregate_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'aggregate_version_conflict';
  end if;
  if target_room.canceled_at is not null
    or target_session.phase in ('ENDED', 'CANCELED') then
    raise exception using errcode = '55000', message = 'room_command_locked';
  end if;
  if p_command_type in ('CANCEL_MEMBERSHIP', 'CANCEL_ROOM')
    and target_session.phase <> 'SCHEDULED' then
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
    where membership.room_id = p_room_id
      and membership.user_id = p_target_user_id;
    required_target_status := case when target_session.phase = 'SCHEDULED'
      then 'REGISTERED' else 'PARTICIPATED' end;
    if target_membership_status <> required_target_status then
      raise exception using errcode = '22023',
        message = 'host_transfer_target_not_registered';
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
    required_target_status := case when target_session.phase = 'SCHEDULED'
      then 'REGISTERED' else 'PARTICIPATED' end;
    update public.room_memberships as membership
    set status = 'REMOVED', removed_at = occurred_at
    where membership.room_id = p_room_id
      and membership.user_id = p_target_user_id
      and membership.status = required_target_status;
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

create or replace function public.update_room(
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
  target_session public.session_runs%rowtype;
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
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if target_room.host_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'room_host_required';
  end if;
  if target_room.canceled_at is not null
    or target_session.phase in ('ENDED', 'CANCELED') then
    raise exception using errcode = '55000', message = 'room_settings_locked';
  end if;
  if target_room.aggregate_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'aggregate_version_conflict';
  end if;
  if target_session.phase <> 'SCHEDULED' and (
    p_title is not null
    or p_pack_version_id is not null
    or p_scheduled_start_at is not null
    or p_min_participants is not null
    or (p_max_participants is not null
      and p_max_participants < target_room.max_participants)
  ) then
    raise exception using errcode = '55000', message = 'room_settings_locked';
  end if;
  if p_title is not null and btrim(p_title) = '' then
    raise exception using errcode = '22023', message = 'room_title_required';
  end if;
  if p_password_hash is not null and p_password_hash not like '$argon2id$%' then
    raise exception using errcode = '22023', message = 'invalid_password_hash';
  end if;
  if p_pack_version_id is not null and not exists (
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

comment on function private.append_session_participant_change(
  uuid, uuid, uuid, boolean, boolean
) is 'Commits active join, removal, and host-role projections into the session event stream.';
