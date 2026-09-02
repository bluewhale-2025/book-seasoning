create function private.session_message_public_json(
  p_message public.messages
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'messageId', p_message.id,
    'sessionId', p_message.session_id,
    'seqNo', p_message.seq_no,
    'kind', p_message.kind,
    'author', pg_catalog.jsonb_build_object(
      'userId', p_message.author_user_id,
      'profileName', p_message.author_profile_name_snapshot
    ),
    'clientMessageId', p_message.client_message_id,
    'body', p_message.body,
    'reply', case
      when p_message.reply_to_message_id is null then 'null'::jsonb
      else pg_catalog.jsonb_build_object(
        'messageId', p_message.reply_to_message_id,
        'authorProfileName', p_message.reply_author_profile_name_snapshot,
        'quote', p_message.reply_quote_snapshot
      )
    end,
    'confirmedAt', p_message.confirmed_at
  );
$$;

create function private.session_event_public_json(
  p_event public.session_events
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'eventId', p_event.id,
    'sessionId', p_event.session_id,
    'eventCursor', p_event.event_seq,
    'aggregateVersion', p_event.aggregate_version,
    'channelEpoch', p_event.channel_epoch,
    'occurredAt', p_event.occurred_at,
    'type', p_event.event_type,
    'payload', p_event.public_payload
  );
$$;

create function private.can_read_session_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms as room
    join public.session_runs as session on session.room_id = room.id
    left join public.room_memberships as membership
      on membership.room_id = room.id
     and membership.user_id = auth.uid()
    where room.id = p_room_id
      and room.canceled_at is null
      and session.phase <> 'CANCELED'
      and (
        (
          session.phase = 'ENDED'
          and (
            room.host_user_id = auth.uid()
            or membership.status = 'PARTICIPATED'
          )
        )
        or (
          session.phase <> 'ENDED'
          and membership.status in ('REGISTERED', 'PARTICIPATED')
        )
      )
  );
$$;

create function public.authorize_session_realtime_topic(
  p_topic text,
  p_ephemeral boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_runs as session
    join public.rooms as room on room.id = session.room_id
    join public.room_memberships as membership
      on membership.room_id = room.id
     and membership.user_id = auth.uid()
     and membership.status in ('REGISTERED', 'PARTICIPATED')
    where room.canceled_at is null
      and session.phase not in ('ENDED', 'CANCELED')
      and p_topic = 'session:' || session.id::text || ':v'
        || session.channel_epoch::text
        || case when p_ephemeral then ':ephemeral' else '' end
  );
$$;

revoke all on function private.session_message_public_json(public.messages)
from public, anon, authenticated;
revoke all on function private.session_event_public_json(public.session_events)
from public, anon, authenticated;
revoke all on function private.can_read_session_room(uuid)
from public, anon, authenticated;
revoke all on function public.authorize_session_realtime_topic(text, boolean)
from public, anon;
grant execute on function public.authorize_session_realtime_topic(text, boolean)
to authenticated;

create policy session_official_broadcast_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.messages.topic = (select realtime.topic())
  and public.authorize_session_realtime_topic(
    (select realtime.topic()),
    false
  )
);

create policy session_ephemeral_receive
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.messages.topic = (select realtime.topic())
  and public.authorize_session_realtime_topic(
    (select realtime.topic()),
    true
  )
);

create policy session_ephemeral_send
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and realtime.messages.topic = (select realtime.topic())
  and public.authorize_session_realtime_topic(
    (select realtime.topic()),
    true
  )
);

create function private.broadcast_session_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'id', new.id,
      'event', private.session_event_public_json(new)
    ),
    'session_event',
    'session:' || new.session_id::text || ':v' || new.channel_epoch::text,
    true
  );
  return new;
end;
$$;

revoke all on function private.broadcast_session_event()
from public, anon, authenticated;

create trigger session_events_private_broadcast
after insert on public.session_events
for each row execute function private.broadcast_session_event();

