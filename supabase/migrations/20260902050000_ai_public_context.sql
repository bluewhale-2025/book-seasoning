create function private.read_ai_public_session_frame(
  p_session_id uuid,
  p_base_wiki_version integer,
  p_target_through_seq bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  built_at timestamptz := timezone('utc', now());
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  base_wiki jsonb := null;
  base_based_through_seq bigint := 0;
  participant_facts jsonb;
  objective_metrics jsonb;
  recent_policy_action jsonb;
  last_intervention_at timestamptz;
  last_participant_message_at timestamptz;
begin
  if p_base_wiki_version < 0 or p_target_through_seq < 0 then
    raise exception using errcode = '22023', message = 'invalid_ai_context_cursor';
  end if;

  select session.*
  into target_session
  from public.session_runs as session
  where session.id = p_session_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'ai_context_session_not_found';
  end if;

  select room.*
  into target_room
  from public.rooms as room
  where room.id = target_session.room_id;

  if p_target_through_seq > target_session.last_message_seq then
    raise exception using errcode = '22023', message = 'ai_context_cursor_ahead';
  end if;

  if p_base_wiki_version > 0 then
    select
      pg_catalog.jsonb_build_object(
        'sessionId', wiki.session_id,
        'version', wiki.version,
        'kind', wiki.kind,
        'baseVersion', wiki.base_version,
        'basedThroughSeq', wiki.based_through_seq,
        'schemaVersion', wiki.schema_version,
        'document', wiki.document,
        'createdAt', wiki.created_at
      ),
      wiki.based_through_seq
    into base_wiki, base_based_through_seq
    from private.living_wiki_versions as wiki
    where wiki.session_id = p_session_id
      and wiki.version = p_base_wiki_version;

    if not found then
      raise exception using errcode = 'P0002', message = 'ai_context_base_wiki_not_found';
    end if;
  end if;

  if base_based_through_seq > p_target_through_seq then
    raise exception using errcode = '22023', message = 'ai_context_cursor_before_base';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'participantId', membership.user_id,
        'profileName', membership.profile_name_snapshot,
        'role', case when target_room.host_user_id = membership.user_id
          then 'HOST' else 'PARTICIPANT' end,
        'membershipStatus', membership.status,
        'joinedAt', membership.joined_at,
        'participatedAt', membership.participated_at,
        'connectionStatus', case when connection_fact.online
          then 'ONLINE' else 'OFFLINE' end,
        'lastSeenAt', connection_fact.last_seen_at,
        'messageCountThroughCursor', message_fact.message_count,
        'lastMessageSeq', message_fact.last_message_seq,
        'lastSpokeAt', message_fact.last_spoke_at
      ) order by membership.joined_at, membership.user_id
    ),
    '[]'::jsonb
  )
  into participant_facts
  from public.room_memberships as membership
  left join lateral (
    select
      coalesce(
        pg_catalog.bool_or(
          connection.disconnected_at is null
          and connection.last_seen_at >= built_at - interval '30 seconds'
        ),
        false
      ) as online,
      max(connection.last_seen_at) as last_seen_at
    from public.session_connections as connection
    where connection.session_id = target_session.id
      and connection.user_id = membership.user_id
  ) as connection_fact on true
  left join lateral (
    select
      count(*)::integer as message_count,
      max(message.seq_no) as last_message_seq,
      max(message.confirmed_at) as last_spoke_at
    from public.messages as message
    where message.session_id = target_session.id
      and message.kind = 'PARTICIPANT'
      and message.author_user_id = membership.user_id
      and message.seq_no <= p_target_through_seq
  ) as message_fact on true
  where membership.room_id = target_session.room_id
    and membership.status in ('REGISTERED', 'PARTICIPATED');

  select max(message.confirmed_at)
  into last_participant_message_at
  from public.messages as message
  where message.session_id = p_session_id
    and message.kind = 'PARTICIPANT'
    and message.seq_no <= p_target_through_seq;

  select pg_catalog.jsonb_build_object(
    'registeredParticipantCount', count(*) filter (
      where membership.status in ('REGISTERED', 'PARTICIPATED')
    ),
    'actualParticipantCount', count(*) filter (
      where membership.status = 'PARTICIPATED'
    ),
    'connectedParticipantCount', (
      select count(distinct connection.user_id)
      from public.session_connections as connection
      join public.room_memberships as connected_membership
        on connected_membership.room_id = target_session.room_id
       and connected_membership.user_id = connection.user_id
       and connected_membership.status in ('REGISTERED', 'PARTICIPATED')
      where connection.session_id = target_session.id
        and connection.disconnected_at is null
        and connection.last_seen_at >= built_at - interval '30 seconds'
    ),
    'recentSpeakerCount', (
      select count(distinct message.author_user_id)
      from public.messages as message
      where message.session_id = target_session.id
        and message.kind = 'PARTICIPANT'
        and message.seq_no <= p_target_through_seq
        and message.confirmed_at >= built_at - interval '5 minutes'
    ),
    'recentSpeakerWindowSeconds', 300,
    'lastParticipantMessageAt', last_participant_message_at,
    'silenceSeconds', case
      when coalesce(last_participant_message_at, target_session.started_at) is null
        then 0
      else greatest(
        0,
        floor(extract(
          epoch from built_at - coalesce(
            last_participant_message_at,
            target_session.started_at
          )
        ))::integer
      )
    end
  )
  into objective_metrics
  from public.room_memberships as membership
  where membership.room_id = target_session.room_id;

  select pg_catalog.jsonb_build_object(
    'action', policy.action,
    'reasonCodes', policy.reason_codes,
    'supportingEvidenceRefs', policy.supporting_evidence_refs,
    'createdAt', policy.created_at
  )
  into recent_policy_action
  from private.ai_policy_actions as policy
  where policy.session_id = p_session_id
  order by policy.created_at desc, policy.id desc
  limit 1;

  select intervention.committed_at
  into last_intervention_at
  from private.ai_interventions as intervention
  where intervention.session_id = p_session_id
    and intervention.status = 'COMMITTED'
  order by intervention.committed_at desc, intervention.id desc
  limit 1;

  return pg_catalog.jsonb_build_object(
    'builtAt', built_at,
    'session', pg_catalog.jsonb_build_object(
      'sessionId', target_session.id,
      'roomId', target_session.room_id,
      'pinnedPackVersionId', target_room.book_context_pack_version_id,
      'phase', target_session.phase,
      'phaseVersion', target_session.phase_version,
      'aggregateVersion', target_session.aggregate_version,
      'targetThroughSeq', p_target_through_seq,
      'latestMessageSeq', target_session.last_message_seq,
      'startedAt', target_session.started_at,
      'discussionEndsAt', target_session.discussion_ends_at,
      'extensionPromptedAt', target_session.extension_prompted_at,
      'extensionDecisionDeadlineAt', target_session.extension_decision_deadline_at,
      'closingStartedAt', target_session.closing_started_at,
      'closingEndsAt', target_session.closing_ends_at,
      'endedAt', target_session.ended_at,
      'extensionCount', target_session.extension_count
    ),
    'baseWiki', base_wiki,
    'participants', participant_facts,
    'objectiveMetrics', objective_metrics,
    'recentPolicyAction', recent_policy_action,
    'lastCommittedInterventionAt', last_intervention_at
  );
