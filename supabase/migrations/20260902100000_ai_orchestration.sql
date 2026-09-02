create table private.ai_host_help_requests (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_id uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  room_id uuid not null references public.rooms(id) on delete restrict,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  reason text not null check (
    reason in (
      'CONVERSATION_STOPPED', 'DISCUSSION_STUCK_OR_REPETITIVE',
      'TOO_FAR_OFF_TOPIC', 'CONFLICT_NEEDS_REFRAMING'
    )
  ),
  requested_phase_version integer not null check (requested_phase_version > 0),
  requested_through_seq bigint not null check (requested_through_seq >= 0),
  current_job_id uuid references private.ai_job_runs(id) on delete restrict,
  retry_available_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (actor_user_id, command_id),
  unique (session_id, id)
);

create index ai_host_help_requests_session_created_idx
on private.ai_host_help_requests (session_id, created_at desc);

create table private.ai_orchestration_jobs (
  job_id uuid primary key references private.ai_job_runs(id) on delete cascade,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  trigger text not null check (
    trigger in (
      'MESSAGE_BATCH', 'PARTICIPATION_THRESHOLD', 'SILENCE',
      'TOPIC_DURATION', 'EXTENSION_DECISION', 'HOST_HELP'
    )
  ),
  host_help_reason text check (
    host_help_reason is null
    or host_help_reason in (
      'CONVERSATION_STOPPED', 'DISCUSSION_STUCK_OR_REPETITIVE',
      'TOO_FAR_OFF_TOPIC', 'CONFLICT_NEEDS_REFRAMING'
    )
  ),
  host_help_request_id uuid,
  extension_phase_version integer check (extension_phase_version > 0),
  orchestration_key text not null check (length(orchestration_key) between 1 and 220),
  predecessor_job_id uuid references private.ai_job_runs(id) on delete restrict,
  refresh_no integer not null default 0 check (refresh_no between 0 and 3),
  created_at timestamptz not null default timezone('utc', now()),
  constraint ai_orchestration_jobs_host_help_request_fk
    foreign key (session_id, host_help_request_id)
    references private.ai_host_help_requests(session_id, id)
    on delete restrict,
  constraint ai_orchestration_jobs_shape_check check (
    (
      trigger = 'HOST_HELP'
      and host_help_reason is not null
      and host_help_request_id is not null
      and extension_phase_version is null
    )
    or (
      trigger = 'EXTENSION_DECISION'
      and host_help_reason is null
      and host_help_request_id is null
      and extension_phase_version is not null
    )
    or (
      trigger not in ('HOST_HELP', 'EXTENSION_DECISION')
      and host_help_reason is null
      and host_help_request_id is null
      and extension_phase_version is null
    )
  ),
  constraint ai_orchestration_jobs_job_same_session_fk
    foreign key (session_id, job_id)
    references private.ai_job_runs(session_id, id)
    on delete cascade
);

create index ai_orchestration_jobs_session_trigger_created_idx
on private.ai_orchestration_jobs (session_id, trigger, created_at desc);