create function public.get_session_sync(
  p_room_id uuid,
  p_after_event_cursor bigint default 0,
  p_after_message_seq bigint default 0,
  p_message_limit integer default 100
)
returns table (snapshot jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  target_membership public.room_memberships%rowtype;
  target_pack public.book_context_pack_versions%rowtype;
  target_book public.books%rowtype;
  participants_payload jsonb;
  messages_payload jsonb;
  events_payload jsonb;
  connected_count bigint;
  oldest_message_seq bigint;
  newest_message_seq bigint;
  newest_event_seq bigint;
  has_more_messages_before boolean := false;
  has_more_messages_after boolean := false;
  has_more_events_after boolean := false;
  realtime_payload jsonb;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_after_event_cursor is null or p_after_event_cursor < 0
    or p_after_message_seq is null or p_after_message_seq < 0 then
    raise exception using errcode = '22023', message = 'session_cursor_invalid';
  end if;
  if p_message_limit is null or p_message_limit < 1 or p_message_limit > 100 then
    raise exception using errcode = '22023', message = 'session_message_limit_invalid';
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id;
  if target_session.id is null then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_room.canceled_at is not null or target_session.phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if not private.can_read_session_room(p_room_id) then
    raise exception using errcode = '42501', message = 'session_read_forbidden';
  end if;

  select membership.* into target_membership
  from public.room_memberships as membership
  where membership.room_id = p_room_id
    and membership.user_id = actor_id;

  select pack.* into target_pack
  from public.book_context_pack_versions as pack
  where pack.id = target_room.book_context_pack_version_id;
  select book.* into target_book
  from public.books as book
  where book.id = target_pack.book_id;

  select
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'userId', participant.user_id,
          'profileName', participant.profile_name_snapshot,
          'role', case when target_room.host_user_id = participant.user_id
            then 'HOST' else 'PARTICIPANT' end,
          'membershipStatus', participant.status,
          'connectionStatus', case when participant.is_online
            then 'ONLINE' else 'OFFLINE' end,
          'actualParticipation', participant.status = 'PARTICIPATED'
        ) order by participant.joined_at, participant.user_id
      ),
      '[]'::jsonb
    ),
    count(*) filter (where participant.is_online)
  into participants_payload, connected_count
  from (
    select
      membership.*,
      target_session.phase <> 'ENDED'
      and exists (
        select 1
        from public.session_connections as connection
        where connection.session_id = target_session.id
          and connection.user_id = membership.user_id
          and connection.disconnected_at is null
          and connection.last_seen_at >= occurred_at - interval '30 seconds'
      ) as is_online
    from public.room_memberships as membership
    where membership.room_id = p_room_id
      and (
        (target_session.phase = 'ENDED' and membership.status = 'PARTICIPATED')
        or (
          target_session.phase <> 'ENDED'
          and membership.status in ('REGISTERED', 'PARTICIPATED')
        )
      )
  ) as participant;

  if p_after_message_seq = 0 then
    select
      coalesce(
        pg_catalog.jsonb_agg(
          private.session_message_public_json(page.message)
          order by (page.message).seq_no
        ),
        '[]'::jsonb
      ),
      min((page.message).seq_no),
      max((page.message).seq_no)
    into messages_payload, oldest_message_seq, newest_message_seq
    from (
      select message
      from public.messages as message
      where message.session_id = target_session.id
      order by message.seq_no desc
      limit p_message_limit
    ) as page;
    has_more_messages_after := false;
  else
    select
      coalesce(
        pg_catalog.jsonb_agg(
          private.session_message_public_json(page.message)
          order by (page.message).seq_no
        ),
        '[]'::jsonb
      ),
      min((page.message).seq_no),
      max((page.message).seq_no)
    into messages_payload, oldest_message_seq, newest_message_seq
    from (
      select message
      from public.messages as message
      where message.session_id = target_session.id
        and message.seq_no > p_after_message_seq
      order by message.seq_no asc
      limit p_message_limit
    ) as page;

    has_more_messages_after := exists (
      select 1
      from public.messages as message
      where message.session_id = target_session.id
        and message.seq_no > coalesce(newest_message_seq, p_after_message_seq)
    );
  end if;

  has_more_messages_before := oldest_message_seq is not null and exists (
    select 1
    from public.messages as message
    where message.session_id = target_session.id
      and message.seq_no < oldest_message_seq
  );

  if p_after_event_cursor = 0 then
    events_payload := '[]'::jsonb;
    newest_event_seq := null;
    has_more_events_after := false;
  else
    select
      coalesce(
        pg_catalog.jsonb_agg(
          private.session_event_public_json(page.event)
          order by (page.event).event_seq
        ),
        '[]'::jsonb
      ),
      max((page.event).event_seq)
    into events_payload, newest_event_seq
    from (
      select event
      from public.session_events as event
      where event.session_id = target_session.id
        and event.event_seq > p_after_event_cursor
      order by event.event_seq asc
      limit 200
    ) as page;

    has_more_events_after := exists (
      select 1
      from public.session_events as event
      where event.session_id = target_session.id
        and event.event_seq > coalesce(newest_event_seq, p_after_event_cursor)
    );
  end if;

  realtime_payload := case
    when target_session.phase in ('ENDED', 'CANCELED') then 'null'::jsonb
    else pg_catalog.jsonb_build_object(
      'eventTopic', 'session:' || target_session.id::text || ':v'
        || target_session.channel_epoch::text,
      'ephemeralTopic', 'session:' || target_session.id::text || ':v'
        || target_session.channel_epoch::text || ':ephemeral'
    )
  end;

  return query select pg_catalog.jsonb_build_object(
    'sessionId', target_session.id,
    'serverTime', occurred_at,
    'room', pg_catalog.jsonb_build_object(
      'roomId', target_room.id,
      'title', target_room.title,
      'scheduledStartAt', target_room.scheduled_start_at,
      'packVersionId', target_pack.id,
      'bookTitle', target_book.title,
      'bookAuthor', target_book.author,
      'bookCoverUrl', target_book.cover_url
    ),
    'actor', pg_catalog.jsonb_build_object(
      'userId', actor_id,
      'role', case when target_room.host_user_id = actor_id
        then 'HOST' else 'PARTICIPANT' end,
      'membershipStatus', target_membership.status,
      'actualParticipation', target_membership.status = 'PARTICIPATED'
    ),
    'state', pg_catalog.jsonb_build_object(
      'phase', target_session.phase,
      'phaseVersion', target_session.phase_version,
      'aggregateVersion', target_session.aggregate_version,
      'channelEpoch', target_session.channel_epoch,
      'startedAt', target_session.started_at,
      'endedAt', target_session.ended_at,
      'extensionCount', target_session.extension_count,
      'deadlines', pg_catalog.jsonb_build_object(
        'discussionEndsAt', target_session.discussion_ends_at,
        'extensionPromptedAt', target_session.extension_prompted_at,
        'extensionDecisionDeadlineAt', target_session.extension_decision_deadline_at,
        'closingStartedAt', target_session.closing_started_at,
        'closingEndsAt', target_session.closing_ends_at
      )
    ),
    'participants', participants_payload,
    'connectedParticipantCount', connected_count,
    'messages', messages_payload,
    'events', events_payload,
    'cursors', pg_catalog.jsonb_build_object(
      'eventCursor', target_session.last_event_seq,
      'latestMessageSeq', target_session.last_message_seq,
      'oldestMessageSeq', oldest_message_seq,
      'hasMoreMessagesBefore', has_more_messages_before,
      'hasMoreMessagesAfter', has_more_messages_after,
      'hasMoreEventsAfter', has_more_events_after
    ),
    'publicDiscussion', pg_catalog.jsonb_build_object(
      'currentTopic', null
    ),
    'realtime', realtime_payload
  );
