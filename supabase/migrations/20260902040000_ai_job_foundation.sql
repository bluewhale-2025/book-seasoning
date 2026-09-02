create extension if not exists pgmq;

select pgmq.create('ai-session')
where not exists (
  select 1 from pgmq.list_queues() as queue where queue.queue_name = 'ai-session'
);
select pgmq.create('ai-record')
where not exists (
  select 1 from pgmq.list_queues() as queue where queue.queue_name = 'ai-record'
);
select pgmq.create('book-builder')
where not exists (
  select 1 from pgmq.list_queues() as queue where queue.queue_name = 'book-builder'
);

revoke all on schema pgmq from public, anon, authenticated;
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all functions in schema pgmq from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'bookseasoning_ai_worker'
  ) then
    create role bookseasoning_ai_worker nologin;
  end if;
end;
$$;

grant usage on schema private to bookseasoning_ai_worker;

create table private.ai_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null unique
    check (
      length(job_key) between 1 and 300
      and job_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]*$'
    ),
  queue_name text not null check (queue_name = 'ai-session'),
  queue_message_id bigint unique,
  job_type text not null check (
    job_type in (
      'OPENING',
      'PUBLIC_EVALUATION',
      'TOPIC_CHECKPOINT',
      'HOST_HELP',
      'EXTENSION_RECOMMENDATION'
    )
  ),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  base_wiki_version integer not null check (base_wiki_version >= 0),
  target_through_seq bigint not null check (target_through_seq >= 0),
  task_schema_version text not null
    check (
      length(task_schema_version) between 1 and 100
      and task_schema_version ~ '^[a-z0-9][a-z0-9._-]*$'
    ),
  status text not null default 'PENDING' check (
    status in (
      'PENDING', 'PROCESSING', 'RETRY_SCHEDULED',
      'SUCCEEDED', 'SUPPRESSED', 'FAILED'
    )
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  last_error_code text check (
    last_error_code is null
    or (
      length(last_error_code) between 1 and 100
      and last_error_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  suppression_reason text check (
    suppression_reason is null
    or (
      length(suppression_reason) between 1 and 100
      and suppression_reason ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  request_id text check (request_id is null or length(request_id) between 1 and 100),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint ai_job_runs_session_id_unique unique (session_id, id),
  constraint ai_job_runs_completion_check check (
    (status in ('SUCCEEDED', 'SUPPRESSED', 'FAILED') and completed_at is not null)
    or (status not in ('SUCCEEDED', 'SUPPRESSED', 'FAILED') and completed_at is null)
  ),
  constraint ai_job_runs_lease_check check (
    (status = 'PROCESSING' and lease_expires_at is not null)
    or (status <> 'PROCESSING' and lease_expires_at is null)
  ),
  constraint ai_job_runs_retry_check check (
    (status = 'RETRY_SCHEDULED' and next_attempt_at is not null)
    or (status <> 'RETRY_SCHEDULED' and next_attempt_at is null)
  ),
  constraint ai_job_runs_time_order_check check (
    updated_at >= created_at
    and (started_at is null or started_at >= created_at)
    and (completed_at is null or started_at is not null)
  )
);

create index ai_job_runs_session_created_idx
on private.ai_job_runs (session_id, created_at desc);

create index ai_job_runs_active_idx
on private.ai_job_runs (status, next_attempt_at, created_at)
where status in ('PENDING', 'PROCESSING', 'RETRY_SCHEDULED');

create table private.ai_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references private.ai_job_runs(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  queue_read_count integer not null check (queue_read_count > 0),
  outcome text check (
    outcome is null
    or outcome in (
      'SUCCEEDED', 'SUPPRESSED', 'RETRYABLE_FAILURE', 'TERMINAL_FAILURE'
    )
  ),
  error_code text check (
    error_code is null
    or (
      length(error_code) between 1 and 100
      and error_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  lease_expires_at timestamptz not null,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  constraint ai_job_attempts_number_unique unique (job_id, attempt_no),
  constraint ai_job_attempts_finish_check check (
    (outcome is null and finished_at is null)
    or (outcome is not null and finished_at is not null)
  ),
  constraint ai_job_attempts_time_order_check check (
    finished_at is null or finished_at >= started_at
  )
);

create table private.living_wiki_versions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  version integer not null check (version > 0),
  kind text not null check (kind in ('INCREMENTAL', 'TOPIC_CHECKPOINT', 'FINAL')),
  base_version integer,
  based_through_seq bigint not null check (based_through_seq >= 0),
  schema_version text not null check (schema_version = 'living-wiki.v1'),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  source_job_id uuid not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  constraint living_wiki_versions_session_version_unique unique (session_id, version),
  constraint living_wiki_versions_session_id_unique unique (session_id, id),
  constraint living_wiki_versions_base_shape_check check (
    (version = 1 and base_version is null)
    or (version > 1 and base_version is not null and base_version < version)
  ),
  constraint living_wiki_versions_same_session_base_fk
    foreign key (session_id, base_version)
    references private.living_wiki_versions(session_id, version)
    on delete restrict,
  constraint living_wiki_versions_source_job_same_session_fk
    foreign key (session_id, source_job_id)
    references private.ai_job_runs(session_id, id)
    on delete restrict
);

create unique index living_wiki_versions_one_final_per_session_idx
on private.living_wiki_versions (session_id)
where kind = 'FINAL';

create index living_wiki_versions_latest_idx
on private.living_wiki_versions (session_id, version desc);

create table private.ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  base_wiki_version integer not null check (base_wiki_version >= 0),
  committed_wiki_version integer,
  target_through_seq bigint not null check (target_through_seq >= 0),
  schema_version text not null check (schema_version = 'public-evaluator-output.v1'),
  canonical_result jsonb not null check (jsonb_typeof(canonical_result) = 'object'),
  commit_status text not null check (
    commit_status in ('COMMITTED', 'PATCH_REJECTED', 'SUPPRESSED_STALE_BASE')
  ),
  validation_code text check (
    validation_code is null
    or (
      length(validation_code) between 1 and 100
      and validation_code ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  constraint ai_evaluations_session_id_unique unique (session_id, id),
  constraint ai_evaluations_committed_shape_check check (
    (commit_status = 'COMMITTED' and committed_wiki_version is not null)
    or (commit_status <> 'COMMITTED' and committed_wiki_version is null)
  ),
  constraint ai_evaluations_committed_wiki_fk
    foreign key (session_id, committed_wiki_version)
    references private.living_wiki_versions(session_id, version)
    on delete restrict,
  constraint ai_evaluations_job_same_session_fk
    foreign key (session_id, job_id)
    references private.ai_job_runs(session_id, id)
    on delete restrict
);

create index ai_evaluations_session_cursor_idx
on private.ai_evaluations (session_id, target_through_seq desc);

create table private.ai_policy_actions (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  action text not null check (
    action in (
      'WAIT', 'DEEPEN', 'EXPAND', 'RECONNECT', 'RECONNECT_TO_BOOK',
      'RECONNECT_AND_REFLECT', 'INVITE', 'REVIVE', 'SUMMARIZE',
      'TRANSITION', 'RECOMMEND_EXTENSION'
    )
  ),
  reason_codes jsonb not null check (jsonb_typeof(reason_codes) = 'array'),
  supporting_evidence_refs jsonb not null
    check (jsonb_typeof(supporting_evidence_refs) = 'array'),
  schema_version text not null check (schema_version = 'policy-decision.v1'),
  created_at timestamptz not null default timezone('utc', now()),
  constraint ai_policy_actions_session_id_unique unique (session_id, id),
  constraint ai_policy_actions_evaluation_same_session_fk
    foreign key (session_id, evaluation_id)
    references private.ai_evaluations(session_id, id)
    on delete restrict
);

create index ai_policy_actions_session_created_idx
on private.ai_policy_actions (session_id, created_at desc);

create table private.ai_interventions (
  id uuid primary key default gen_random_uuid(),
  policy_action_id uuid not null unique,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  message_id uuid,
  based_through_seq bigint not null check (based_through_seq >= 0),
  schema_version text not null check (schema_version = 'host-intervention-output.v1'),
  canonical_output jsonb check (
    canonical_output is null or jsonb_typeof(canonical_output) = 'object'
  ),
  status text not null check (
    status in ('PENDING', 'COMMITTED', 'SUPPRESSED_STALE', 'FAILED')
  ),
  suppression_reason text check (
    suppression_reason is null
    or (
      length(suppression_reason) between 1 and 100
      and suppression_reason ~ '^[A-Z][A-Z0-9_]*$'
    )
  ),
  created_at timestamptz not null default timezone('utc', now()),
  committed_at timestamptz,
  constraint ai_interventions_message_same_session_fk
    foreign key (session_id, message_id)
    references public.messages(session_id, id)
    on delete restrict,
  constraint ai_interventions_policy_action_same_session_fk
    foreign key (session_id, policy_action_id)
    references private.ai_policy_actions(session_id, id)
    on delete restrict,
  constraint ai_interventions_commit_shape_check check (
    (status = 'COMMITTED' and message_id is not null and committed_at is not null)
    or (status <> 'COMMITTED' and message_id is null and committed_at is null)
  )
);

revoke all on table private.ai_job_runs from public, anon, authenticated;
revoke all on table private.ai_job_attempts from public, anon, authenticated;
revoke all on table private.living_wiki_versions from public, anon, authenticated;
revoke all on table private.ai_evaluations from public, anon, authenticated;
revoke all on table private.ai_policy_actions from public, anon, authenticated;
revoke all on table private.ai_interventions from public, anon, authenticated;

create function private.reject_immutable_ai_fact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'immutable_ai_fact';
end;
$$;

revoke all on function private.reject_immutable_ai_fact_mutation()
from public, anon, authenticated;

create trigger living_wiki_versions_immutable
before update or delete on private.living_wiki_versions
for each row execute function private.reject_immutable_ai_fact_mutation();

create trigger ai_evaluations_immutable
before update or delete on private.ai_evaluations
for each row execute function private.reject_immutable_ai_fact_mutation();

create trigger ai_policy_actions_immutable
before update or delete on private.ai_policy_actions
for each row execute function private.reject_immutable_ai_fact_mutation();

create function private.enqueue_ai_session_job(
  p_job_key text,
  p_job_type text,
  p_session_id uuid,
  p_base_wiki_version integer,
  p_target_through_seq bigint,
  p_task_schema_version text,
  p_request_id text default null,
  p_max_attempts integer default 3
)
returns table (
  job_id uuid,
  queue_message_id bigint,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_job private.ai_job_runs%rowtype;
  inserted_job private.ai_job_runs%rowtype;
  sent_message_id bigint;
begin
  if p_job_key is null
    or length(p_job_key) not between 1 and 300
    or p_job_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]*$' then
    raise exception using errcode = '22023', message = 'ai_job_key_invalid';
  end if;
  if p_job_type not in (
    'OPENING', 'PUBLIC_EVALUATION', 'TOPIC_CHECKPOINT',
    'HOST_HELP', 'EXTENSION_RECOMMENDATION'
  ) then
    raise exception using errcode = '22023', message = 'ai_job_type_invalid';
  end if;
  if p_base_wiki_version < 0 or p_target_through_seq < 0 then
    raise exception using errcode = '22023', message = 'ai_job_cursor_invalid';
  end if;
  if p_max_attempts not between 1 and 10 then
    raise exception using errcode = '22023', message = 'ai_job_attempt_limit_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai-session:' || p_job_key, 0)
  );

  select job.* into existing_job
  from private.ai_job_runs as job
  where job.job_key = p_job_key;

  if existing_job.id is not null then
    return query select existing_job.id, existing_job.queue_message_id, true;
    return;
  end if;

  insert into private.ai_job_runs (
    job_key, queue_name, job_type, session_id, base_wiki_version,
    target_through_seq, task_schema_version, request_id, max_attempts
  ) values (
    p_job_key, 'ai-session', p_job_type, p_session_id, p_base_wiki_version,
    p_target_through_seq, p_task_schema_version, p_request_id, p_max_attempts
  ) returning * into inserted_job;

  select message_id into sent_message_id
  from pgmq.send(
    'ai-session',
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'ai-job.v1',
      'jobId', inserted_job.id,
      'jobType', inserted_job.job_type,
      'sessionId', inserted_job.session_id,
      'baseWikiVersion', inserted_job.base_wiki_version,
      'targetThroughSeq', inserted_job.target_through_seq,
      'taskSchemaVersion', inserted_job.task_schema_version
    )
  ) as sent(message_id);

  update private.ai_job_runs as job
  set queue_message_id = sent_message_id,
      updated_at = timezone('utc', now())
  where job.id = inserted_job.id;

  return query select inserted_job.id, sent_message_id, false;
end;
$$;

create function private.read_ai_session_queue(
  p_visibility_timeout_seconds integer default 30,
  p_quantity integer default 2,
  p_max_poll_seconds integer default 2
)
returns table (
  queue_message_id bigint,
  queue_read_count integer,
  enqueued_at timestamptz,
  lease_expires_at timestamptz,
  message jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visibility_timeout_seconds not between 5 and 3600
    or p_quantity not between 1 and 10
    or p_max_poll_seconds not between 0 and 5 then
    raise exception using errcode = '22023', message = 'ai_queue_read_options_invalid';
  end if;

  return query
  select
    queued.msg_id,
    queued.read_ct,
    queued.enqueued_at,
    queued.vt,
    queued.message
  from pgmq.read_with_poll(
    'ai-session',
    p_visibility_timeout_seconds,
    p_quantity,
    p_max_poll_seconds,
    100,
    '{}'::jsonb
  ) as queued;
end;
$$;

create function private.claim_ai_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_queue_read_count integer,
  p_lease_expires_at timestamptz
)
returns table (
  claim_state text,
  job_id uuid,
  job_type text,
  session_id uuid,
  base_wiki_version integer,
  target_through_seq bigint,
  task_schema_version text,
  attempt_no integer,
  max_attempts integer,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  occurred_at timestamptz := timezone('utc', now());
  next_attempt integer;
begin
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;

  if target_job.id is null
    or target_job.queue_name <> 'ai-session'
    or target_job.queue_message_id <> p_queue_message_id then
    return query select
      'POISON'::text, null::uuid, null::text, null::uuid, null::integer,
      null::bigint, null::text, null::integer, null::integer, null::timestamptz;
    return;
  end if;

  if target_job.status in ('SUCCEEDED', 'SUPPRESSED', 'FAILED') then
    return query select
      'TERMINAL_DUPLICATE'::text, target_job.id, target_job.job_type,
      target_job.session_id, target_job.base_wiki_version,
      target_job.target_through_seq, target_job.task_schema_version,
      target_job.attempt_count, target_job.max_attempts, target_job.lease_expires_at;
    return;
  end if;

  if target_job.status = 'PROCESSING'
    and target_job.lease_expires_at > occurred_at then
    return query select
      'LEASE_CONFLICT'::text, target_job.id, target_job.job_type,
      target_job.session_id, target_job.base_wiki_version,
      target_job.target_through_seq, target_job.task_schema_version,
      target_job.attempt_count, target_job.max_attempts, target_job.lease_expires_at;
    return;
  end if;

  if target_job.attempt_count >= target_job.max_attempts then
    update private.ai_job_runs as job
    set status = 'FAILED',
        lease_expires_at = null,
        next_attempt_at = null,
        last_error_code = 'ATTEMPTS_EXHAUSTED',
        completed_at = occurred_at,
        updated_at = occurred_at
    where job.id = target_job.id;

    return query select
      'EXHAUSTED'::text, target_job.id, target_job.job_type,
      target_job.session_id, target_job.base_wiki_version,
      target_job.target_through_seq, target_job.task_schema_version,
      target_job.attempt_count, target_job.max_attempts, null::timestamptz;
    return;
  end if;

  next_attempt := target_job.attempt_count + 1;

  update private.ai_job_runs as job
  set status = 'PROCESSING',
      attempt_count = next_attempt,
      lease_expires_at = p_lease_expires_at,
      next_attempt_at = null,
      last_error_code = null,
      suppression_reason = null,
      started_at = coalesce(job.started_at, occurred_at),
      updated_at = occurred_at
  where job.id = target_job.id;

  insert into private.ai_job_attempts (
    job_id, attempt_no, queue_read_count, lease_expires_at, started_at
  ) values (
    target_job.id, next_attempt, p_queue_read_count,
    p_lease_expires_at, occurred_at
  );

  return query select
    'CLAIMED'::text, target_job.id, target_job.job_type,
    target_job.session_id, target_job.base_wiki_version,
    target_job.target_through_seq, target_job.task_schema_version,
    next_attempt, target_job.max_attempts, p_lease_expires_at;
end;
$$;

create function private.complete_ai_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_attempt_no integer,
  p_outcome text,
  p_result_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_outcome not in ('SUCCEEDED', 'SUPPRESSED', 'TERMINAL_FAILURE') then
    raise exception using errcode = '22023', message = 'ai_job_outcome_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;

  if target_job.id is null
    or target_job.queue_message_id <> p_queue_message_id
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no then
    return false;
  end if;

  update private.ai_job_attempts as attempt
  set outcome = p_outcome,
      error_code = case when p_outcome = 'TERMINAL_FAILURE'
        then coalesce(p_result_code, 'TERMINAL_FAILURE') else null end,
      finished_at = occurred_at
  where attempt.job_id = target_job.id
    and attempt.attempt_no = p_attempt_no
    and attempt.outcome is null;

  update private.ai_job_runs as job
  set status = case p_outcome
        when 'SUCCEEDED' then 'SUCCEEDED'
        when 'SUPPRESSED' then 'SUPPRESSED'
        else 'FAILED'
      end,
      lease_expires_at = null,
      next_attempt_at = null,
      last_error_code = case when p_outcome = 'TERMINAL_FAILURE'
        then coalesce(p_result_code, 'TERMINAL_FAILURE') else null end,
      suppression_reason = case when p_outcome = 'SUPPRESSED'
        then coalesce(p_result_code, 'SUPPRESSED_BY_HANDLER') else null end,
      completed_at = occurred_at,
      updated_at = occurred_at
  where job.id = target_job.id;

  perform pgmq.archive('ai-session', p_queue_message_id);
  return true;
end;
$$;

create function private.retry_ai_job(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_attempt_no integer,
  p_error_code text,
  p_delay_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_delay_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'ai_job_retry_delay_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;

  if target_job.id is null
    or target_job.queue_message_id <> p_queue_message_id
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no then
    return false;
  end if;

  if target_job.attempt_count >= target_job.max_attempts then
    update private.ai_job_attempts as attempt
    set outcome = 'TERMINAL_FAILURE',
        error_code = 'ATTEMPTS_EXHAUSTED',
        finished_at = occurred_at
    where attempt.job_id = target_job.id
      and attempt.attempt_no = p_attempt_no
      and attempt.outcome is null;

    update private.ai_job_runs as job
    set status = 'FAILED',
        lease_expires_at = null,
        next_attempt_at = null,
        last_error_code = 'ATTEMPTS_EXHAUSTED',
        completed_at = occurred_at,
        updated_at = occurred_at
    where job.id = target_job.id;

    perform pgmq.archive('ai-session', p_queue_message_id);
    return true;
  end if;

  update private.ai_job_attempts as attempt
  set outcome = 'RETRYABLE_FAILURE',
      error_code = p_error_code,
      finished_at = occurred_at
  where attempt.job_id = target_job.id
    and attempt.attempt_no = p_attempt_no
    and attempt.outcome is null;

  perform pgmq.set_vt('ai-session', p_queue_message_id, p_delay_seconds);

  update private.ai_job_runs as job
  set status = 'RETRY_SCHEDULED',
      lease_expires_at = null,
      next_attempt_at = occurred_at + pg_catalog.make_interval(secs => p_delay_seconds),
      last_error_code = p_error_code,
      updated_at = occurred_at
  where job.id = target_job.id;

  return true;
end;
$$;

create function private.extend_ai_job_lease(
  p_job_id uuid,
  p_queue_message_id bigint,
  p_attempt_no integer,
  p_visibility_timeout_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  next_expiry timestamptz;
begin
  if p_visibility_timeout_seconds not between 5 and 3600 then
    raise exception using errcode = '22023', message = 'ai_job_lease_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;

  if target_job.id is null
    or target_job.queue_message_id <> p_queue_message_id
    or target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no then
    return false;
  end if;

  next_expiry := timezone('utc', now())
    + pg_catalog.make_interval(secs => p_visibility_timeout_seconds);
  perform pgmq.set_vt(
    'ai-session', p_queue_message_id, p_visibility_timeout_seconds
  );

  update private.ai_job_runs as job
  set lease_expires_at = next_expiry,
      updated_at = timezone('utc', now())
  where job.id = target_job.id;

  update private.ai_job_attempts as attempt
  set lease_expires_at = next_expiry
  where attempt.job_id = target_job.id
    and attempt.attempt_no = p_attempt_no
    and attempt.outcome is null;

  return true;
end;
$$;

create function private.archive_ai_session_message(p_queue_message_id bigint)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select pgmq.archive('ai-session', p_queue_message_id);
$$;

revoke all on function private.enqueue_ai_session_job(
  text, text, uuid, integer, bigint, text, text, integer
) from public, anon, authenticated;
revoke all on function private.read_ai_session_queue(integer, integer, integer)
from public, anon, authenticated;
revoke all on function private.claim_ai_job(uuid, bigint, integer, timestamptz)
from public, anon, authenticated;
revoke all on function private.complete_ai_job(uuid, bigint, integer, text, text)
from public, anon, authenticated;
revoke all on function private.retry_ai_job(uuid, bigint, integer, text, integer)
from public, anon, authenticated;
revoke all on function private.extend_ai_job_lease(uuid, bigint, integer, integer)
from public, anon, authenticated;
revoke all on function private.archive_ai_session_message(bigint)
from public, anon, authenticated;

grant execute on function private.enqueue_ai_session_job(
  text, text, uuid, integer, bigint, text, text, integer
) to bookseasoning_ai_worker;
grant execute on function private.read_ai_session_queue(integer, integer, integer)
to bookseasoning_ai_worker;
grant execute on function private.claim_ai_job(uuid, bigint, integer, timestamptz)
to bookseasoning_ai_worker;
grant execute on function private.complete_ai_job(uuid, bigint, integer, text, text)
to bookseasoning_ai_worker;
grant execute on function private.retry_ai_job(uuid, bigint, integer, text, integer)
to bookseasoning_ai_worker;
grant execute on function private.extend_ai_job_lease(uuid, bigint, integer, integer)
to bookseasoning_ai_worker;
grant execute on function private.archive_ai_session_message(bigint)
to bookseasoning_ai_worker;

comment on table private.ai_job_runs is
  'Durable reference-only AI task identity, freshness coordinates and terminal state.';
comment on table private.ai_job_attempts is
  'Content-free attempt history for retry, lease and operational diagnostics.';
comment on table private.living_wiki_versions is
  'Session-scoped evidence-linked Wiki versions; application validation owns the canonical document schema.';
comment on function private.enqueue_ai_session_job(
  text, text, uuid, integer, bigint, text, text, integer
) is
  'Atomically creates an idempotent job run and its reference-only ai-session queue message.';
