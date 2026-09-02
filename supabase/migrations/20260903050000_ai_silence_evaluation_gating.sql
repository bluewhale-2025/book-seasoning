create or replace function private.enqueue_ai_evaluation_if_due(
  p_session_id uuid,
  p_now timestamptz,
  p_allow_time_signals boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.session_runs%rowtype;
  base_version integer := 0;
  base_cursor bigint := 0;
  participant_message_count bigint := 0;
  distinct_speaker_count bigint := 0;
  actual_participant_count bigint := 0;
  speaker_threshold integer := 2;
  last_participant_message_at timestamptz;
  latest_intervention_at timestamptz;
  latest_topic_trigger_at timestamptz;
  selected_trigger text;
  job_key text;
  silence_bucket bigint;
begin
  if p_now is null then
    raise exception using errcode = '22023', message = 'ai_orchestration_time_required';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = p_session_id;
  if not found or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED') then
    return false;
  end if;
  if exists (
    select 1
    from private.ai_job_runs as job
    join private.ai_orchestration_jobs as directive on directive.job_id = job.id
    where job.session_id = target_session.id
      and job.status in ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED')
  ) then
    return false;
  end if;

  select wiki.version, wiki.based_through_seq
  into base_version, base_cursor
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_session.id
  order by wiki.version desc
  limit 1;
  base_version := coalesce(base_version, 0);
  base_cursor := coalesce(base_cursor, 0);

  select
    count(*),
    count(distinct message.author_user_id),
    max(message.confirmed_at)
  into participant_message_count, distinct_speaker_count, last_participant_message_at
  from public.messages as message
  where message.session_id = target_session.id
    and message.kind = 'PARTICIPANT'
    and message.seq_no > base_cursor
    and message.seq_no <= target_session.last_message_seq;

  select count(*) into actual_participant_count
  from public.room_memberships as membership
  join public.rooms as room on room.id = membership.room_id
  where room.id = target_session.room_id
    and membership.status = 'PARTICIPATED';
  speaker_threshold := greatest(
    2,
    ceil(greatest(actual_participant_count, 2)::numeric * 0.6)::integer
  );

  if participant_message_count >= 4 then
    selected_trigger := 'MESSAGE_BATCH';
  elsif participant_message_count >= 2
    and distinct_speaker_count >= speaker_threshold then
    selected_trigger := 'PARTICIPATION_THRESHOLD';
  elsif p_allow_time_signals then
    if last_participant_message_at is null then
      select max(message.confirmed_at) into last_participant_message_at
      from public.messages as message
      where message.session_id = target_session.id
        and message.kind = 'PARTICIPANT';
    end if;
    last_participant_message_at := coalesce(
      last_participant_message_at,
      target_session.started_at
    );

    select max(intervention.committed_at) into latest_intervention_at
    from private.ai_interventions as intervention
    where intervention.session_id = target_session.id
      and intervention.status = 'COMMITTED';

    -- Time-based evaluation is useful only after a participant has responded to
    -- the last AI intervention and the automatic intervention cooldown elapsed.
    -- Message-based triggers remain available during this window so human input
    -- is never hidden from the Living Wiki pipeline.
    if latest_intervention_at is not null
      and (
        latest_intervention_at >= last_participant_message_at
        or latest_intervention_at > p_now - interval '90 seconds'
      ) then
      return false;
    end if;

    if last_participant_message_at is not null
      and last_participant_message_at <= p_now - interval '60 seconds'
      and not exists (
        select 1
        from private.ai_orchestration_jobs as directive
        join private.ai_job_runs as job on job.id = directive.job_id
        where directive.session_id = target_session.id
          and directive.trigger = 'SILENCE'
          and job.target_through_seq = target_session.last_message_seq
          and directive.created_at > p_now - interval '90 seconds'
      ) then
      selected_trigger := 'SILENCE';
    else
      select max(directive.created_at) into latest_topic_trigger_at
      from private.ai_orchestration_jobs as directive
      where directive.session_id = target_session.id
        and directive.trigger = 'TOPIC_DURATION';
      if base_version > 0
        and coalesce(latest_topic_trigger_at, target_session.started_at)
          <= p_now - interval '8 minutes' then
        selected_trigger := 'TOPIC_DURATION';
      end if;
    end if;
  end if;

  if selected_trigger is null then
    return false;
  end if;

  silence_bucket := floor(extract(epoch from p_now) / 90)::bigint;
  job_key := 'session:' || target_session.id::text
    || ':evaluation:' || lower(selected_trigger)
    || ':v' || base_version::text
    || ':s' || target_session.last_message_seq::text
    || case when selected_trigger = 'SILENCE'
      then ':b' || silence_bucket::text else '' end;

  perform private.enqueue_orchestrated_evaluation(
    job_key,
    target_session.id,
    base_version,
    target_session.last_message_seq,
    selected_trigger,
    null,
    null,
    null,
    job_key,
    null,
    0
  );
  return true;
end;
$$;

revoke all on function private.enqueue_ai_evaluation_if_due(
  uuid, timestamptz, boolean
) from public, anon, authenticated, bookseasoning_ai_worker;

comment on function private.enqueue_ai_evaluation_if_due(
  uuid, timestamptz, boolean
) is 'Enqueues message or time based evaluator work while preventing repeated AI-only silence loops.';
