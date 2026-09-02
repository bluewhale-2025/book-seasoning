create function private.session_state_public_json(
  p_session public.session_runs
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'phase', p_session.phase,
    'phaseVersion', p_session.phase_version,
    'aggregateVersion', p_session.aggregate_version,
    'channelEpoch', p_session.channel_epoch,
    'startedAt', p_session.started_at,
    'endedAt', p_session.ended_at,
    'extensionCount', p_session.extension_count,
    'deadlines', pg_catalog.jsonb_build_object(
      'discussionEndsAt', p_session.discussion_ends_at,
      'extensionPromptedAt', p_session.extension_prompted_at,
      'extensionDecisionDeadlineAt', p_session.extension_decision_deadline_at,
      'closingStartedAt', p_session.closing_started_at,
      'closingEndsAt', p_session.closing_ends_at
    )
  );
$$;

revoke all on function private.session_state_public_json(public.session_runs)
from public, anon, authenticated;

create table private.session_control_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  command_type text not null check (
    command_type in ('EXTEND_SESSION', 'START_SYNTHESIS', 'END_SESSION')
  ),
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid not null references public.session_runs(id) on delete cascade,
  response_event_seq bigint not null check (response_event_seq > 0),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id),
  foreign key (session_id, response_event_seq)
    references public.session_events(session_id, event_seq) on delete restrict
);

revoke all on table private.session_control_command_receipts
from public, anon, authenticated;

create function private.apply_session_control(
  p_actor_user_id uuid,
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer,
  p_command_type text
)
returns table (
  room_id uuid,
  session_id uuid,
  state jsonb,
  event_cursor bigint,
  duplicate boolean,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  previous_receipt private.session_control_command_receipts%rowtype;
  previous_event public.session_events%rowtype;
  transition_reason text;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_command_type not in ('EXTEND_SESSION', 'START_SYNTHESIS', 'END_SESSION') then
    raise exception using errcode = '22023', message = 'session_command_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_user_id::text || p_command_id::text, 0)
  );

  select receipt.* into previous_receipt
  from private.session_control_command_receipts as receipt
  where receipt.actor_user_id = p_actor_user_id
    and receipt.command_id = p_command_id;

  if previous_receipt.command_id is not null then
    if previous_receipt.command_type <> p_command_type
      or previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;

    select event.* into previous_event
    from public.session_events as event
    where event.session_id = previous_receipt.session_id
      and event.event_seq = previous_receipt.response_event_seq;

    return query select
      previous_receipt.room_id,
      previous_receipt.session_id,
      previous_event.public_payload -> 'state',
      previous_event.event_seq,
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
  if target_room.host_user_id <> p_actor_user_id then
    raise exception using errcode = '42501', message = 'room_host_required';
  end if;
  if target_session.phase_version <> p_expected_phase_version then
    raise exception using errcode = '40001', message = 'phase_version_conflict';
  end if;

  if p_command_type = 'EXTEND_SESSION' then
    if target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
      or target_session.extension_prompted_at is null
      or target_session.extension_decision_deadline_at is null
      or occurred_at >= target_session.extension_decision_deadline_at then
      raise exception using errcode = '55000', message = 'session_extension_locked';
    end if;

    update public.session_runs as session
    set phase = 'EXTENDED',
        phase_version = session.phase_version + 1,
        aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        discussion_ends_at = session.discussion_ends_at + interval '15 minutes',
        extension_count = session.extension_count + 1,
        extension_prompted_at = null,
        extension_decision_deadline_at =
          session.discussion_ends_at + interval '10 minutes',
        updated_at = occurred_at
    where session.id = target_session.id
    returning session.* into target_session;
    transition_reason := 'EXTENDED_BY_HOST';
  elsif p_command_type = 'START_SYNTHESIS' then
    if target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
      or target_session.extension_prompted_at is null
      or target_session.extension_decision_deadline_at is null
      or occurred_at >= target_session.extension_decision_deadline_at then
      raise exception using errcode = '55000', message = 'session_synthesis_locked';
    end if;

    update public.session_runs as session
    set phase = 'SYNTHESIS',
        phase_version = session.phase_version + 1,
        aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        extension_prompted_at = null,
        extension_decision_deadline_at = null,
        updated_at = occurred_at
    where session.id = target_session.id
    returning session.* into target_session;
    transition_reason := 'SYNTHESIS_REQUESTED_BY_HOST';
  else
    if target_session.phase not in ('OPENING', 'CORE', 'EXTENDED', 'SYNTHESIS', 'CLOSING') then
      raise exception using errcode = '55000', message = 'session_end_locked';
    end if;

    update public.session_runs as session
    set phase = 'ENDED',
        phase_version = session.phase_version + 1,
        aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        ended_at = occurred_at,
        extension_prompted_at = null,
        extension_decision_deadline_at = null,
        updated_at = occurred_at
    where session.id = target_session.id
    returning session.* into target_session;

    update public.session_connections as connection
    set disconnected_at = occurred_at,
        updated_at = occurred_at
    where connection.session_id = target_session.id
      and connection.disconnected_at is null;
    transition_reason := 'ENDED_BY_HOST';
  end if;

  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, command_id, occurred_at
  ) values (
    target_session.id,
    target_session.last_event_seq,
    target_session.aggregate_version,
    target_session.channel_epoch,
    'SESSION_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'state', private.session_state_public_json(target_session),
      'reason', transition_reason
    ),
    p_actor_user_id,
    p_command_id,
    occurred_at
  );

  insert into private.session_control_command_receipts (
    actor_user_id, command_id, command_type, request_fingerprint,
    room_id, session_id, response_event_seq, created_at
  ) values (
    p_actor_user_id, p_command_id, p_command_type, p_request_fingerprint,
    p_room_id, target_session.id, target_session.last_event_seq, occurred_at
  );

  return query select
    p_room_id,
    target_session.id,
    private.session_state_public_json(target_session),
    target_session.last_event_seq,
    false,
    occurred_at;
