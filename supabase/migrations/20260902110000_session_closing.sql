alter table public.room_memberships
add column participant_identity_id uuid not null default extensions.gen_random_uuid();

create unique index room_memberships_participant_identity_idx
on public.room_memberships (participant_identity_id);

create table public.session_closing_responses (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  participant_identity_id uuid not null,
  author_user_id uuid references auth.users(id) on delete set null,
  profile_name_snapshot text not null check (length(btrim(profile_name_snapshot)) > 0),
  status text not null check (status in ('PENDING', 'SUBMITTED', 'SKIPPED')),
  body text check (
    (status = 'SUBMITTED' and length(btrim(body)) between 1 and 300)
    or (status in ('PENDING', 'SKIPPED') and body is null)
  ),
  revision integer not null check (revision > 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint session_closing_responses_identity_unique
    unique (session_id, participant_identity_id),
  constraint session_closing_responses_actor_unique
    unique (session_id, author_user_id),
  constraint session_closing_responses_time_order_check
    check (updated_at >= created_at)
);

create index session_closing_responses_session_status_idx
on public.session_closing_responses (session_id, status, updated_at);

alter table public.session_closing_responses enable row level security;
revoke all on table public.session_closing_responses
from public, anon, authenticated, bookseasoning_ai_worker;

create table private.session_closing_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  response_payload jsonb not null check (
    jsonb_typeof(response_payload) = 'object'
    and private.public_jsonb_keys_allowed(response_payload)
  ),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

revoke all on table private.session_closing_command_receipts
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.session_closing_state_json(
  p_session_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select session.room_id
    from public.session_runs as session
    where session.id = p_session_id
  ), actor_membership as (
    select membership.participant_identity_id
    from target
    join public.room_memberships as membership
      on membership.room_id = target.room_id
     and membership.user_id = p_actor_user_id
     and membership.status = 'PARTICIPATED'
  ), actor_response as (
    select response.*
    from actor_membership
    left join public.session_closing_responses as response
      on response.session_id = p_session_id
     and response.participant_identity_id = actor_membership.participant_identity_id
  )
  select pg_catalog.jsonb_build_object(
    'eligibleParticipantCount', (
      select count(*)
      from target
      join public.room_memberships as membership
        on membership.room_id = target.room_id
       and membership.status = 'PARTICIPATED'
    ),
    'completedParticipantCount', (
      select count(*)
      from public.session_closing_responses as response
      where response.session_id = p_session_id
        and response.status in ('SUBMITTED', 'SKIPPED')
    ),
    'actorResponse', case
      when not exists (select 1 from actor_membership) then 'null'::jsonb
      when exists (select 1 from actor_response where id is not null) then (
        select pg_catalog.jsonb_build_object(
          'status', response.status,
          'revision', response.revision,
          'body', response.body,
          'updatedAt', response.updated_at
        )
        from actor_response as response
      )
      else pg_catalog.jsonb_build_object(
        'status', 'PENDING',
        'revision', 0,
        'body', null,
        'updatedAt', null
      )
    end
  );
$$;

revoke all on function private.session_closing_state_json(uuid, uuid)
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.apply_session_closing_response(
  p_actor_user_id uuid,
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer,
  p_expected_revision integer,
  p_status text,
  p_body text
)
returns table (
  room_id uuid,
  session_id uuid,
  closing jsonb,
  aggregate_version bigint,
  event_cursor bigint,
  duplicate boolean,
  officially_ended boolean,
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
  target_membership public.room_memberships%rowtype;
  current_response public.session_closing_responses%rowtype;
  previous_receipt private.session_closing_command_receipts%rowtype;
  response_payload jsonb;
  closing_payload jsonb;
  incomplete_connected_count bigint;
  connected_actual_count bigint;
  did_end boolean := false;
begin
  if p_actor_user_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_status not in ('PENDING', 'SUBMITTED', 'SKIPPED')
    or p_expected_revision < 0
    or p_expected_phase_version <= 0
    or (p_status = 'SUBMITTED' and length(btrim(coalesce(p_body, ''))) not between 1 and 300)
    or (p_status <> 'SUBMITTED' and p_body is not null) then
    raise exception using errcode = '22023', message = 'closing_response_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_user_id::text || p_command_id::text, 0)
  );
  select receipt.* into previous_receipt
  from private.session_closing_command_receipts as receipt
  where receipt.actor_user_id = p_actor_user_id
    and receipt.command_id = p_command_id;
  if found then
    if previous_receipt.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select
      (previous_receipt.response_payload ->> 'roomId')::uuid,
      (previous_receipt.response_payload ->> 'sessionId')::uuid,
      previous_receipt.response_payload -> 'closing',
      (previous_receipt.response_payload ->> 'aggregateVersion')::bigint,
      (previous_receipt.response_payload ->> 'eventCursor')::bigint,
      true,
      (previous_receipt.response_payload ->> 'officiallyEnded')::boolean,
      occurred_at;
    return;
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_session.phase <> 'CLOSING'
    or target_session.closing_ends_at is null
    or occurred_at >= target_session.closing_ends_at then
    raise exception using errcode = '55000', message = 'closing_response_locked';
  end if;
  if target_session.phase_version <> p_expected_phase_version then
    raise exception using errcode = '40001', message = 'phase_version_conflict';
  end if;

  select membership.* into target_membership
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = p_actor_user_id
    and membership.status = 'PARTICIPATED';
  if not found then
    raise exception using errcode = '42501', message = 'actual_participation_required';
  end if;
  select response.* into current_response
  from public.session_closing_responses as response
  where response.session_id = target_session.id
    and response.participant_identity_id = target_membership.participant_identity_id
  for update;
  if coalesce(current_response.revision, 0) <> p_expected_revision then
    raise exception using errcode = '40001', message = 'closing_revision_conflict';
  end if;

  insert into public.session_closing_responses (
    session_id, participant_identity_id, author_user_id,
    profile_name_snapshot, status, body, revision, created_at, updated_at
  ) values (
    target_session.id, target_membership.participant_identity_id,
    p_actor_user_id, target_membership.profile_name_snapshot,
    p_status, case when p_status = 'SUBMITTED' then btrim(p_body) else null end,
    p_expected_revision + 1, occurred_at, occurred_at
  )
  on conflict on constraint session_closing_responses_identity_unique do update
  set status = excluded.status,
      body = excluded.body,
      revision = excluded.revision,
      updated_at = excluded.updated_at;

  update public.session_runs as session
  set aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.* into target_session;
  closing_payload := private.session_closing_state_json(
    target_session.id, p_actor_user_id
  );
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, command_id, occurred_at
  ) values (
    target_session.id, target_session.last_event_seq,
    target_session.aggregate_version, target_session.channel_epoch,
    'SESSION_CLOSING_PROGRESS_CHANGED',
    pg_catalog.jsonb_build_object(
      'eligibleParticipantCount',
        (closing_payload ->> 'eligibleParticipantCount')::integer,
      'completedParticipantCount',
        (closing_payload ->> 'completedParticipantCount')::integer
    ),
    p_actor_user_id, p_command_id, occurred_at
  );

  if p_status in ('SUBMITTED', 'SKIPPED') then
    select
      count(*),
      count(*) filter (
        where not exists (
          select 1
          from public.session_closing_responses as response
          where response.session_id = target_session.id
            and response.participant_identity_id = membership.participant_identity_id
            and response.status in ('SUBMITTED', 'SKIPPED')
        )
      )
    into connected_actual_count, incomplete_connected_count
    from public.room_memberships as membership
    where membership.room_id = p_room_id
      and membership.status = 'PARTICIPATED'
      and exists (
        select 1
        from public.session_connections as connection
        where connection.session_id = target_session.id
          and connection.user_id = membership.user_id
          and connection.disconnected_at is null
          and connection.last_seen_at >= occurred_at - interval '30 seconds'
      );

    if connected_actual_count > 0 and incomplete_connected_count = 0 then
      update public.session_runs as session
      set phase = 'ENDED',
          phase_version = session.phase_version + 1,
          aggregate_version = session.aggregate_version + 1,
          last_event_seq = session.last_event_seq + 1,
          ended_at = occurred_at,
          updated_at = occurred_at
      where session.id = target_session.id
      returning session.* into target_session;
      update public.session_connections as connection
      set disconnected_at = occurred_at,
          updated_at = occurred_at
      where connection.session_id = target_session.id
        and connection.disconnected_at is null;
      insert into public.session_events (
        session_id, event_seq, aggregate_version, channel_epoch,
        event_type, public_payload, actor_user_id, command_id, occurred_at
      ) values (
        target_session.id, target_session.last_event_seq,
        target_session.aggregate_version, target_session.channel_epoch,
        'SESSION_STATE_CHANGED',
        pg_catalog.jsonb_build_object(
          'state', private.session_state_public_json(target_session),
          'reason', 'CLOSING_COMPLETED_EARLY'
        ),
        p_actor_user_id, p_command_id, occurred_at
      );
      did_end := true;
    end if;
  end if;

  response_payload := pg_catalog.jsonb_build_object(
    'roomId', p_room_id,
    'sessionId', target_session.id,
    'closing', closing_payload,
    'aggregateVersion', target_session.aggregate_version,
    'eventCursor', target_session.last_event_seq,
    'officiallyEnded', did_end
  );
  insert into private.session_closing_command_receipts (
    actor_user_id, command_id, request_fingerprint, response_payload, created_at
  ) values (
    p_actor_user_id, p_command_id, p_request_fingerprint,
    response_payload, occurred_at
  );

  return query select
    p_room_id, target_session.id, closing_payload,
    target_session.aggregate_version, target_session.last_event_seq,
    false, did_end, occurred_at;