end;
$$;

create function private.read_ai_public_messages(
  p_session_id uuid,
  p_from_seq bigint,
  p_through_seq bigint,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_from_seq < 1 or p_through_seq < 0 or p_limit < 1 or p_limit > 501 then
    raise exception using errcode = '22023', message = 'invalid_ai_message_range';
  end if;
  if not exists (
    select 1 from public.session_runs as session where session.id = p_session_id
  ) then
    raise exception using errcode = 'P0002', message = 'ai_context_session_not_found';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(message_document order by seq_no),
    '[]'::jsonb
  )
  into result
  from (
    select
      message.seq_no,
      pg_catalog.jsonb_build_object(
        'visibility', 'PUBLIC',
        'messageId', message.id,
        'sessionId', message.session_id,
        'seqNo', message.seq_no,
        'kind', message.kind,
        'authorParticipantId', message.author_user_id,
        'authorProfileName', message.author_profile_name_snapshot,
        'body', message.body,
        'reply', case when message.reply_to_message_id is null then null else
          pg_catalog.jsonb_build_object(
            'messageId', message.reply_to_message_id,
            'authorProfileName', message.reply_author_profile_name_snapshot,
            'quote', message.reply_quote_snapshot
          )
        end,
        'confirmedAt', message.confirmed_at,
        'redactedAt', message.redacted_at
      ) as message_document
    from public.messages as message
    where message.session_id = p_session_id
      and message.seq_no between p_from_seq and p_through_seq
    order by message.seq_no
    limit p_limit
  ) as selected_messages;

  return result;
