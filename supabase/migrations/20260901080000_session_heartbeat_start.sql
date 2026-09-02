create table private.session_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  command_type text not null check (command_type = 'START_SESSION'),
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid not null references public.session_runs(id) on delete cascade,
  response_phase_version integer not null check (response_phase_version > 0),
  response_aggregate_version bigint not null check (response_aggregate_version > 0),
  response_event_seq bigint not null check (response_event_seq > 0),
  response_channel_epoch integer not null check (response_channel_epoch > 0),
  response_connected_participant_count integer not null
    check (response_connected_participant_count >= 2),
  response_min_participants integer not null
    check (response_min_participants >= 2),
  response_started_at timestamptz not null,
  response_discussion_ends_at timestamptz not null,
  response_extension_decision_deadline_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

revoke all on table private.session_command_receipts
from public, anon, authenticated;

create function public.heartbeat_session(
  p_room_id uuid,
  p_device_id uuid
)
returns table (
  room_id uuid,
  session_id uuid,
  device_id uuid,
  membership_status text,
  aggregate_version bigint,
  event_cursor bigint,
  channel_epoch integer,
  connected_participant_count bigint,
  heartbeat_interval_seconds integer,
  online_threshold_seconds integer,
  last_seen_at timestamptz,
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
  target_membership public.room_memberships%rowtype;
  next_membership_status text;
  next_aggregate_version bigint;
  next_event_seq bigint;
  active_participant_count bigint;
  connected_count bigint;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_device_id is null then
    raise exception using errcode = '22023', message = 'device_id_required';
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id
  for share;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if target_session.id is null then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_room.canceled_at is not null or target_session.phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if target_session.phase = 'ENDED' then
    raise exception using errcode = '55000', message = 'session_connection_closed';
  end if;

  select membership.* into target_membership
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = actor_id
  for update;
  if target_membership.user_id is null
    or target_membership.status not in ('REGISTERED', 'PARTICIPATED') then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;

  insert into public.session_connections as connection (
    session_id, user_id, device_id, last_seen_at, disconnected_at,
    created_at, updated_at
  ) values (
    target_session.id, actor_id, p_device_id, occurred_at, null,
    occurred_at, occurred_at
  )
  on conflict on constraint session_connections_device_unique do update
  set last_seen_at = excluded.last_seen_at,
      disconnected_at = null,
      updated_at = excluded.updated_at;

  if target_session.phase <> 'SCHEDULED'
    and target_membership.status = 'REGISTERED' then
    update public.room_memberships as membership
    set status = 'PARTICIPATED',
        participated_at = coalesce(membership.participated_at, occurred_at)
    where membership.room_id = p_room_id
      and membership.user_id = actor_id;
    next_membership_status := 'PARTICIPATED';

    select count(*) into active_participant_count
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

    update public.session_runs as session
    set aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        updated_at = occurred_at
    where session.id = target_session.id
    returning session.aggregate_version, session.last_event_seq
    into next_aggregate_version, next_event_seq;

    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload, actor_user_id, occurred_at
    ) values (
      target_session.id,
      next_event_seq,
      next_aggregate_version,
      target_session.channel_epoch,
      'SESSION_PARTICIPANT_CHANGED',
      pg_catalog.jsonb_build_object(
        'participantUserId', actor_id,
        'participant', pg_catalog.jsonb_build_object(
          'userId', actor_id,
          'profileName', target_membership.profile_name_snapshot,
          'role', case when target_room.host_user_id = actor_id
            then 'HOST' else 'PARTICIPANT' end,
          'membershipStatus', 'PARTICIPATED',
          'connectionStatus', 'ONLINE',
          'actualParticipation', true
        ),
        'participantCount', active_participant_count,
        'connectedParticipantCount', connected_count
      ),
      actor_id,
      occurred_at
    );
  else
    next_membership_status := target_membership.status;
    next_aggregate_version := target_session.aggregate_version;
    next_event_seq := target_session.last_event_seq;

    select count(distinct connection.user_id) into connected_count
    from public.session_connections as connection
    join public.room_memberships as membership
      on membership.room_id = p_room_id
     and membership.user_id = connection.user_id
     and membership.status in ('REGISTERED', 'PARTICIPATED')
    where connection.session_id = target_session.id
      and connection.disconnected_at is null
      and connection.last_seen_at >= occurred_at - interval '30 seconds';
  end if;

  return query select
    p_room_id,
    target_session.id,
    p_device_id,
    next_membership_status,
    next_aggregate_version,
    next_event_seq,
    target_session.channel_epoch,
    connected_count,
    15,
    30,
    occurred_at,
    occurred_at;
end;
$$;

revoke all on function public.heartbeat_session(uuid, uuid)
from public, anon;
grant execute on function public.heartbeat_session(uuid, uuid)
to authenticated;