end;
$$;

revoke all on function private.apply_session_closing_response(
  uuid, uuid, text, uuid, integer, integer, text, text
) from public, anon, authenticated, bookseasoning_ai_worker;

create function public.upsert_session_closing_response(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer,
  p_expected_revision integer,
  p_status text,
  p_body text default null
)
returns table (
  room_id uuid,
  session_id uuid,
  closing jsonb,
  aggregate_version bigint,
  event_cursor bigint,
  duplicate boolean,
  officially_ended boolean,
  server_time timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_session_closing_response(
    auth.uid(), p_command_id, p_request_fingerprint, p_room_id,
    p_expected_phase_version, p_expected_revision, p_status, p_body
  );
$$;

create function public.delete_session_closing_response(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer,
  p_expected_revision integer
)
returns table (
  room_id uuid,
  session_id uuid,
  closing jsonb,
  aggregate_version bigint,
  event_cursor bigint,
  duplicate boolean,
  officially_ended boolean,
  server_time timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select * from private.apply_session_closing_response(
    auth.uid(), p_command_id, p_request_fingerprint, p_room_id,
    p_expected_phase_version, p_expected_revision, 'PENDING', null
  );
$$;

revoke all on function public.upsert_session_closing_response(
  uuid, text, uuid, integer, integer, text, text
) from public, anon;
revoke all on function public.delete_session_closing_response(
  uuid, text, uuid, integer, integer
) from public, anon;
grant execute on function public.upsert_session_closing_response(
  uuid, text, uuid, integer, integer, text, text
) to authenticated;
grant execute on function public.delete_session_closing_response(
  uuid, text, uuid, integer, integer
) to authenticated;

comment on table public.session_closing_responses is
  'Actor-private Closing response rows. Other participants see only aggregate progress until the official result becomes READY.';