create table private.ai_extension_opinions (
  id uuid primary key default gen_random_uuid(),
  source_job_id uuid not null unique references private.ai_job_runs(id) on delete restrict,
  policy_action_id uuid not null unique references private.ai_policy_actions(id) on delete restrict,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  phase_version integer not null check (phase_version > 0),
  based_through_seq bigint not null check (based_through_seq >= 0),
  schema_version text not null check (schema_version = 'extension-recommendation-output.v1'),
  canonical_output jsonb not null check (
    jsonb_typeof(canonical_output) = 'object'
    and private.public_jsonb_keys_allowed(canonical_output)
  ),
  status text not null check (status in ('COMMITTED', 'SUPPRESSED_STALE')),
  suppression_reason text check (
    suppression_reason is null
    or (
      length(suppression_reason) between 1 and 100
      and suppression_reason ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  committed_at timestamptz,
  constraint ai_extension_opinions_shape_check check (
    (status = 'COMMITTED' and committed_at is not null and suppression_reason is null)
    or (
      status = 'SUPPRESSED_STALE'
      and committed_at is null
      and suppression_reason is not null
    )
  )
);

create unique index ai_extension_opinions_one_committed_window_idx
on private.ai_extension_opinions (session_id, phase_version)
where status = 'COMMITTED';

revoke all on table private.ai_host_help_requests
from public, anon, authenticated, bookseasoning_ai_worker;
revoke all on table private.ai_orchestration_jobs
from public, anon, authenticated, bookseasoning_ai_worker;
revoke all on table private.ai_extension_opinions
from public, anon, authenticated, bookseasoning_ai_worker;

create trigger ai_extension_opinions_immutable
before update or delete on private.ai_extension_opinions
for each row execute function private.reject_immutable_ai_fact_mutation();

create function private.ai_job_public_status(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'PENDING' then 'QUEUED'
    when 'PROCESSING' then 'PROCESSING'
    when 'RETRY_SCHEDULED' then 'RETRYING'
    when 'SUCCEEDED' then 'SUCCEEDED'
    else 'FAILED'
  end;
$$;

revoke all on function private.ai_job_public_status(text)
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.enqueue_orchestrated_evaluation(
  p_job_key text,
  p_session_id uuid,
  p_base_wiki_version integer,
  p_target_through_seq bigint,
  p_trigger text,
  p_host_help_reason text default null,
  p_host_help_request_id uuid default null,
  p_extension_phase_version integer default null,
  p_orchestration_key text default null,
  p_predecessor_job_id uuid default null,
  p_refresh_no integer default 0
)
returns table (job_id uuid, queue_message_id bigint, duplicate boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  enqueued record;
  existing_directive private.ai_orchestration_jobs%rowtype;
begin
  if p_trigger not in (
    'MESSAGE_BATCH', 'PARTICIPATION_THRESHOLD', 'SILENCE',
    'TOPIC_DURATION', 'EXTENSION_DECISION', 'HOST_HELP'
  ) or p_refresh_no not between 0 and 3 then
    raise exception using errcode = '22023', message = 'ai_orchestration_directive_invalid';
  end if;
  if (p_trigger = 'HOST_HELP') <> (p_host_help_reason is not null)
    or (p_trigger = 'HOST_HELP') <> (p_host_help_request_id is not null)
    or (p_trigger = 'EXTENSION_DECISION') <> (p_extension_phase_version is not null)
    or (p_trigger <> 'HOST_HELP' and p_host_help_request_id is not null) then
    raise exception using errcode = '22023', message = 'ai_orchestration_directive_shape_invalid';
  end if;

  select * into enqueued
  from private.enqueue_ai_session_job(
    p_job_key,
    'PUBLIC_EVALUATION',
    p_session_id,
    p_base_wiki_version,
    p_target_through_seq,
    'public-evaluator-output.v1',
    null,
    3
  );

  select directive.* into existing_directive
  from private.ai_orchestration_jobs as directive
  where directive.job_id = enqueued.job_id;
  if found then
    if existing_directive.trigger is distinct from p_trigger
      or existing_directive.host_help_reason is distinct from p_host_help_reason
      or existing_directive.host_help_request_id is distinct from p_host_help_request_id
      or existing_directive.extension_phase_version is distinct from p_extension_phase_version
      or existing_directive.orchestration_key is distinct from coalesce(p_orchestration_key, p_job_key)
      or existing_directive.predecessor_job_id is distinct from p_predecessor_job_id
      or existing_directive.refresh_no is distinct from p_refresh_no then
      raise exception using errcode = '22023', message = 'ai_orchestration_replay_mismatch';
    end if;
  else
    insert into private.ai_orchestration_jobs (
      job_id, session_id, trigger, host_help_reason, host_help_request_id,
      extension_phase_version, orchestration_key, predecessor_job_id,
      refresh_no
    ) values (
      enqueued.job_id, p_session_id, p_trigger, p_host_help_reason,
      p_host_help_request_id, p_extension_phase_version,
      coalesce(p_orchestration_key, p_job_key), p_predecessor_job_id,
      p_refresh_no
    );
  end if;

  return query select enqueued.job_id, enqueued.queue_message_id, enqueued.duplicate;
end;
$$;

revoke all on function private.enqueue_orchestrated_evaluation(
  text, uuid, integer, bigint, text, text, uuid, integer, text, uuid, integer
) from public, anon, authenticated, bookseasoning_ai_worker;

create function public.request_session_ai_help(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid,
  p_expected_phase_version integer,
  p_reason text
)
returns table (
  room_id uuid,
  session_id uuid,
  request_id uuid,
  job_id uuid,
  request_status text,
  retry_available_at timestamptz,
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
  existing_request private.ai_host_help_requests%rowtype;
  recent_request private.ai_host_help_requests%rowtype;
  current_job private.ai_job_runs%rowtype;
  base_version integer := 0;
  new_request_id uuid := extensions.gen_random_uuid();
  enqueued record;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_command_id is null
    or p_request_fingerprint is null
    or length(btrim(p_request_fingerprint)) = 0
    or p_reason not in (
      'CONVERSATION_STOPPED', 'DISCUSSION_STUCK_OR_REPETITIVE',
      'TOO_FAR_OFF_TOPIC', 'CONFLICT_NEEDS_REFRAMING'
    ) then
    raise exception using errcode = '22023', message = 'ai_help_request_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );

  select request.* into existing_request
  from private.ai_host_help_requests as request
  where request.actor_user_id = actor_id
    and request.command_id = p_command_id;
  if found then
    if existing_request.request_fingerprint <> p_request_fingerprint then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    select job.* into strict current_job
    from private.ai_job_runs as job
    where job.id = existing_request.current_job_id;
    return query select
      existing_request.room_id,
      existing_request.session_id,
      existing_request.id,
      existing_request.current_job_id,
      private.ai_job_public_status(current_job.status),
      existing_request.retry_available_at,
      true,
      occurred_at;
    return;
  end if;

  select room.* into target_room
  from public.rooms as room
  where room.id = p_room_id
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.host_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'room_host_required';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.room_id = p_room_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session_not_found';
  end if;
  if target_session.phase not in ('OPENING', 'CORE', 'EXTENDED') then
    raise exception using errcode = '55000', message = 'ai_help_request_phase_not_allowed';
  end if;
  if target_session.phase_version <> p_expected_phase_version then
    raise exception using errcode = '40001', message = 'phase_version_conflict';
  end if;

  select request.* into recent_request
  from private.ai_host_help_requests as request
  where request.session_id = target_session.id
  order by request.created_at desc
  limit 1;
  if found then
    select job.* into current_job
    from private.ai_job_runs as job
    where job.id = recent_request.current_job_id;
    if current_job.status in ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED') then
      raise exception using errcode = '55000', message = 'ai_help_request_in_progress';
    end if;
    if recent_request.retry_available_at > occurred_at then
      raise exception using errcode = 'P0001', message = 'ai_help_request_cooldown';
    end if;
  end if;

  select coalesce(max(wiki.version), 0) into base_version
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_session.id;

  insert into private.ai_host_help_requests (
    id, actor_user_id, command_id, request_fingerprint, room_id, session_id,
    reason, requested_phase_version, requested_through_seq,
    retry_available_at, created_at
  ) values (
    new_request_id, actor_id, p_command_id, p_request_fingerprint,
    p_room_id, target_session.id, p_reason, target_session.phase_version,
    target_session.last_message_seq, occurred_at + interval '90 seconds',
    occurred_at
  );

  select * into enqueued
  from private.enqueue_orchestrated_evaluation(
    'session:' || target_session.id::text || ':host-help:' || new_request_id::text,
    target_session.id,
    base_version,
    target_session.last_message_seq,
    'HOST_HELP',
    p_reason,
    new_request_id,
    null,
    'session:' || target_session.id::text || ':host-help:' || new_request_id::text,
    null,
    0
  );

  update private.ai_host_help_requests as request
  set current_job_id = enqueued.job_id
  where request.id = new_request_id;

  return query select
    p_room_id,
    target_session.id,
    new_request_id,
    enqueued.job_id,
    'QUEUED'::text,
    occurred_at + interval '90 seconds',
    false,
    occurred_at;
end;
$$;

revoke all on function public.request_session_ai_help(
  uuid, text, uuid, integer, text
) from public, anon;
grant execute on function public.request_session_ai_help(
  uuid, text, uuid, integer, text
) to authenticated;

create function private.read_ai_orchestration_directive(
  p_job_id uuid,
  p_attempt_no integer
)
returns table (
  trigger text,
  host_help_reason text,
  extension_phase_version integer,
  refresh_no integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
begin
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id;
  if not found
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= timezone('utc', now()) then
    raise exception using errcode = '55000', message = 'ai_orchestration_attempt_stale';
  end if;

  return query
  select
    directive.trigger,
    directive.host_help_reason,
    directive.extension_phase_version,
    directive.refresh_no
  from private.ai_orchestration_jobs as directive
  where directive.job_id = p_job_id;
end;
$$;

revoke all on function private.read_ai_orchestration_directive(uuid, integer)
from public, anon, authenticated;
grant execute on function private.read_ai_orchestration_directive(uuid, integer)
to bookseasoning_ai_worker;

create function private.enqueue_ai_evaluation_if_due(
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

create function private.enqueue_due_ai_evaluations(
  p_now timestamptz default timezone('utc', now()),
  p_limit integer default 100
)
returns table (scanned_sessions integer, enqueued_jobs integer, server_time timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  scanned integer := 0;
  enqueued integer := 0;
begin
  if p_now is null or p_limit not between 1 and 500 then
    raise exception using errcode = '22023', message = 'ai_orchestration_reconcile_invalid';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('bookseasoning:enqueue-due-ai-evaluations', 0)
  ) then
    return query select 0, 0, p_now;
    return;
  end if;

  for candidate in
    select session.id
    from public.session_runs as session
    where session.phase in ('OPENING', 'CORE', 'EXTENDED')
    order by session.updated_at, session.id
    limit p_limit
  loop
    scanned := scanned + 1;
    if private.enqueue_ai_evaluation_if_due(candidate.id, p_now, true) then
      enqueued := enqueued + 1;
    end if;
  end loop;
  return query select scanned, enqueued, p_now;
end;
$$;

revoke all on function private.enqueue_due_ai_evaluations(timestamptz, integer)
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.orchestrate_participant_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'PARTICIPANT' then
    perform private.enqueue_ai_evaluation_if_due(
      new.session_id,
      new.confirmed_at,
      false
    );
  end if;
  return new;
end;
$$;

revoke all on function private.orchestrate_participant_message()
from public, anon, authenticated, bookseasoning_ai_worker;

create trigger messages_ai_orchestration
after insert on public.messages
for each row execute function private.orchestrate_participant_message();

create function private.orchestrate_session_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_version integer := 0;
  job_key text;
begin
  if old.phase = 'SCHEDULED' and new.phase = 'OPENING' then
    select coalesce(max(wiki.version), 0) into base_version
    from private.living_wiki_versions as wiki
    where wiki.session_id = new.id;
    perform private.enqueue_ai_session_job(
      'session:' || new.id::text || ':opening:p' || new.phase_version::text,
      'OPENING',
      new.id,
      base_version,
      new.last_message_seq,
      'opening-output.v1',
      null,
      3
    );
  end if;

  if old.extension_prompted_at is null
    and new.extension_prompted_at is not null
    and new.phase in ('OPENING', 'CORE', 'EXTENDED') then
    select coalesce(max(wiki.version), 0) into base_version
    from private.living_wiki_versions as wiki
    where wiki.session_id = new.id;
    job_key := 'session:' || new.id::text
      || ':extension:p' || new.phase_version::text
      || ':v' || base_version::text
      || ':s' || new.last_message_seq::text;
    perform private.enqueue_orchestrated_evaluation(
      job_key,
      new.id,
      base_version,
      new.last_message_seq,
      'EXTENSION_DECISION',
      null,
      null,
      new.phase_version,
      job_key,
      null,
      0
    );
  end if;
  return new;
end;
$$;

revoke all on function private.orchestrate_session_state()
from public, anon, authenticated, bookseasoning_ai_worker;

create trigger session_runs_ai_orchestration
after update on public.session_runs
for each row execute function private.orchestrate_session_state();

create function private.refresh_ai_orchestration_job(
  p_job_id uuid,
  p_attempt_no integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  directive private.ai_orchestration_jobs%rowtype;
  target_session public.session_runs%rowtype;
  target_request private.ai_host_help_requests%rowtype;
  base_version integer := 0;
  job_key text;
  enqueued record;
begin
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= timezone('utc', now()) then
    raise exception using errcode = '55000', message = 'ai_orchestration_attempt_stale';
  end if;

  select item.* into directive
  from private.ai_orchestration_jobs as item
  where item.job_id = target_job.id;
  if not found or directive.refresh_no >= 3 then
    return false;
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for share;
  if not found or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED') then
    return false;
  end if;

  if directive.trigger = 'HOST_HELP' then
    select request.* into target_request
    from private.ai_host_help_requests as request
    where request.id = directive.host_help_request_id
    for update;
    if not found or target_request.current_job_id <> target_job.id then
      return false;
    end if;
  elsif directive.trigger = 'EXTENSION_DECISION' then
    if target_session.extension_prompted_at is null
      or target_session.phase_version <> directive.extension_phase_version then
      return false;
    end if;
  end if;

  select coalesce(max(wiki.version), 0) into base_version
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_session.id;
  if base_version = target_job.base_wiki_version
    and target_session.last_message_seq = target_job.target_through_seq then
    return false;
  end if;

  job_key := directive.orchestration_key
    || ':refresh' || (directive.refresh_no + 1)::text
    || ':v' || base_version::text
    || ':s' || target_session.last_message_seq::text;
  select * into enqueued
  from private.enqueue_orchestrated_evaluation(
    job_key,
    target_session.id,
    base_version,
    target_session.last_message_seq,
    directive.trigger,
    directive.host_help_reason,
    directive.host_help_request_id,
    directive.extension_phase_version,
    directive.orchestration_key,
    target_job.id,
    directive.refresh_no + 1
  );

  if directive.trigger = 'HOST_HELP' then
    update private.ai_host_help_requests as request
    set current_job_id = enqueued.job_id
    where request.id = directive.host_help_request_id;
  end if;
  return true;
end;
$$;

revoke all on function private.refresh_ai_orchestration_job(uuid, integer)
from public, anon, authenticated;
grant execute on function private.refresh_ai_orchestration_job(uuid, integer)
to bookseasoning_ai_worker;

create function private.commit_ai_extension_opinion(
  p_job_id uuid,
  p_attempt_no integer,
  p_expected_phase text,
  p_expected_phase_version integer,
  p_policy_action_id uuid,
  p_policy jsonb,
  p_output jsonb
)
returns table (
  commit_status text,
  suppression_reason text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  directive private.ai_orchestration_jobs%rowtype;
  target_policy private.ai_policy_actions%rowtype;
  target_evaluation private.ai_evaluations%rowtype;
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  existing_opinion private.ai_extension_opinions%rowtype;
  occurred_at timestamptz := timezone('utc', now());
  expected_recommendation text;
begin
  if p_attempt_no <= 0
    or p_expected_phase_version <= 0
    or p_expected_phase not in ('OPENING', 'CORE', 'EXTENDED')
    or jsonb_typeof(p_policy) <> 'object'
    or jsonb_typeof(p_output) <> 'object'
    or not private.public_jsonb_keys_allowed(p_policy)
    or not private.public_jsonb_keys_allowed(p_output)
    or p_output ->> 'schemaVersion'
      is distinct from 'extension-recommendation-output.v1'
    or p_output ->> 'recommendation' not in ('EXTEND', 'FINISH')
    or length(btrim(p_output ->> 'reason')) not between 1 and 500
    or jsonb_typeof(p_output -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_output -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'ai_extension_opinion_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_extension_job_not_found';
  end if;
  select item.* into strict directive
  from private.ai_orchestration_jobs as item
  where item.job_id = target_job.id;
  if directive.trigger <> 'EXTENSION_DECISION'
    or directive.extension_phase_version <> p_expected_phase_version then
    raise exception using errcode = '22023', message = 'ai_extension_directive_mismatch';
  end if;

  select policy.* into target_policy
  from private.ai_policy_actions as policy
  where policy.id = p_policy_action_id
    and policy.session_id = target_job.session_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_extension_policy_not_found';
  end if;
  select evaluation.* into strict target_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.id = target_policy.evaluation_id
    and evaluation.session_id = target_job.session_id;

  expected_recommendation := case
    when target_policy.action = 'RECOMMEND_EXTENSION' then 'EXTEND'
    when target_policy.action = 'WAIT' then 'FINISH'
    else null
  end;
  if target_evaluation.job_id <> target_job.id
    or target_policy.trigger <> 'EXTENSION_DECISION'
    or expected_recommendation is null
    or p_policy ->> 'evaluationId' is distinct from target_evaluation.id::text
    or p_policy ->> 'action' is distinct from target_policy.action
    or p_output ->> 'recommendation' is distinct from expected_recommendation
    or p_output ->> 'packVersionId'
      is distinct from target_evaluation.canonical_result ->> 'packVersionId'
    or p_output ->> 'basedThroughSeq'
      is distinct from target_evaluation.target_through_seq::text then
    raise exception using errcode = '22023', message = 'ai_extension_policy_output_mismatch';
  end if;

  select opinion.* into existing_opinion
  from private.ai_extension_opinions as opinion
  where opinion.source_job_id = target_job.id;
  if found then
    if existing_opinion.canonical_output is distinct from p_output then
      raise exception using errcode = '22023', message = 'ai_extension_replay_mismatch';
    end if;
    return query select
      existing_opinion.status,
      existing_opinion.suppression_reason,
      true;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_extension_attempt_stale';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  select room.* into strict target_room
  from public.rooms as room
  where room.id = target_session.room_id;
  if p_output ->> 'packVersionId'
    is distinct from target_room.book_context_pack_version_id::text then
    raise exception using errcode = '22023', message = 'ai_extension_pack_mismatch';
  end if;

  select opinion.* into existing_opinion
  from private.ai_extension_opinions as opinion
  where opinion.session_id = target_session.id
    and opinion.phase_version = p_expected_phase_version
    and opinion.status = 'COMMITTED';
  if found then
    return query select 'COMMITTED'::text, null::text, true;
    return;
  end if;

  if target_session.phase <> p_expected_phase
    or target_session.phase_version <> p_expected_phase_version
    or target_session.extension_prompted_at is null
    or target_session.last_message_seq <> target_evaluation.target_through_seq then
    insert into private.ai_extension_opinions (
      source_job_id, policy_action_id, session_id, phase_version,
      based_through_seq, schema_version, canonical_output, status,
      suppression_reason, created_at
    ) values (
      target_job.id, target_policy.id, target_session.id,
      p_expected_phase_version, target_evaluation.target_through_seq,
      'extension-recommendation-output.v1', p_output, 'SUPPRESSED_STALE',
      case when target_session.phase <> p_expected_phase
        or target_session.phase_version <> p_expected_phase_version
        or target_session.extension_prompted_at is null
        then 'EXTENSION_WINDOW_CHANGED'
        else 'EXTENSION_CURSOR_ADVANCED'
      end,
      occurred_at
    );
    return query select
      'SUPPRESSED_STALE'::text,
      case when target_session.phase <> p_expected_phase
        or target_session.phase_version <> p_expected_phase_version
        or target_session.extension_prompted_at is null
        then 'EXTENSION_WINDOW_CHANGED'
        else 'EXTENSION_CURSOR_ADVANCED'
      end,
      false;
    return;
  end if;

  insert into private.ai_extension_opinions (
    source_job_id, policy_action_id, session_id, phase_version,
    based_through_seq, schema_version, canonical_output, status,
    created_at, committed_at
  ) values (
    target_job.id, target_policy.id, target_session.id,
    p_expected_phase_version, target_evaluation.target_through_seq,
    'extension-recommendation-output.v1', p_output, 'COMMITTED',
    occurred_at, occurred_at
  );

  update public.session_runs as session
  set aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.* into target_session;

  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, occurred_at
  ) values (
    target_session.id,
    target_session.last_event_seq,
    target_session.aggregate_version,
    target_session.channel_epoch,
    'SESSION_AI_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'extensionOpinion', pg_catalog.jsonb_build_object(
        'phaseVersion', p_expected_phase_version,
        'status', 'READY',
        'recommendation', p_output ->> 'recommendation',
        'reason', p_output ->> 'reason',
        'basedThroughSeq', target_evaluation.target_through_seq
      )
    ),
    occurred_at
  );
  return query select 'COMMITTED'::text, null::text, false;
end;
$$;

revoke all on function private.commit_ai_extension_opinion(
  uuid, integer, text, integer, uuid, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function private.commit_ai_extension_opinion(
  uuid, integer, text, integer, uuid, jsonb, jsonb
) to bookseasoning_ai_worker;

create function public.get_session_sync_with_ai(
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
  base_snapshot jsonb;
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  latest_wiki private.living_wiki_versions%rowtype;
  extension_opinion private.ai_extension_opinions%rowtype;
  extension_job private.ai_job_runs%rowtype;
  latest_help private.ai_host_help_requests%rowtype;
  help_job private.ai_job_runs%rowtype;
  extension_payload jsonb := 'null'::jsonb;
  help_payload jsonb := 'null'::jsonb;
  current_topic text;
begin
  select base.snapshot into strict base_snapshot
  from public.get_session_sync(
    p_room_id,
    p_after_event_cursor,
    p_after_message_seq,
    p_message_limit
  ) as base;

  select room.* into strict target_room
  from public.rooms as room
  where room.id = p_room_id;
  select session.* into strict target_session
  from public.session_runs as session
  where session.room_id = p_room_id;

  select wiki.* into latest_wiki
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_session.id
  order by wiki.version desc
  limit 1;
  if found then
    current_topic := latest_wiki.document #>> '{currentTopic,title}';
  end if;

  if target_session.extension_prompted_at is not null then
    select opinion.* into extension_opinion
    from private.ai_extension_opinions as opinion
    where opinion.session_id = target_session.id
      and opinion.phase_version = target_session.phase_version
      and opinion.status = 'COMMITTED'
    order by opinion.committed_at desc
    limit 1;
    if found then
      extension_payload := pg_catalog.jsonb_build_object(
        'phaseVersion', target_session.phase_version,
        'status', 'READY',
        'recommendation', extension_opinion.canonical_output ->> 'recommendation',
        'reason', extension_opinion.canonical_output ->> 'reason',
        'basedThroughSeq', extension_opinion.based_through_seq
      );
    else
      select job.* into extension_job
      from private.ai_orchestration_jobs as directive
      join private.ai_job_runs as job on job.id = directive.job_id
      where directive.session_id = target_session.id
        and directive.trigger = 'EXTENSION_DECISION'
        and directive.extension_phase_version = target_session.phase_version
      order by directive.refresh_no desc, directive.created_at desc
      limit 1;
      extension_payload := pg_catalog.jsonb_build_object(
        'phaseVersion', target_session.phase_version,
        'status', case
          when extension_job.status in ('FAILED', 'SUPPRESSED', 'SUCCEEDED')
            then 'UNAVAILABLE'
          else 'PENDING'
        end,
        'recommendation', null,
        'reason', null,
        'basedThroughSeq', null
      );
    end if;
  end if;

  if target_room.host_user_id = actor_id then
    select request.* into latest_help
    from private.ai_host_help_requests as request
    where request.session_id = target_session.id
    order by request.created_at desc
    limit 1;
    if found then
      select job.* into strict help_job
      from private.ai_job_runs as job
      where job.id = latest_help.current_job_id;
      help_payload := pg_catalog.jsonb_build_object(
        'requestId', latest_help.id,
        'reason', latest_help.reason,
        'status', private.ai_job_public_status(help_job.status),
        'requestedAt', latest_help.created_at,
        'retryAvailableAt', latest_help.retry_available_at
      );
    end if;
  end if;

  return query select
    base_snapshot
    || pg_catalog.jsonb_build_object(
      'publicDiscussion', pg_catalog.jsonb_build_object(
        'currentTopic', current_topic
      ),
      'ai', pg_catalog.jsonb_build_object(
        'extensionOpinion', extension_payload,
        'latestHostHelpRequest', help_payload
      )
    );
end;
$$;

revoke all on function public.get_session_sync_with_ai(
  uuid, bigint, bigint, integer
) from public, anon;
grant execute on function public.get_session_sync_with_ai(
  uuid, bigint, bigint, integer
) to authenticated;

do $$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select job.jobid
    from cron.job as job
    where job.jobname = 'bookseasoning-enqueue-due-ai-evaluations'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'bookseasoning-enqueue-due-ai-evaluations',
    '10 seconds',
    'select private.enqueue_due_ai_evaluations();'
  );
end;
$$;

comment on table private.ai_orchestration_jobs is
  'Content-free mapping from durable evaluation jobs to message, silence, topic, extension, or host-help triggers.';
comment on function public.request_session_ai_help(uuid, text, uuid, integer, text) is
  'Atomically validates the host-only request, enforces one in-flight request and a 90-second experiment cooldown, and enqueues a PUBLIC-only evaluation.';
comment on function private.enqueue_due_ai_evaluations(timestamptz, integer) is
  'Enqueues PUBLIC evaluation candidates for 60-second silence and 8-minute topic-duration signals without calling an external provider in Cron.';
comment on function private.commit_ai_extension_opinion(
  uuid, integer, text, integer, uuid, jsonb, jsonb
) is
  'Commits one privacy-safe extension opinion for the current decision window and broadcasts its public projection.';