create function public.start_session(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer
)
returns table (
  room_id uuid,
  session_id uuid,
  phase text,
  phase_version integer,
  aggregate_version bigint,
  channel_epoch integer,
  event_cursor bigint,
  connected_participant_count bigint,
  min_participants integer,
  started_at timestamptz,
  discussion_ends_at timestamptz,
  extension_decision_deadline_at timestamptz,
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
  previous_receipt private.session_command_receipts%rowtype;
  active_membership_count bigint;
  connected_count bigint;
  next_phase_version integer;
  next_aggregate_version bigint;
  next_event_seq bigint;
  next_started_at timestamptz;
  next_discussion_ends_at timestamptz;
  next_extension_decision_deadline_at timestamptz;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );

  select receipt.* into previous_receipt
  from private.session_command_receipts as receipt
  where receipt.actor_user_id = actor_id
    and receipt.command_id = p_command_id;
  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> 'START_SESSION'
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select
      previous_receipt.room_id,
      previous_receipt.session_id,
      'OPENING'::text,
      previous_receipt.response_phase_version,
      previous_receipt.response_aggregate_version,
      previous_receipt.response_channel_epoch,
      previous_receipt.response_event_seq,
      previous_receipt.response_connected_participant_count::bigint,
      previous_receipt.response_min_participants,
      previous_receipt.response_started_at,
      previous_receipt.response_discussion_ends_at,
      previous_receipt.response_extension_decision_deadline_at,
      true,
      occurred_at;
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
  if target_session.id is null then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_room.host_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'room_host_required';
  end if;
  if not exists (
    select 1
    from public.room_memberships as membership
    where membership.room_id = p_room_id
      and membership.user_id = actor_id
      and membership.status in ('REGISTERED', 'PARTICIPATED')
  ) then
    raise exception using errcode = '42501', message = 'active_membership_required';
  end if;
  if target_room.canceled_at is not null or target_session.phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if target_session.phase <> 'SCHEDULED' then
    raise exception using errcode = '55000', message = 'session_start_locked';
  end if;
  if target_session.phase_version <> p_expected_phase_version then
    raise exception using errcode = '40001', message = 'phase_version_conflict';
  end if;
  if target_room.scheduled_start_at > occurred_at then
    raise exception using errcode = '55000', message = 'session_start_too_early';
  end if;

  select count(*) into active_membership_count
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED');
  if active_membership_count > target_room.max_participants then
    raise exception using errcode = '23514', message = 'room_capacity_invariant_violated';
  end if;

  select count(distinct connection.user_id) into connected_count
  from public.session_connections as connection
  join public.room_memberships as membership
    on membership.room_id = p_room_id
   and membership.user_id = connection.user_id
   and membership.status in ('REGISTERED', 'PARTICIPATED')
  where connection.session_id = target_session.id
    and connection.disconnected_at is null
    and connection.last_seen_at >= occurred_at - interval '30 seconds';
  if connected_count < target_room.min_participants then
    raise exception using errcode = '55000',
      message = 'minimum_connected_participants_not_met';
  end if;

  next_started_at := occurred_at;
  next_discussion_ends_at := occurred_at + interval '30 minutes';
  next_extension_decision_deadline_at := occurred_at + interval '25 minutes';

  update public.session_runs as session
  set phase = 'OPENING',
      phase_version = session.phase_version + 1,
      aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      started_at = next_started_at,
      discussion_ends_at = next_discussion_ends_at,
      extension_prompted_at = null,
      extension_decision_deadline_at = next_extension_decision_deadline_at,
      closing_started_at = null,
      closing_ends_at = null,
      ended_at = null,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.phase_version, session.aggregate_version, session.last_event_seq
  into next_phase_version, next_aggregate_version, next_event_seq;

  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, command_id, occurred_at
  ) values (
    target_session.id,
    next_event_seq,
    next_aggregate_version,
    target_session.channel_epoch,
    'SESSION_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'state', pg_catalog.jsonb_build_object(
        'phase', 'OPENING',
        'phaseVersion', next_phase_version,
        'aggregateVersion', next_aggregate_version,
        'channelEpoch', target_session.channel_epoch,
        'startedAt', next_started_at,
        'endedAt', null,
        'extensionCount', target_session.extension_count,
        'deadlines', pg_catalog.jsonb_build_object(
          'discussionEndsAt', next_discussion_ends_at,
          'extensionPromptedAt', null,
          'extensionDecisionDeadlineAt', next_extension_decision_deadline_at,
          'closingStartedAt', null,
          'closingEndsAt', null
        )
      )
    ),
    actor_id,
    p_command_id,
    occurred_at
  );

  insert into private.session_command_receipts (
    actor_user_id, command_id, command_type, request_fingerprint,
    room_id, session_id, response_phase_version, response_aggregate_version,
    response_event_seq, response_channel_epoch,
    response_connected_participant_count, response_min_participants,
    response_started_at, response_discussion_ends_at,
    response_extension_decision_deadline_at, created_at
  ) values (
    actor_id, p_command_id, 'START_SESSION', p_request_fingerprint,
    p_room_id, target_session.id, next_phase_version, next_aggregate_version,
    next_event_seq, target_session.channel_epoch,
    connected_count, target_room.min_participants,
    next_started_at, next_discussion_ends_at,
    next_extension_decision_deadline_at, occurred_at
  );

  return query select
    p_room_id,
    target_session.id,
    'OPENING'::text,
    next_phase_version,
    next_aggregate_version,
    target_session.channel_epoch,
    next_event_seq,
    connected_count,
    target_room.min_participants,
    next_started_at,
    next_discussion_ends_at,
    next_extension_decision_deadline_at,
    false,
    occurred_at;
end;
$$;

revoke all on function public.start_session(uuid, text, uuid, integer)
from public, anon;
grant execute on function public.start_session(uuid, text, uuid, integer)
to authenticated;

comment on function public.heartbeat_session(uuid, uuid) is
  'Refreshes one registered user/device connection and promotes actual participation after start.';
comment on function public.start_session(uuid, text, uuid, integer) is
  'Atomically validates host/time/heartbeat minimum, starts the session, and appends its public state event.';
