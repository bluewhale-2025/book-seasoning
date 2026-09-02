alter table public.messages
add column ai_attribution text check (
  ai_attribution is null
  or ai_attribution in ('OPENING', 'AUTOMATIC', 'HOST_REQUESTED')
);

create or replace function private.session_message_public_json(
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
    'aiAttribution', p_message.ai_attribution,
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

create table private.ai_provider_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.ai_job_runs(id) on delete restrict,
  attempt_no integer not null check (attempt_no > 0),
  task_alias text not null check (
    task_alias in (
      'PUBLIC_EVALUATOR_INCREMENTAL_V1',
      'PUBLIC_EVALUATOR_TOPIC_CHECKPOINT_V1',
      'OPENING_V1',
      'HOST_INTERVENTION_V1'
    )
  ),
  prompt_version text not null check (
    length(prompt_version) between 1 and 100
    and prompt_version ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  output_schema_version text not null check (
    length(output_schema_version) between 1 and 100
    and output_schema_version ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  provider text not null check (provider = 'OPENAI'),
  model text not null check (length(model) between 1 and 100),
  reasoning_effort text not null check (
    reasoning_effort in ('none', 'low', 'medium')
  ),
  status text not null check (status in ('SUCCEEDED', 'FAILED')),
  response_id text check (
    response_id is null or length(response_id) between 1 and 200
  ),
  latency_ms integer not null check (latency_ms >= 0),
  usage jsonb check (usage is null or jsonb_typeof(usage) = 'object'),
  error_code text check (
    error_code is null
    or (
      length(error_code) between 1 and 100
      and error_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  canonical_run jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint ai_provider_runs_attempt_fk
    foreign key (job_id, attempt_no)
    references private.ai_job_attempts(job_id, attempt_no)
    on delete restrict,
  constraint ai_provider_runs_task_attempt_unique
    unique (job_id, attempt_no, task_alias),
  constraint ai_provider_runs_status_shape_check check (
    (
      status = 'SUCCEEDED'
      and response_id is not null
      and error_code is null
      and canonical_run is not null
      and jsonb_typeof(canonical_run) = 'object'
    )
    or (
      status = 'FAILED'
      and response_id is null
      and usage is null
      and error_code is not null
      and canonical_run is null
    )
  )
);

create index ai_provider_runs_job_created_idx
on private.ai_provider_runs (job_id, created_at);

create table private.ai_openings (
  id uuid primary key default gen_random_uuid(),
  source_job_id uuid not null unique,
  session_id uuid not null unique references public.session_runs(id) on delete restrict,
  message_id uuid,
  based_through_seq bigint not null check (based_through_seq >= 0),
  schema_version text not null check (schema_version = 'opening-output.v1'),
  canonical_output jsonb not null check (jsonb_typeof(canonical_output) = 'object'),
  fallback_used boolean not null,
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
  constraint ai_openings_source_job_same_session_fk
    foreign key (session_id, source_job_id)
    references private.ai_job_runs(session_id, id)
    on delete restrict,
  constraint ai_openings_message_same_session_fk
    foreign key (session_id, message_id)
    references public.messages(session_id, id)
    on delete restrict,
  constraint ai_openings_commit_shape_check check (
    (
      status = 'COMMITTED'
      and message_id is not null
      and committed_at is not null
      and suppression_reason is null
    )
    or (
      status = 'SUPPRESSED_STALE'
      and message_id is null
      and committed_at is null
      and suppression_reason is not null
    )
  )
);

alter table private.ai_interventions
add column phase_transitioned boolean not null default false;

revoke all on table private.ai_provider_runs from public, anon, authenticated;
revoke all on table private.ai_openings from public, anon, authenticated;

create trigger ai_provider_runs_immutable
before update or delete on private.ai_provider_runs
for each row execute function private.reject_immutable_ai_fact_mutation();

create trigger ai_openings_immutable
before update or delete on private.ai_openings
for each row execute function private.reject_immutable_ai_fact_mutation();

create function private.record_ai_provider_run(
  p_job_id uuid,
  p_attempt_no integer,
  p_task_alias text,
  p_prompt_version text,
  p_output_schema_version text,
  p_provider text,
  p_model text,
  p_reasoning_effort text,
  p_status text,
  p_response_id text,
  p_latency_ms integer,
  p_usage jsonb,
  p_error_code text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  existing_run private.ai_provider_runs%rowtype;
  inserted_id uuid;
  run_payload jsonb;
begin
  if p_attempt_no <= 0
    or p_task_alias not in (
      'PUBLIC_EVALUATOR_INCREMENTAL_V1',
      'PUBLIC_EVALUATOR_TOPIC_CHECKPOINT_V1',
      'OPENING_V1',
      'HOST_INTERVENTION_V1'
    )
    or p_prompt_version is null
    or length(p_prompt_version) not between 1 and 100
    or p_prompt_version !~ '^[a-z0-9][a-z0-9._-]*$'
    or p_output_schema_version is null
    or length(p_output_schema_version) not between 1 and 100
    or p_output_schema_version !~ '^[a-z0-9][a-z0-9._-]*$'
    or p_provider <> 'OPENAI'
    or p_model is null
    or length(p_model) not between 1 and 100
    or p_reasoning_effort not in ('none', 'low', 'medium')
    or p_status not in ('SUCCEEDED', 'FAILED')
    or p_latency_ms < 0 then
    raise exception using errcode = '22023', message = 'ai_provider_run_invalid';
  end if;
  if (
    p_status = 'SUCCEEDED'
    and (
      p_response_id is null
      or p_error_code is not null
      or (p_usage is not null and jsonb_typeof(p_usage) <> 'object')
    )
  ) or (
    p_status = 'FAILED'
    and (p_response_id is not null or p_usage is not null or p_error_code is null)
  ) then
    raise exception using errcode = '22023', message = 'ai_provider_run_shape_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for share;
  if not found
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= timezone('utc', now()) then
    raise exception using errcode = '55000', message = 'ai_provider_attempt_stale';
  end if;

  run_payload := case when p_status = 'SUCCEEDED' then
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'ai-provider-run.v1',
      'taskAlias', p_task_alias,
      'promptVersion', p_prompt_version,
      'outputSchemaVersion', p_output_schema_version,
      'provider', p_provider,
      'model', p_model,
      'reasoningEffort', p_reasoning_effort,
      'responseId', p_response_id,
      'latencyMs', p_latency_ms,
      'usage', p_usage
    )
    else null end;

  select provider_run.* into existing_run
  from private.ai_provider_runs as provider_run
  where provider_run.job_id = p_job_id
    and provider_run.attempt_no = p_attempt_no
    and provider_run.task_alias = p_task_alias;
  if found then
    if existing_run.prompt_version is distinct from p_prompt_version
      or existing_run.output_schema_version is distinct from p_output_schema_version
      or existing_run.provider is distinct from p_provider
      or existing_run.model is distinct from p_model
      or existing_run.reasoning_effort is distinct from p_reasoning_effort
      or existing_run.status is distinct from p_status
      or existing_run.response_id is distinct from p_response_id
      or existing_run.latency_ms is distinct from p_latency_ms
      or existing_run.usage is distinct from p_usage
      or existing_run.error_code is distinct from p_error_code then
      raise exception using errcode = '22023', message = 'ai_provider_run_replay_mismatch';
    end if;
    return existing_run.id;
  end if;

  insert into private.ai_provider_runs (
    job_id, attempt_no, task_alias, prompt_version, output_schema_version,
    provider, model, reasoning_effort, status, response_id, latency_ms,
    usage, error_code, canonical_run
  ) values (
    p_job_id, p_attempt_no, p_task_alias, p_prompt_version,
    p_output_schema_version, p_provider, p_model, p_reasoning_effort,
    p_status, p_response_id, p_latency_ms, p_usage, p_error_code, run_payload
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

create function private.commit_ai_opening(
  p_job_id uuid,
  p_attempt_no integer,
  p_expected_phase_version integer,
  p_output jsonb,
  p_provider_run jsonb,
  p_fallback_used boolean
)
returns table (
  commit_status text,
  message_id uuid,
  message_seq bigint,
  suppression_reason text,
  duplicate boolean,
  phase_transitioned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  existing_opening private.ai_openings%rowtype;
  provider_record private.ai_provider_runs%rowtype;
  next_message_id uuid;
  next_message_seq bigint;
  next_aggregate_version bigint;
  next_event_seq bigint;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or p_expected_phase_version < 0
    or p_fallback_used is null
    or jsonb_typeof(p_output) <> 'object'
    or not private.public_jsonb_keys_allowed(p_output)
    or p_output ->> 'schemaVersion' is distinct from 'opening-output.v1'
    or p_output ->> 'message' is null
    or length(btrim(p_output ->> 'message')) not between 1 and 2000
    or jsonb_typeof(p_output -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_output -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'ai_opening_output_invalid';
  end if;
  if (p_fallback_used and p_provider_run is not null)
    or (not p_fallback_used and jsonb_typeof(p_provider_run) <> 'object') then
    raise exception using errcode = '22023', message = 'ai_opening_provider_shape_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_opening_job_not_found';
  end if;
  if target_job.job_type <> 'OPENING'
    or target_job.base_wiki_version <> 0
    or target_job.task_schema_version <> 'opening-output.v1'
    or p_output ->> 'basedThroughSeq'
      is distinct from target_job.target_through_seq::text then
    raise exception using errcode = '22023', message = 'ai_opening_job_mismatch';
  end if;

  select opening.* into existing_opening
  from private.ai_openings as opening
  where opening.source_job_id = target_job.id;
  if found then
    if existing_opening.canonical_output is distinct from p_output
      or existing_opening.fallback_used is distinct from p_fallback_used then
      raise exception using errcode = '22023', message = 'ai_opening_replay_mismatch';
    end if;
    select message.seq_no into next_message_seq
    from public.messages as message
    where message.session_id = existing_opening.session_id
      and message.id = existing_opening.message_id;
    return query select
      existing_opening.status,
      existing_opening.message_id,
      next_message_seq,
      existing_opening.suppression_reason,
      true,
      false;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_opening_attempt_stale';
  end if;
  if not p_fallback_used then
    select provider_run.* into provider_record
    from private.ai_provider_runs as provider_run
    where provider_run.job_id = target_job.id
      and provider_run.attempt_no = p_attempt_no
      and provider_run.task_alias = 'OPENING_V1'
      and provider_run.status = 'SUCCEEDED';
    if not found or provider_record.canonical_run is distinct from p_provider_run then
      raise exception using errcode = '55000', message = 'ai_opening_provider_run_required';
    end if;
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_opening_session_not_found';
  end if;
  select room.* into strict target_room
  from public.rooms as room
  where room.id = target_session.room_id;
  if p_output ->> 'packVersionId'
      is distinct from target_room.book_context_pack_version_id::text then
    raise exception using errcode = '22023', message = 'ai_opening_pack_mismatch';
  end if;
  if target_session.phase <> 'OPENING'
    or target_session.phase_version <> p_expected_phase_version
    or target_session.last_message_seq <> target_job.target_through_seq then
    insert into private.ai_openings (
      source_job_id, session_id, based_through_seq, schema_version,
      canonical_output, fallback_used, status, suppression_reason, created_at
    ) values (
      target_job.id, target_job.session_id, target_job.target_through_seq,
      'opening-output.v1', p_output, p_fallback_used, 'SUPPRESSED_STALE',
      case when target_session.phase <> 'OPENING'
        or target_session.phase_version <> p_expected_phase_version
        then 'OPENING_PHASE_CHANGED'
        else 'OPENING_CURSOR_ADVANCED'
      end,
      occurred_at
    );
    return query select
      'SUPPRESSED_STALE'::text,
      null::uuid,
      null::bigint,
      case when target_session.phase <> 'OPENING'
        or target_session.phase_version <> p_expected_phase_version
        then 'OPENING_PHASE_CHANGED'
        else 'OPENING_CURSOR_ADVANCED'
      end,
      false,
      false;
    return;
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
    id, session_id, seq_no, kind, ai_attribution, author_user_id,
    author_profile_name_snapshot, client_message_id, body,
    confirmed_at, created_at
  ) values (
    next_message_id, target_session.id, next_message_seq, 'AI_HOST', 'OPENING',
    null, 'AI Host', null, p_output ->> 'message', occurred_at, occurred_at
  );
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, occurred_at
  ) values (
    target_session.id, next_event_seq, next_aggregate_version,
    target_session.channel_epoch, 'MESSAGE_APPENDED',
    pg_catalog.jsonb_build_object(
      'message', pg_catalog.jsonb_build_object(
        'messageId', next_message_id,
        'sessionId', target_session.id,
        'seqNo', next_message_seq,
        'kind', 'AI_HOST',
        'aiAttribution', 'OPENING',
        'author', pg_catalog.jsonb_build_object(
          'userId', null,
          'profileName', 'AI Host'
        ),
        'clientMessageId', null,
        'body', p_output ->> 'message',
        'reply', 'null'::jsonb,
        'confirmedAt', occurred_at
      )
    ),
    occurred_at
  );
  insert into private.ai_openings (
    source_job_id, session_id, message_id, based_through_seq,
    schema_version, canonical_output, fallback_used, status,
    created_at, committed_at
  ) values (
    target_job.id, target_job.session_id, next_message_id,
    target_job.target_through_seq, 'opening-output.v1', p_output,
    p_fallback_used, 'COMMITTED', occurred_at, occurred_at
  );
  return query select
    'COMMITTED'::text,
    next_message_id,
    next_message_seq,
    null::text,
    false,
    false;
end;
$$;

create function private.commit_ai_host_intervention(
  p_job_id uuid,
  p_attempt_no integer,
  p_expected_phase text,
  p_expected_phase_version integer,
  p_policy_action_id uuid,
  p_policy jsonb,
  p_output jsonb,
  p_provider_run jsonb
)
returns table (
  commit_status text,
  message_id uuid,
  message_seq bigint,
  suppression_reason text,
  duplicate boolean,
  phase_transitioned boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  target_policy private.ai_policy_actions%rowtype;
  target_evaluation private.ai_evaluations%rowtype;
  existing_intervention private.ai_interventions%rowtype;
  provider_record private.ai_provider_runs%rowtype;
  next_message_id uuid;
  next_message_seq bigint;
  next_aggregate_version bigint;
  next_event_seq bigint;
  did_transition boolean := false;
  attribution text;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or p_expected_phase_version < 0
    or p_expected_phase not in ('OPENING', 'CORE', 'EXTENDED')
    or jsonb_typeof(p_policy) <> 'object'
    or jsonb_typeof(p_output) <> 'object'
    or jsonb_typeof(p_provider_run) <> 'object'
    or not private.public_jsonb_keys_allowed(p_policy)
    or not private.public_jsonb_keys_allowed(p_output)
    or p_output ->> 'schemaVersion'
      is distinct from 'host-intervention-output.v1'
    or p_output ->> 'message' is null
    or length(btrim(p_output ->> 'message')) not between 1 and 2000
    or jsonb_typeof(p_output -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_output -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'ai_host_output_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_host_job_not_found';
  end if;
  select policy.* into target_policy
  from private.ai_policy_actions as policy
  where policy.id = p_policy_action_id
    and policy.session_id = target_job.session_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_host_policy_not_found';
  end if;
  select evaluation.* into strict target_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.id = target_policy.evaluation_id
    and evaluation.session_id = target_job.session_id;

  if target_evaluation.job_id <> target_job.id
    or target_policy.action in ('WAIT', 'RECOMMEND_EXTENSION')
    or p_policy ->> 'schemaVersion' is distinct from 'policy-decision.v1'
    or p_policy ->> 'evaluationId' is distinct from target_policy.evaluation_id::text
    or p_policy ->> 'action' is distinct from target_policy.action
    or p_policy -> 'reasonCodes' is distinct from target_policy.reason_codes
    or p_policy -> 'supportingEvidenceRefs'
      is distinct from target_policy.supporting_evidence_refs
    or p_output ->> 'action' is distinct from target_policy.action
    or p_output ->> 'packVersionId'
      is distinct from target_evaluation.canonical_result ->> 'packVersionId'
    or p_output ->> 'basedThroughSeq'
      is distinct from target_evaluation.target_through_seq::text then
    raise exception using errcode = '22023', message = 'ai_host_policy_output_mismatch';
  end if;

  attribution := case when target_policy.trigger = 'HOST_HELP'
    then 'HOST_REQUESTED' else 'AUTOMATIC' end;
  if p_output ->> 'attribution' is distinct from attribution then
    raise exception using errcode = '22023', message = 'ai_host_attribution_mismatch';
  end if;

  select intervention.* into existing_intervention
  from private.ai_interventions as intervention
  where intervention.policy_action_id = target_policy.id;
  if found then
    if existing_intervention.canonical_output is distinct from p_output then
      raise exception using errcode = '22023', message = 'ai_host_replay_mismatch';
    end if;
    select message.seq_no into next_message_seq
    from public.messages as message
    where message.session_id = existing_intervention.session_id
      and message.id = existing_intervention.message_id;
    return query select
      case when existing_intervention.status = 'COMMITTED'
        then 'COMMITTED' else 'SUPPRESSED_STALE' end,
      existing_intervention.message_id,
      next_message_seq,
      existing_intervention.suppression_reason,
      true,
      existing_intervention.phase_transitioned;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_host_attempt_stale';
  end if;
  select provider_run.* into provider_record
  from private.ai_provider_runs as provider_run
  where provider_run.job_id = target_job.id
    and provider_run.attempt_no = p_attempt_no
    and provider_run.task_alias = 'HOST_INTERVENTION_V1'
    and provider_run.status = 'SUCCEEDED';
  if not found or provider_record.canonical_run is distinct from p_provider_run then
    raise exception using errcode = '55000', message = 'ai_host_provider_run_required';
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_host_session_not_found';
  end if;
  select room.* into strict target_room
  from public.rooms as room
  where room.id = target_session.room_id;
  if p_output ->> 'packVersionId'
      is distinct from target_room.book_context_pack_version_id::text then
    raise exception using errcode = '22023', message = 'ai_host_pack_mismatch';
  end if;
  if target_session.phase <> p_expected_phase
    or target_session.phase_version <> p_expected_phase_version
    or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
    or target_session.last_message_seq <> target_evaluation.target_through_seq then
    insert into private.ai_interventions (
      policy_action_id, session_id, based_through_seq, schema_version,
      canonical_output, status, suppression_reason, phase_transitioned, created_at
    ) values (
      target_policy.id, target_job.session_id,
      target_evaluation.target_through_seq, 'host-intervention-output.v1',
      p_output, 'SUPPRESSED_STALE',
      case when target_session.phase <> p_expected_phase
        or target_session.phase_version <> p_expected_phase_version
        or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
        then 'HOST_PHASE_CHANGED'
        else 'HOST_CURSOR_ADVANCED'
      end,
      false,
      occurred_at
    );
    return query select
      'SUPPRESSED_STALE'::text,
      null::uuid,
      null::bigint,
      case when target_session.phase <> p_expected_phase
        or target_session.phase_version <> p_expected_phase_version
        or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
        then 'HOST_PHASE_CHANGED'
        else 'HOST_CURSOR_ADVANCED'
      end,
      false,
      false;
    return;
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
    id, session_id, seq_no, kind, ai_attribution, author_user_id,
    author_profile_name_snapshot, client_message_id, body,
    confirmed_at, created_at
  ) values (
    next_message_id, target_session.id, next_message_seq, 'AI_HOST', attribution,
    null, 'AI Host', null, p_output ->> 'message', occurred_at, occurred_at
  );
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, occurred_at
  ) values (
    target_session.id, next_event_seq, next_aggregate_version,
    target_session.channel_epoch, 'MESSAGE_APPENDED',
    pg_catalog.jsonb_build_object(
      'message', pg_catalog.jsonb_build_object(
        'messageId', next_message_id,
        'sessionId', target_session.id,
        'seqNo', next_message_seq,
        'kind', 'AI_HOST',
        'aiAttribution', attribution,
        'author', pg_catalog.jsonb_build_object(
          'userId', null,
          'profileName', 'AI Host'
        ),
        'clientMessageId', null,
        'body', p_output ->> 'message',
        'reply', 'null'::jsonb,
        'confirmedAt', occurred_at
      )
    ),
    occurred_at
  );

  if target_session.phase = 'OPENING'
    and target_policy.action = 'TRANSITION' then
    update public.session_runs as session
    set phase = 'CORE',
        phase_version = session.phase_version + 1,
        aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        updated_at = occurred_at
    where session.id = target_session.id
    returning session.* into target_session;
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload, occurred_at
    ) values (
      target_session.id, target_session.last_event_seq,
      target_session.aggregate_version, target_session.channel_epoch,
      'SESSION_STATE_CHANGED',
      pg_catalog.jsonb_build_object(
        'state', private.session_state_public_json(target_session),
        'reason', 'OPENING_COMPLETED_BY_AI'
      ),
      occurred_at
    );
    did_transition := true;
  end if;

  insert into private.ai_interventions (
    policy_action_id, session_id, message_id, based_through_seq,
    schema_version, canonical_output, status, phase_transitioned,
    created_at, committed_at
  ) values (
    target_policy.id, target_job.session_id, next_message_id,
    target_evaluation.target_through_seq, 'host-intervention-output.v1',
    p_output, 'COMMITTED', did_transition, occurred_at, occurred_at
  );
  return query select
    'COMMITTED'::text,
    next_message_id,
    next_message_seq,
    null::text,
    false,
    did_transition;
end;
$$;

create function private.fail_ai_host_intervention(
  p_job_id uuid,
  p_attempt_no integer,
  p_policy_action_id uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_policy private.ai_policy_actions%rowtype;
  target_evaluation private.ai_evaluations%rowtype;
  existing_intervention private.ai_interventions%rowtype;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or p_error_code is null
    or length(p_error_code) not between 1 and 100
    or p_error_code !~ '^[A-Z][A-Z0-9_]*$' then
    raise exception using errcode = '22023', message = 'ai_host_failure_invalid';
  end if;
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_host_attempt_stale';
  end if;
  select policy.* into target_policy
  from private.ai_policy_actions as policy
  where policy.id = p_policy_action_id
    and policy.session_id = target_job.session_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_host_policy_not_found';
  end if;
  select evaluation.* into strict target_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.id = target_policy.evaluation_id
    and evaluation.session_id = target_job.session_id;
  if target_evaluation.job_id <> target_job.id
    or target_policy.action in ('WAIT', 'RECOMMEND_EXTENSION') then
    raise exception using errcode = '22023', message = 'ai_host_failure_policy_mismatch';
  end if;

  select intervention.* into existing_intervention
  from private.ai_interventions as intervention
  where intervention.policy_action_id = target_policy.id;
  if found then
    if existing_intervention.status = 'FAILED'
      and existing_intervention.suppression_reason = p_error_code then
      return true;
    end if;
    return false;
  end if;

  insert into private.ai_interventions (
    policy_action_id, session_id, based_through_seq, schema_version,
    canonical_output, status, suppression_reason, phase_transitioned, created_at
  ) values (
    target_policy.id, target_job.session_id, target_evaluation.target_through_seq,
    'host-intervention-output.v1', null, 'FAILED', p_error_code, false,
    occurred_at
  );
  return true;
end;
$$;

revoke all on function private.record_ai_provider_run(
  uuid, integer, text, text, text, text, text, text, text,
  text, integer, jsonb, text
) from public, anon, authenticated;
revoke all on function private.commit_ai_opening(
  uuid, integer, integer, jsonb, jsonb, boolean
) from public, anon, authenticated;
revoke all on function private.commit_ai_host_intervention(
  uuid, integer, text, integer, uuid, jsonb, jsonb, jsonb
) from public, anon, authenticated;
revoke all on function private.fail_ai_host_intervention(
  uuid, integer, uuid, text
) from public, anon, authenticated;

grant execute on function private.record_ai_provider_run(
  uuid, integer, text, text, text, text, text, text, text,
  text, integer, jsonb, text
) to bookseasoning_ai_worker;
grant execute on function private.commit_ai_opening(
  uuid, integer, integer, jsonb, jsonb, boolean
) to bookseasoning_ai_worker;
grant execute on function private.commit_ai_host_intervention(
  uuid, integer, text, integer, uuid, jsonb, jsonb, jsonb
) to bookseasoning_ai_worker;
grant execute on function private.fail_ai_host_intervention(
  uuid, integer, uuid, text
) to bookseasoning_ai_worker;

comment on table private.ai_provider_runs is
  'Content-free provider diagnostics: task/model/prompt/schema/latency/usage only.';
comment on table private.ai_openings is
  'Immutable Opening output and deterministic fallback result with one public effect per job.';
comment on function private.commit_ai_host_intervention(
  uuid, integer, text, integer, uuid, jsonb, jsonb, jsonb
) is
  'Atomically rechecks Host freshness, appends one AI message, and records stale suppression; an Opening TRANSITION also advances the session to CORE.';