end;
$$;

create function public.get_session_message_page(
  p_room_id uuid,
  p_before_seq bigint default null,
  p_limit integer default 50
)
returns table (page jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  occurred_at timestamptz := timezone('utc', now());
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  messages_payload jsonb;
  oldest_message_seq bigint;
  newest_message_seq bigint;
  has_more_before boolean := false;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_before_seq is not null and p_before_seq < 1 then
    raise exception using errcode = '22023', message = 'session_cursor_invalid';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception using errcode = '22023', message = 'session_message_limit_invalid';
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id;
  if target_room.id is null then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id;
  if target_session.id is null then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_room.canceled_at is not null or target_session.phase = 'CANCELED' then
    raise exception using errcode = '55000', message = 'room_canceled';
  end if;
  if not private.can_read_session_room(p_room_id) then
    raise exception using errcode = '42501', message = 'session_read_forbidden';
  end if;

  select
    coalesce(
      pg_catalog.jsonb_agg(
        private.session_message_public_json(result.message)
        order by (result.message).seq_no
      ),
      '[]'::jsonb
    ),
    min((result.message).seq_no),
    max((result.message).seq_no)
  into messages_payload, oldest_message_seq, newest_message_seq
  from (
    select message
    from public.messages as message
    where message.session_id = target_session.id
      and (p_before_seq is null or message.seq_no < p_before_seq)
    order by message.seq_no desc
    limit p_limit
  ) as result;

  has_more_before := oldest_message_seq is not null and exists (
    select 1
    from public.messages as message
    where message.session_id = target_session.id
      and message.seq_no < oldest_message_seq
  );

  return query select pg_catalog.jsonb_build_object(
    'sessionId', target_session.id,
    'serverTime', occurred_at,
    'messages', messages_payload,
    'page', pg_catalog.jsonb_build_object(
      'oldestMessageSeq', oldest_message_seq,
      'newestMessageSeq', newest_message_seq,
      'hasMoreBefore', has_more_before
    )
  );
end;
$$;

revoke all on function public.get_session_sync(uuid, bigint, bigint, integer)
from public, anon;
grant execute on function public.get_session_sync(uuid, bigint, bigint, integer)
to authenticated;

revoke all on function public.get_session_message_page(uuid, bigint, integer)
from public, anon;
grant execute on function public.get_session_message_page(uuid, bigint, integer)
to authenticated;

comment on function public.get_session_sync(uuid, bigint, bigint, integer) is
  'Returns an authorized authoritative session snapshot plus bounded cursor gaps.';
comment on function public.get_session_message_page(uuid, bigint, integer) is
  'Returns an authorized backward page of immutable session messages.';
comment on trigger session_events_private_broadcast on public.session_events is
  'Publishes only the committed public event DTO to the current private epoch topic.';