end;
$$;

create function private.read_ai_public_messages_by_ids(
  p_session_id uuid,
  p_message_ids uuid[],
  p_through_seq bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if p_through_seq < 0
    or pg_catalog.cardinality(coalesce(p_message_ids, '{}'::uuid[])) > 24
    or pg_catalog.array_position(p_message_ids, null) is not null then
    raise exception using errcode = '22023', message = 'invalid_ai_message_reference';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'visibility', 'PUBLIC',
        'messageId', message.id,
        'sessionId', message.session_id,
        'seqNo', message.seq_no,
        'kind', message.kind,
        'authorParticipantId', message.author_user_id,
        'authorProfileName', message.author_profile_name_snapshot,
        'body', message.body,
        'reply', case when message.reply_to_message_id is null then null else
          pg_catalog.jsonb_build_object(
            'messageId', message.reply_to_message_id,
            'authorProfileName', message.reply_author_profile_name_snapshot,
            'quote', message.reply_quote_snapshot
          )
        end,
        'confirmedAt', message.confirmed_at,
        'redactedAt', message.redacted_at
      ) order by message.seq_no
    ),
    '[]'::jsonb
  )
  into result
  from public.messages as message
  where message.session_id = p_session_id
    and message.id = any(coalesce(p_message_ids, '{}'::uuid[]))
    and message.seq_no <= p_through_seq;

  return result;
end;
$$;

create function private.read_ai_public_prep(
  p_session_id uuid,
  p_prep_answer_ids uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
  result jsonb;
begin
  if pg_catalog.cardinality(coalesce(p_prep_answer_ids, '{}'::uuid[])) > 100
    or pg_catalog.array_position(p_prep_answer_ids, null) is not null then
    raise exception using errcode = '22023', message = 'invalid_ai_prep_reference';
  end if;

  select session.room_id
  into target_room_id
  from public.session_runs as session
  where session.id = p_session_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'ai_context_session_not_found';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'visibility', 'PUBLIC',
        'prepAnswerId', prep.id,
        'roomId', prep.room_id,
        'authorParticipantId', prep.author_user_id,
        'authorProfileName', prep.author_profile_name_snapshot,
        'promptType', prep.prompt_type,
        'body', prep.public_body,
        'revision', prep.revision,
        'updatedAt', prep.updated_at
      ) order by prep.updated_at, prep.id
    ),
    '[]'::jsonb
  )
  into result
  from public.prep_entries as prep
  where prep.room_id = target_room_id
    and prep.visibility = 'PUBLIC'
    and prep.public_body is not null
    and (
      p_prep_answer_ids is null
      or prep.id = any(p_prep_answer_ids)
    );

  return result;
end;
$$;

revoke all on function private.read_ai_public_session_frame(uuid, integer, bigint)
from public, anon, authenticated;
revoke all on function private.read_ai_public_messages(uuid, bigint, bigint, integer)
from public, anon, authenticated;
revoke all on function private.read_ai_public_messages_by_ids(uuid, uuid[], bigint)
from public, anon, authenticated;
revoke all on function private.read_ai_public_prep(uuid, uuid[])
from public, anon, authenticated;

grant execute on function private.read_ai_public_session_frame(uuid, integer, bigint)
to bookseasoning_ai_worker;
grant execute on function private.read_ai_public_messages(uuid, bigint, bigint, integer)
to bookseasoning_ai_worker;
grant execute on function private.read_ai_public_messages_by_ids(uuid, uuid[], bigint)
to bookseasoning_ai_worker;
grant execute on function private.read_ai_public_prep(uuid, uuid[])
to bookseasoning_ai_worker;

comment on function private.read_ai_public_session_frame(uuid, integer, bigint) is
  'Least-privilege PUBLIC-lane AI session/Wiki/objective-state snapshot. Never reads AI_PRIVATE prep bodies.';
comment on function private.read_ai_public_messages(uuid, bigint, bigint, integer) is
  'Materializes immutable PUBLIC message Raw Data for a same-session seq window.';
comment on function private.read_ai_public_messages_by_ids(uuid, uuid[], bigint) is
  'Resolves PUBLIC message Raw Data by exact id inside one session and cursor.';
comment on function private.read_ai_public_prep(uuid, uuid[]) is
  'Reads PUBLIC prep only; AI_PRIVATE metadata and bodies are excluded by predicate and projection.';