end;
$$;

revoke all on function private.apply_session_control(
  uuid, uuid, text, uuid, integer, text
) from public, anon, authenticated;

create function public.extend_session(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer
)
returns table (
  room_id uuid,
  session_id uuid,
  state jsonb,
  event_cursor bigint,
  duplicate boolean,
  server_time timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_session_control(
    auth.uid(), p_command_id, p_request_fingerprint,
    p_room_id, p_expected_phase_version, 'EXTEND_SESSION'
  );
$$;

create function public.start_session_synthesis(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer
)
returns table (
  room_id uuid,
  session_id uuid,
  state jsonb,
  event_cursor bigint,
  duplicate boolean,
  server_time timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_session_control(
    auth.uid(), p_command_id, p_request_fingerprint,
    p_room_id, p_expected_phase_version, 'START_SYNTHESIS'
  );
$$;

create function public.end_session(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer
)
returns table (
  room_id uuid,
  session_id uuid,
  state jsonb,
  event_cursor bigint,
  duplicate boolean,
  server_time timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_session_control(
    auth.uid(), p_command_id, p_request_fingerprint,
    p_room_id, p_expected_phase_version, 'END_SESSION'
  );
$$;

revoke all on function public.extend_session(uuid, text, uuid, integer)
from public, anon;
revoke all on function public.start_session_synthesis(uuid, text, uuid, integer)
from public, anon;
revoke all on function public.end_session(uuid, text, uuid, integer)
from public, anon;
grant execute on function public.extend_session(uuid, text, uuid, integer)
to authenticated;
grant execute on function public.start_session_synthesis(uuid, text, uuid, integer)
to authenticated;
grant execute on function public.end_session(uuid, text, uuid, integer)
to authenticated;

create function public.advance_due_sessions(
  p_now timestamptz default timezone('utc', now()),
  p_limit integer default 100
)
returns table (
  processed_sessions integer,
  committed_transitions integer,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  target_session public.session_runs%rowtype;
  processed_count integer := 0;
  transition_count integer := 0;
  per_session_count integer;
  transition_reason text;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'session_reconcile_time_required';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception using errcode = '22023', message = 'session_reconcile_limit_invalid';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('bookseasoning:advance_due_sessions', 0)
  ) then
    return query select 0, 0, p_now;
    return;
  end if;

  for candidate in
    select session.id
    from public.session_runs as session
    where (
      session.phase in ('OPENING', 'CORE', 'EXTENDED')
      and session.discussion_ends_at is not null
      and (
        (session.extension_decision_deadline_at is not null
          and session.extension_decision_deadline_at <= p_now)
        or (session.extension_prompted_at is null
          and session.discussion_ends_at - interval '7 minutes' <= p_now)
      )
    ) or (
      session.phase = 'SYNTHESIS'
      and session.discussion_ends_at <= p_now
    ) or (
      session.phase = 'CLOSING'
      and session.closing_ends_at <= p_now
    )
    order by case
      when session.phase in ('OPENING', 'CORE', 'EXTENDED') then coalesce(
        session.extension_decision_deadline_at,
        session.discussion_ends_at - interval '7 minutes'
      )
      when session.phase = 'SYNTHESIS' then session.discussion_ends_at
      when session.phase = 'CLOSING' then session.closing_ends_at
    end asc
    for update skip locked
    limit p_limit
  loop
    processed_count := processed_count + 1;
    per_session_count := 0;

    loop
      select session.* into target_session
      from public.session_runs as session
      where session.id = candidate.id
      for update;

      transition_reason := null;
      if target_session.phase in ('OPENING', 'CORE', 'EXTENDED') then
        if target_session.extension_decision_deadline_at is not null
          and target_session.extension_decision_deadline_at <= p_now then
          update public.session_runs as session
          set phase = 'SYNTHESIS',
              phase_version = session.phase_version + 1,
              aggregate_version = session.aggregate_version + 1,
              last_event_seq = session.last_event_seq + 1,
              extension_prompted_at = null,
              extension_decision_deadline_at = null,
              updated_at = p_now
          where session.id = target_session.id
          returning session.* into target_session;
          transition_reason := 'SYNTHESIS_STARTED_BY_TIMEOUT';
        elsif target_session.extension_prompted_at is null
          and target_session.discussion_ends_at - interval '7 minutes' <= p_now then
          update public.session_runs as session
          set phase_version = session.phase_version + 1,
              aggregate_version = session.aggregate_version + 1,
              last_event_seq = session.last_event_seq + 1,
              extension_prompted_at = p_now,
              updated_at = p_now
          where session.id = target_session.id
          returning session.* into target_session;
          transition_reason := 'EXTENSION_WINDOW_OPENED';
        end if;
      elsif target_session.phase = 'SYNTHESIS'
        and target_session.discussion_ends_at <= p_now then
        update public.session_runs as session
        set phase = 'CLOSING',
            phase_version = session.phase_version + 1,
            aggregate_version = session.aggregate_version + 1,
            last_event_seq = session.last_event_seq + 1,
            closing_started_at = p_now,
            closing_ends_at = p_now + interval '5 minutes',
            extension_prompted_at = null,
            extension_decision_deadline_at = null,
            updated_at = p_now
        where session.id = target_session.id
        returning session.* into target_session;
        transition_reason := 'CLOSING_STARTED';
      elsif target_session.phase = 'CLOSING'
        and target_session.closing_ends_at <= p_now then
        update public.session_runs as session
        set phase = 'ENDED',
            phase_version = session.phase_version + 1,
            aggregate_version = session.aggregate_version + 1,
            last_event_seq = session.last_event_seq + 1,
            ended_at = p_now,
            updated_at = p_now
        where session.id = target_session.id
        returning session.* into target_session;

        update public.session_connections as connection
        set disconnected_at = p_now,
            updated_at = p_now
        where connection.session_id = target_session.id
          and connection.disconnected_at is null;
        transition_reason := 'CLOSING_EXPIRED';
      end if;

      exit when transition_reason is null;

      insert into public.session_events (
        session_id, event_seq, aggregate_version, channel_epoch,
        event_type, public_payload, occurred_at
      ) values (
        target_session.id,
        target_session.last_event_seq,
        target_session.aggregate_version,
        target_session.channel_epoch,
        'SESSION_STATE_CHANGED',
        pg_catalog.jsonb_build_object(
          'state', private.session_state_public_json(target_session),
          'reason', transition_reason
        ),
        p_now
      );

      transition_count := transition_count + 1;
      per_session_count := per_session_count + 1;
      exit when transition_reason = 'EXTENSION_WINDOW_OPENED'
        or per_session_count >= 3;
    end loop;
  end loop;

  return query select processed_count, transition_count, p_now;
end;
$$;

revoke all on function public.advance_due_sessions(timestamptz, integer)
from public, anon, authenticated;
grant execute on function public.advance_due_sessions(timestamptz, integer)
to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'bookseasoning-advance-due-sessions'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'bookseasoning-advance-due-sessions',
    '10 seconds',
    'select public.advance_due_sessions();'
  );
end;
$$;

comment on function public.extend_session(uuid, text, uuid, integer) is
  'Extends the current prompted discussion segment by exactly 15 minutes for the host.';
comment on function public.start_session_synthesis(uuid, text, uuid, integer) is
  'Moves a prompted active discussion into Synthesis when the host chooses to wrap.';
comment on function public.end_session(uuid, text, uuid, integer) is
  'Irreversibly ends an active session at the host request.';
comment on function public.advance_due_sessions(timestamptz, integer) is
  'Idempotently commits 7/5/0-minute and Closing-expiry transitions without a client.';
