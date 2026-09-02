alter table public.messages
  add constraint messages_body_nonblank_check
  check (length(btrim(body)) > 0);

create unique index session_events_message_appended_source_idx
on public.session_events (
  session_id,
  (public_payload #>> '{message,messageId}')
)
where event_type = 'MESSAGE_APPENDED';

create function public.append_session_message(
  p_room_id uuid,
  p_client_message_id uuid,
  p_body text,
  p_reply_to_message_id uuid default null
)
returns table (
  room_id uuid,
  session_id uuid,
  message_id uuid,
  seq_no bigint,
  kind text,
  author_user_id uuid,
  author_profile_name text,
  client_message_id uuid,
  body text,
  reply_to_message_id uuid,
  reply_author_profile_name text,
  reply_quote text,
  confirmed_at timestamptz,
  aggregate_version bigint,
  event_cursor bigint,
  channel_epoch integer,
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
  target_membership public.room_memberships%rowtype;
  target_message public.messages%rowtype;
  target_reply public.messages%rowtype;
  target_event public.session_events%rowtype;
  actor_profile_name text;
  next_message_id uuid;
  next_message_seq bigint;
  next_aggregate_version bigint;
  next_event_seq bigint;
  reply_payload jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_client_message_id is null then
    raise exception using errcode = '22023', message = 'client_message_id_required';
  end if;
  if p_body is null or length(p_body) > 2000 or length(btrim(p_body)) = 0 then
    raise exception using errcode = '22023', message = 'message_body_invalid';
  end if;

  -- Room commands take the room lock first. A shared lock keeps member removal,
  -- cancellation, and other exclusive room commands from racing this commit.
  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id
  for share;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  -- This lock is the session-local sequence allocator. Message, aggregate, and
  -- event cursors are advanced by one transaction and cannot be interleaved.
  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if target_session.id is null then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;

  select membership.* into target_membership
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = actor_id
  for share;
  if target_membership.user_id is null
    or target_membership.status <> 'PARTICIPATED' then
    raise exception using errcode = '42501', message = 'actual_participation_required';
  end if;

  -- A client may retry after the phase has moved on. If its message was already
  -- committed, return the original event position instead of rejecting it or
  -- reporting the session's newer cursor as if the client had consumed it.
  select message.* into target_message
  from public.messages as message
  where message.session_id = target_session.id
    and message.kind = 'PARTICIPANT'
    and message.author_user_id = actor_id
    and message.client_message_id = p_client_message_id;
  if target_message.id is not null then
    if target_message.body <> p_body
      or target_message.reply_to_message_id is distinct from p_reply_to_message_id then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;

    select event.* into target_event
    from public.session_events as event
    where event.session_id = target_session.id
      and event.event_type = 'MESSAGE_APPENDED'
      and event.public_payload #>> '{message,messageId}' = target_message.id::text;
    if target_event.id is null then
      raise exception using errcode = 'XX000', message = 'message_event_invariant_violated';
    end if;

    return query select
      p_room_id,
      target_message.session_id,
      target_message.id,
      target_message.seq_no,
      target_message.kind,
      target_message.author_user_id,
      target_message.author_profile_name_snapshot,
      target_message.client_message_id,
      target_message.body,
      target_message.reply_to_message_id,
      target_message.reply_author_profile_name_snapshot,
      target_message.reply_quote_snapshot,
      target_message.confirmed_at,
      target_event.aggregate_version,
      target_event.event_seq,
      target_event.channel_epoch,
      true,
      occurred_at;
    return;
  end if;

  if target_room.canceled_at is not null or target_session.phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if target_session.phase not in ('OPENING', 'CORE', 'EXTENDED', 'SYNTHESIS') then
    raise exception using errcode = '55000', message = 'message_write_not_allowed';
  end if;

  select profile.profile_name into actor_profile_name
  from public.profiles as profile
  where profile.user_id = actor_id
  for share;
  if actor_profile_name is null then
    raise exception using errcode = 'P0002', message = 'profile_not_found';
  end if;

  if p_reply_to_message_id is not null then
    select message.* into target_reply
    from public.messages as message
    where message.session_id = target_session.id
      and message.id = p_reply_to_message_id
      and message.confirmed_at is not null;
    if target_reply.id is null then
      raise exception using errcode = 'P0002', message = 'reply_message_not_found';
    end if;

    reply_payload := pg_catalog.jsonb_build_object(
      'messageId', target_reply.id,
      'authorProfileName', target_reply.author_profile_name_snapshot,
      'quote', target_reply.body
    );
  else
    reply_payload := 'null'::jsonb;
  end if;

  next_message_id := extensions.gen_random_uuid();
  next_message_seq := target_session.last_message_seq + 1;
  next_aggregate_version := target_session.aggregate_version + 1;
  next_event_seq := target_session.last_event_seq + 1;

  update public.session_runs as session
  set last_message_seq = next_message_seq,
      aggregate_version = next_aggregate_version,
      last_event_seq = next_event_seq,
      updated_at = occurred_at
  where session.id = target_session.id;

  insert into public.messages (
    id, session_id, seq_no, kind, author_user_id,
    author_profile_name_snapshot, client_message_id, body,
    reply_to_message_id, reply_author_profile_name_snapshot,
    reply_quote_snapshot, confirmed_at, created_at
  ) values (
    next_message_id, target_session.id, next_message_seq, 'PARTICIPANT', actor_id,
    actor_profile_name, p_client_message_id, p_body,
    target_reply.id, target_reply.author_profile_name_snapshot,
    target_reply.body, occurred_at, occurred_at
  )
  returning * into target_message;

  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, occurred_at
  ) values (
    target_session.id,
    next_event_seq,
    next_aggregate_version,
    target_session.channel_epoch,
    'MESSAGE_APPENDED',
    pg_catalog.jsonb_build_object(
      'message', pg_catalog.jsonb_build_object(
        'messageId', next_message_id,
        'sessionId', target_session.id,
        'seqNo', next_message_seq,
        'kind', 'PARTICIPANT',
        'author', pg_catalog.jsonb_build_object(
          'userId', actor_id,
          'profileName', actor_profile_name
        ),
        'clientMessageId', p_client_message_id,
        'body', p_body,
        'reply', reply_payload,
        'confirmedAt', occurred_at
      )
    ),
    actor_id,
    occurred_at
  )
  returning * into target_event;

  return query select
    p_room_id,
    target_message.session_id,
    target_message.id,
    target_message.seq_no,
    target_message.kind,
    target_message.author_user_id,
    target_message.author_profile_name_snapshot,
    target_message.client_message_id,
    target_message.body,
    target_message.reply_to_message_id,
    target_message.reply_author_profile_name_snapshot,
    target_message.reply_quote_snapshot,
    target_message.confirmed_at,
    target_event.aggregate_version,
    target_event.event_seq,
    target_event.channel_epoch,
    false,
    occurred_at;
end;
$$;

revoke all on function public.append_session_message(uuid, uuid, text, uuid)
from public, anon;
grant execute on function public.append_session_message(uuid, uuid, text, uuid)
to authenticated;

comment on function public.append_session_message(uuid, uuid, text, uuid) is
  'Atomically appends one immutable participant message, its inline-reply snapshot, and its public event.';
