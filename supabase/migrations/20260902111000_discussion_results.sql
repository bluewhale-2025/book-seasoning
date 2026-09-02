alter table public.messages
drop constraint messages_ai_attribution_check;
alter table public.messages
add constraint messages_ai_attribution_check check (
  ai_attribution is null
  or ai_attribution in ('OPENING', 'AUTOMATIC', 'HOST_REQUESTED', 'SYNTHESIS')
);

alter table private.ai_job_runs
drop constraint ai_job_runs_queue_name_check;
alter table private.ai_job_runs
drop constraint ai_job_runs_job_type_check;
alter table private.ai_job_runs
add constraint ai_job_runs_queue_name_check check (
  queue_name in ('ai-session', 'ai-record')
);
alter table private.ai_job_runs
add constraint ai_job_runs_job_type_check check (
  job_type in (
    'OPENING', 'PUBLIC_EVALUATION', 'TOPIC_CHECKPOINT',
    'HOST_HELP', 'EXTENSION_RECOMMENDATION',
    'SYNTHESIS', 'FINAL_WIKI', 'DISCUSSION_RECORD'
  )
);
alter table private.ai_job_runs
add constraint ai_job_runs_queue_type_check check (
  (queue_name = 'ai-session' and job_type in (
    'OPENING', 'PUBLIC_EVALUATION', 'TOPIC_CHECKPOINT',
    'HOST_HELP', 'EXTENSION_RECOMMENDATION'
  ))
  or (queue_name = 'ai-record' and job_type in (
    'SYNTHESIS', 'FINAL_WIKI', 'DISCUSSION_RECORD'
  ))
);

alter table private.ai_provider_runs
drop constraint ai_provider_runs_task_alias_check;
alter table private.ai_provider_runs
add constraint ai_provider_runs_task_alias_check check (
  task_alias in (
    'PUBLIC_EVALUATOR_INCREMENTAL_V1',
    'PUBLIC_EVALUATOR_TOPIC_CHECKPOINT_V1',
    'PUBLIC_EVALUATOR_FINAL_V1',
    'OPENING_V1',
    'HOST_INTERVENTION_V1',
    'SYNTHESIS_V1',
    'DISCUSSION_RECORD_V1'
  )
);

create table private.ai_syntheses (
  id uuid primary key default extensions.gen_random_uuid(),
  source_job_id uuid not null unique references private.ai_job_runs(id) on delete restrict,
  session_id uuid not null references public.session_runs(id) on delete restrict,
  message_id uuid,
  based_through_seq bigint not null check (based_through_seq >= 0),
  schema_version text not null check (schema_version = 'synthesis-output.v1'),
  canonical_output jsonb not null check (
    jsonb_typeof(canonical_output) = 'object'
    and private.public_jsonb_keys_allowed(canonical_output)
  ),
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
  constraint ai_syntheses_message_fk foreign key (session_id, message_id)
    references public.messages(session_id, id) on delete restrict,
  constraint ai_syntheses_shape_check check (
    (status = 'COMMITTED' and message_id is not null
      and committed_at is not null and suppression_reason is null)
    or (status = 'SUPPRESSED_STALE' and message_id is null
      and committed_at is null and suppression_reason is not null)
  )
);

create table private.discussion_results (
  session_id uuid primary key references public.session_runs(id) on delete restrict,
  final_wiki_version integer,
  current_job_id uuid not null references private.ai_job_runs(id) on delete restrict,
  generation_no integer not null default 1 check (generation_no > 0),
  status text not null check (status in ('PENDING', 'READY', 'FAILED', 'INSUFFICIENT')),
  schema_version text check (
    schema_version is null or schema_version = 'discussion-record.v1'
  ),
  canonical_record jsonb check (
    canonical_record is null
    or (
      jsonb_typeof(canonical_record) = 'object'
      and private.public_jsonb_keys_allowed(canonical_record)
    )
  ),
  ready_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint discussion_results_final_wiki_fk
    foreign key (session_id, final_wiki_version)
    references private.living_wiki_versions(session_id, version)
    on delete restrict,
  constraint discussion_results_shape_check check (
    (status = 'READY' and final_wiki_version is not null
      and schema_version = 'discussion-record.v1'
      and canonical_record is not null and ready_at is not null)
    or (status = 'INSUFFICIENT' and final_wiki_version is not null
      and schema_version is null and canonical_record is null and ready_at is not null)
    or (status in ('PENDING', 'FAILED') and schema_version is null
      and canonical_record is null and ready_at is null)
  ),
  constraint discussion_results_time_order_check check (
    updated_at >= created_at and (ready_at is null or ready_at >= created_at)
  )
);

create table private.discussion_result_command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  request_fingerprint text not null check (length(btrim(request_fingerprint)) > 0),
  session_id uuid not null references public.session_runs(id) on delete restrict,
  job_id uuid not null references private.ai_job_runs(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (actor_user_id, command_id)
);

revoke all on table private.ai_syntheses
from public, anon, authenticated, bookseasoning_ai_worker;
revoke all on table private.discussion_results
from public, anon, authenticated, bookseasoning_ai_worker;
revoke all on table private.discussion_result_command_receipts
from public, anon, authenticated, bookseasoning_ai_worker;

create trigger ai_syntheses_immutable
before update or delete on private.ai_syntheses
for each row execute function private.reject_immutable_ai_fact_mutation();

create function private.protect_ready_discussion_result()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'READY'
    and coalesce(
      current_setting('bookseasoning.allow_result_redaction', true),
      'off'
    ) <> 'on' then
    raise exception using errcode = '55000', message = 'discussion_result_immutable';
  end if;
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'discussion_result_delete_forbidden';
  end if;
  return new;
end;
$$;

create trigger discussion_results_protect_ready
before update or delete on private.discussion_results
for each row execute function private.protect_ready_discussion_result();

create or replace function private.enqueue_ai_session_job(
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
  target_queue text;
  sent_message_id bigint;
begin
  if p_job_key is null
    or length(p_job_key) not between 1 and 300
    or p_job_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]*$' then
    raise exception using errcode = '22023', message = 'ai_job_key_invalid';
  end if;
  if p_job_type not in (
    'OPENING', 'PUBLIC_EVALUATION', 'TOPIC_CHECKPOINT',
    'HOST_HELP', 'EXTENSION_RECOMMENDATION',
    'SYNTHESIS', 'FINAL_WIKI', 'DISCUSSION_RECORD'
  ) then
    raise exception using errcode = '22023', message = 'ai_job_type_invalid';
  end if;
  if p_base_wiki_version < 0 or p_target_through_seq < 0 then
    raise exception using errcode = '22023', message = 'ai_job_cursor_invalid';
  end if;
  if p_max_attempts not between 1 and 10 then
    raise exception using errcode = '22023', message = 'ai_job_attempt_limit_invalid';
  end if;
  target_queue := case
    when p_job_type in ('SYNTHESIS', 'FINAL_WIKI', 'DISCUSSION_RECORD')
      then 'ai-record'
    else 'ai-session'
  end;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_queue || ':' || p_job_key, 0)
  );
  select job.* into existing_job
  from private.ai_job_runs as job
  where job.job_key = p_job_key;
  if found then
    if existing_job.job_type <> p_job_type
      or existing_job.session_id <> p_session_id
      or existing_job.base_wiki_version <> p_base_wiki_version
      or existing_job.target_through_seq <> p_target_through_seq
      or existing_job.task_schema_version <> p_task_schema_version then
      raise exception using errcode = '22023', message = 'ai_job_replay_mismatch';
    end if;
    return query select existing_job.id, existing_job.queue_message_id, true;
    return;
  end if;

  insert into private.ai_job_runs (
    job_key, queue_name, job_type, session_id, base_wiki_version,
    target_through_seq, task_schema_version, request_id, max_attempts
  ) values (
    p_job_key, target_queue, p_job_type, p_session_id, p_base_wiki_version,
    p_target_through_seq, p_task_schema_version, p_request_id, p_max_attempts
  ) returning * into inserted_job;
  select message_id into sent_message_id
  from pgmq.send(
    target_queue,
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

create function private.read_ai_work_queue(
  p_queue_name text,
  p_visibility_timeout_seconds integer default 60,
  p_quantity integer default 2,
  p_max_poll_seconds integer default 0
)
returns table (
  queue_name text,
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
  if p_queue_name not in ('ai-session', 'ai-record')
    or p_visibility_timeout_seconds not between 5 and 3600
    or p_quantity not between 1 and 10
    or p_max_poll_seconds not between 0 and 5 then
    raise exception using errcode = '22023', message = 'ai_queue_read_options_invalid';
  end if;
  return query
  select p_queue_name, queued.msg_id, queued.read_ct,
    queued.enqueued_at, queued.vt, queued.message
  from pgmq.read_with_poll(
    p_queue_name, p_visibility_timeout_seconds, p_quantity,
    p_max_poll_seconds, 100, '{}'::jsonb
  ) as queued;
end;
$$;

create or replace function private.claim_ai_job(
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
    set status = 'FAILED', lease_expires_at = null, next_attempt_at = null,
        last_error_code = 'ATTEMPTS_EXHAUSTED', completed_at = occurred_at,
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
  set status = 'PROCESSING', attempt_count = next_attempt,
      lease_expires_at = p_lease_expires_at, next_attempt_at = null,
      last_error_code = null, suppression_reason = null,
      started_at = coalesce(job.started_at, occurred_at), updated_at = occurred_at
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

create function private.archive_ai_work_message(
  p_queue_name text,
  p_queue_message_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_queue_name not in ('ai-session', 'ai-record') then
    raise exception using errcode = '22023', message = 'ai_queue_name_invalid';
  end if;
  return pgmq.archive(p_queue_name, p_queue_message_id);
end;
$$;

revoke all on function private.read_ai_work_queue(text, integer, integer, integer)
from public, anon, authenticated;
revoke all on function private.archive_ai_work_message(text, bigint)
from public, anon, authenticated;
grant execute on function private.read_ai_work_queue(text, integer, integer, integer)
to bookseasoning_ai_worker;
grant execute on function private.archive_ai_work_message(text, bigint)
to bookseasoning_ai_worker;

create or replace function private.complete_ai_job(
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
  perform pgmq.archive(target_job.queue_name, p_queue_message_id);
  return true;
end;
$$;

create or replace function private.retry_ai_job(
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
    set outcome = 'TERMINAL_FAILURE', error_code = 'ATTEMPTS_EXHAUSTED',
        finished_at = occurred_at
    where attempt.job_id = target_job.id
      and attempt.attempt_no = p_attempt_no
      and attempt.outcome is null;
    update private.ai_job_runs as job
    set status = 'FAILED', lease_expires_at = null, next_attempt_at = null,
        last_error_code = 'ATTEMPTS_EXHAUSTED', completed_at = occurred_at,
        updated_at = occurred_at
    where job.id = target_job.id;
    perform pgmq.archive(target_job.queue_name, p_queue_message_id);
    return true;
  end if;
  update private.ai_job_attempts as attempt
  set outcome = 'RETRYABLE_FAILURE', error_code = p_error_code,
      finished_at = occurred_at
  where attempt.job_id = target_job.id
    and attempt.attempt_no = p_attempt_no
    and attempt.outcome is null;
  perform pgmq.set_vt(target_job.queue_name, p_queue_message_id, p_delay_seconds);
  update private.ai_job_runs as job
  set status = 'RETRY_SCHEDULED', lease_expires_at = null,
      next_attempt_at = occurred_at + pg_catalog.make_interval(secs => p_delay_seconds),
      last_error_code = p_error_code, updated_at = occurred_at
  where job.id = target_job.id;
  return true;
end;
$$;

create or replace function private.extend_ai_job_lease(
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
    target_job.queue_name, p_queue_message_id, p_visibility_timeout_seconds
  );
  update private.ai_job_runs as job
  set lease_expires_at = next_expiry, updated_at = timezone('utc', now())
  where job.id = target_job.id;
  update private.ai_job_attempts as attempt
  set lease_expires_at = next_expiry
  where attempt.job_id = target_job.id
    and attempt.attempt_no = p_attempt_no
    and attempt.outcome is null;
  return true;
end;
$$;

create function private.orchestrate_session_results()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_wiki_version integer := 0;
  enqueued record;
begin
  if new.phase is not distinct from old.phase then
    return new;
  end if;
  select coalesce(max(wiki.version), 0)
  into latest_wiki_version
  from private.living_wiki_versions as wiki
  where wiki.session_id = new.id;

  if new.phase = 'SYNTHESIS' then
    perform * from private.enqueue_ai_session_job(
      'synthesis:' || new.id::text || ':phase:' || new.phase_version::text,
      'SYNTHESIS', new.id, latest_wiki_version, new.last_message_seq,
      'synthesis-output.v1', null, 3
    );
  elsif new.phase = 'ENDED' then
    select * into enqueued
    from private.enqueue_ai_session_job(
      'final-wiki:' || new.id::text || ':ended:' || new.phase_version::text,
      'FINAL_WIKI', new.id, latest_wiki_version, new.last_message_seq,
      'public-evaluator-output.v1', null, 3
    );
    insert into private.discussion_results (
      session_id, current_job_id, generation_no, status, created_at, updated_at
    ) values (
      new.id, enqueued.job_id, 1, 'PENDING',
      timezone('utc', now()), timezone('utc', now())
    )
    on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.orchestrate_session_results()
from public, anon, authenticated, bookseasoning_ai_worker;

create trigger session_runs_result_orchestration
after update of phase on public.session_runs
for each row execute function private.orchestrate_session_results();

create function private.commit_ai_synthesis(
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
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  existing_synthesis private.ai_syntheses%rowtype;
  provider_record private.ai_provider_runs%rowtype;
  next_message_id uuid;
  next_message_seq bigint;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0 or p_expected_phase_version <= 0
    or p_fallback_used is null
    or jsonb_typeof(p_output) <> 'object'
    or not private.public_jsonb_keys_allowed(p_output)
    or p_output ->> 'schemaVersion' is distinct from 'synthesis-output.v1'
    or length(btrim(coalesce(p_output ->> 'message', ''))) not between 1 and 2000
    or jsonb_typeof(p_output -> 'perspectiveSummaries') <> 'array'
    or jsonb_array_length(p_output -> 'perspectiveSummaries') not between 2 and 4
    or length(btrim(coalesce(p_output ->> 'reflectionQuestion', ''))) not between 1 and 500
    or jsonb_typeof(p_output -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_output -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'ai_synthesis_output_invalid';
  end if;
  if (p_fallback_used and p_provider_run is not null)
    or (not p_fallback_used and jsonb_typeof(p_provider_run) <> 'object') then
    raise exception using errcode = '22023', message = 'ai_synthesis_provider_shape_invalid';
  end if;
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_synthesis_job_not_found';
  end if;
  if target_job.job_type <> 'SYNTHESIS'
    or target_job.queue_name <> 'ai-record'
    or target_job.task_schema_version <> 'synthesis-output.v1'
    or p_output ->> 'basedThroughSeq'
      is distinct from target_job.target_through_seq::text then
    raise exception using errcode = '22023', message = 'ai_synthesis_job_mismatch';
  end if;

  select synthesis.* into existing_synthesis
  from private.ai_syntheses as synthesis
  where synthesis.source_job_id = target_job.id;
  if found then
    if existing_synthesis.canonical_output is distinct from p_output
      or existing_synthesis.fallback_used is distinct from p_fallback_used then
      raise exception using errcode = '22023', message = 'ai_synthesis_replay_mismatch';
    end if;
    select message.seq_no into next_message_seq
    from public.messages as message
    where message.session_id = existing_synthesis.session_id
      and message.id = existing_synthesis.message_id;
    return query select existing_synthesis.status,
      existing_synthesis.message_id, next_message_seq,
      existing_synthesis.suppression_reason, true;
    return;
  end if;
  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_synthesis_attempt_stale';
  end if;
  if not p_fallback_used then
    select provider_run.* into provider_record
    from private.ai_provider_runs as provider_run
    where provider_run.job_id = target_job.id
      and provider_run.attempt_no = p_attempt_no
      and provider_run.task_alias = 'SYNTHESIS_V1'
      and provider_run.status = 'SUCCEEDED';
    if not found or provider_record.canonical_run is distinct from p_provider_run then
      raise exception using errcode = '55000', message = 'ai_synthesis_provider_run_required';
    end if;
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
    raise exception using errcode = '22023', message = 'ai_synthesis_pack_mismatch';
  end if;
  if target_session.phase <> 'SYNTHESIS'
    or target_session.phase_version <> p_expected_phase_version then
    insert into private.ai_syntheses (
      source_job_id, session_id, based_through_seq, schema_version,
      canonical_output, fallback_used, status, suppression_reason, created_at
    ) values (
      target_job.id, target_job.session_id, target_job.target_through_seq,
      'synthesis-output.v1', p_output, p_fallback_used,
      'SUPPRESSED_STALE', 'SYNTHESIS_PHASE_CHANGED', occurred_at
    );
    return query select 'SUPPRESSED_STALE'::text, null::uuid, null::bigint,
      'SYNTHESIS_PHASE_CHANGED'::text, false;
    return;
  end if;

  next_message_id := extensions.gen_random_uuid();
  next_message_seq := target_session.last_message_seq + 1;
  update public.session_runs as session
  set last_message_seq = next_message_seq,
      aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.* into target_session;
  insert into public.messages (
    id, session_id, seq_no, kind, ai_attribution, author_user_id,
    author_profile_name_snapshot, client_message_id, body,
    confirmed_at, created_at
  ) values (
    next_message_id, target_session.id, next_message_seq,
    'AI_HOST', 'SYNTHESIS', null, 'AI Host', null,
    p_output ->> 'message', occurred_at, occurred_at
  );
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, occurred_at
  ) values (
    target_session.id, target_session.last_event_seq,
    target_session.aggregate_version, target_session.channel_epoch,
    'MESSAGE_APPENDED',
    pg_catalog.jsonb_build_object(
      'message', pg_catalog.jsonb_build_object(
        'messageId', next_message_id,
        'sessionId', target_session.id,
        'seqNo', next_message_seq,
        'kind', 'AI_HOST',
        'aiAttribution', 'SYNTHESIS',
        'author', pg_catalog.jsonb_build_object(
          'userId', null, 'profileName', 'AI Host'
        ),
        'clientMessageId', null,
        'body', p_output ->> 'message',
        'reply', 'null'::jsonb,
        'confirmedAt', occurred_at
      )
    ), occurred_at
  );
  insert into private.ai_syntheses (
    source_job_id, session_id, message_id, based_through_seq,
    schema_version, canonical_output, fallback_used, status,
    created_at, committed_at
  ) values (
    target_job.id, target_job.session_id, next_message_id,
    target_job.target_through_seq, 'synthesis-output.v1', p_output,
    p_fallback_used, 'COMMITTED', occurred_at, occurred_at
  );
  return query select 'COMMITTED'::text, next_message_id,
    next_message_seq, null::text, false;
end;
$$;

revoke all on function private.commit_ai_synthesis(
  uuid, integer, integer, jsonb, jsonb, boolean
) from public, anon, authenticated;
grant execute on function private.commit_ai_synthesis(
  uuid, integer, integer, jsonb, jsonb, boolean
) to bookseasoning_ai_worker;

create function private.commit_final_wiki(
  p_job_id uuid,
  p_attempt_no integer,
  p_document jsonb,
  p_evaluator_result jsonb,
  p_insufficient boolean
)
returns table (
  commit_status text,
  final_wiki_version integer,
  record_job_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  current_wiki private.living_wiki_versions%rowtype;
  existing_final private.living_wiki_versions%rowtype;
  provider_record private.ai_provider_runs%rowtype;
  target_result private.discussion_results%rowtype;
  enqueued record;
  next_record_job_id uuid := null;
  new_version integer;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0 or p_insufficient is null
    or jsonb_typeof(p_document) <> 'object'
    or not private.public_jsonb_keys_allowed(p_document)
    or (p_insufficient and p_evaluator_result is not null)
    or (not p_insufficient and jsonb_typeof(p_evaluator_result) <> 'object') then
    raise exception using errcode = '22023', message = 'final_wiki_input_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'final_wiki_job_not_found';
  end if;
  if target_job.job_type <> 'FINAL_WIKI'
    or target_job.queue_name <> 'ai-record'
    or target_job.task_schema_version <> 'public-evaluator-output.v1' then
    raise exception using errcode = '22023', message = 'final_wiki_job_mismatch';
  end if;

  select wiki.* into existing_final
  from private.living_wiki_versions as wiki
  where wiki.source_job_id = target_job.id;
  if found then
    if existing_final.kind <> 'FINAL'
      or existing_final.document is distinct from p_document then
      raise exception using errcode = '22023', message = 'final_wiki_replay_mismatch';
    end if;
    select result.* into strict target_result
    from private.discussion_results as result
    where result.session_id = target_job.session_id;
    return query select 'COMMITTED'::text, existing_final.version,
      case when target_result.current_job_id = target_job.id
        then null::uuid else target_result.current_job_id end,
      true;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'final_wiki_attempt_stale';
  end if;
  select session.* into strict target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  select room.* into strict target_room
  from public.rooms as room
  where room.id = target_session.room_id;
  select result.* into strict target_result
  from private.discussion_results as result
  where result.session_id = target_session.id
  for update;
  select wiki.* into current_wiki
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_session.id
  order by wiki.version desc
  limit 1;

  if target_session.phase <> 'ENDED'
    or target_session.last_message_seq <> target_job.target_through_seq
    or coalesce(current_wiki.version, 0) <> target_job.base_wiki_version
    or coalesce(current_wiki.kind, '') = 'FINAL'
    or target_result.current_job_id <> target_job.id then
    raise exception using errcode = '55000', message = 'final_wiki_state_stale';
  end if;
  if not p_insufficient then
    if p_evaluator_result ->> 'schemaVersion'
        is distinct from 'public-evaluator-output.v1'
      or p_evaluator_result ->> 'packVersionId'
        is distinct from target_room.book_context_pack_version_id::text
      or p_evaluator_result ->> 'baseWikiVersion'
        is distinct from target_job.base_wiki_version::text
      or p_evaluator_result ->> 'targetThroughSeq'
        is distinct from target_job.target_through_seq::text
      or p_evaluator_result #>> '{wikiPatch,baseVersion}'
        is distinct from target_job.base_wiki_version::text
      or p_evaluator_result #>> '{wikiPatch,basedThroughSeq}'
        is distinct from target_job.target_through_seq::text then
      raise exception using errcode = '22023', message = 'final_wiki_output_mismatch';
    end if;
    select provider_run.* into provider_record
    from private.ai_provider_runs as provider_run
    where provider_run.job_id = target_job.id
      and provider_run.attempt_no = p_attempt_no
      and provider_run.task_alias = 'PUBLIC_EVALUATOR_FINAL_V1'
      and provider_run.status = 'SUCCEEDED';
    if not found then
      raise exception using errcode = '55000', message = 'final_wiki_provider_run_required';
    end if;
  end if;

  new_version := coalesce(current_wiki.version, 0) + 1;
  insert into private.living_wiki_versions (
    session_id, version, kind, base_version, based_through_seq,
    schema_version, document, source_job_id, created_at
  ) values (
    target_session.id, new_version, 'FINAL',
    case when new_version = 1 then null else target_job.base_wiki_version end,
    target_job.target_through_seq, 'living-wiki.v1', p_document,
    target_job.id, occurred_at
  );

  if not p_insufficient then
    insert into private.ai_evaluations (
      job_id, session_id, base_wiki_version, committed_wiki_version,
      target_through_seq, schema_version, canonical_result,
      commit_status, validation_code, created_at
    ) values (
      target_job.id, target_session.id, target_job.base_wiki_version,
      new_version, target_job.target_through_seq,
      'public-evaluator-output.v1', p_evaluator_result,
      'COMMITTED', null, occurred_at
    );

    select * into enqueued
    from private.enqueue_ai_session_job(
      'discussion-record:' || target_session.id::text
        || ':final:' || new_version::text
        || ':generation:' || target_result.generation_no::text,
      'DISCUSSION_RECORD', target_session.id, new_version,
      target_job.target_through_seq, 'discussion-record-output.v1', null, 3
    );
    update private.discussion_results as result
    set final_wiki_version = new_version,
        current_job_id = enqueued.job_id,
        status = 'PENDING',
        updated_at = occurred_at
    where result.session_id = target_session.id;
    next_record_job_id := enqueued.job_id;
  else
    update private.discussion_results as result
    set final_wiki_version = new_version,
        status = 'INSUFFICIENT',
        ready_at = occurred_at,
        updated_at = occurred_at
    where result.session_id = target_session.id;
  end if;

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
    target_session.id, target_session.last_event_seq,
    target_session.aggregate_version, target_session.channel_epoch,
    'SESSION_RESULT_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'result', pg_catalog.jsonb_build_object(
        'status', case when p_insufficient then 'INSUFFICIENT' else 'PENDING' end,
        'canRetry', false
      )
    ), occurred_at
  );
  return query select 'COMMITTED'::text, new_version,
    next_record_job_id,
    false;
end;
$$;

revoke all on function private.commit_final_wiki(
  uuid, integer, jsonb, jsonb, boolean
) from public, anon, authenticated;
grant execute on function private.commit_final_wiki(
  uuid, integer, jsonb, jsonb, boolean
) to bookseasoning_ai_worker;

create function private.read_discussion_record_context(
  p_session_id uuid,
  p_final_wiki_version integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_session public.session_runs%rowtype;
  target_room public.rooms%rowtype;
  final_wiki private.living_wiki_versions%rowtype;
  message_rows jsonb;
  closing_rows jsonb;
begin
  select session.* into target_session
  from public.session_runs as session
  where session.id = p_session_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'record_context_session_not_found';
  end if;
  select room.* into strict target_room
  from public.rooms as room
  where room.id = target_session.room_id;
  select wiki.* into final_wiki
  from private.living_wiki_versions as wiki
  where wiki.session_id = p_session_id
    and wiki.version = p_final_wiki_version
    and wiki.kind = 'FINAL';
  if not found then
    raise exception using errcode = 'P0002', message = 'record_context_final_wiki_not_found';
  end if;

  select coalesce(pg_catalog.jsonb_agg(selected.document order by selected.seq_no), '[]'::jsonb)
  into message_rows
  from (
    select message.seq_no,
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
      ) as document
    from public.messages as message
    where message.session_id = p_session_id
      and message.seq_no <= final_wiki.based_through_seq
    order by message.seq_no desc
    limit 200
  ) as selected;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'responseId', response.id,
      'profileName', response.profile_name_snapshot,
      'body', response.body
    ) order by response.updated_at, response.id
  ), '[]'::jsonb)
  into closing_rows
  from public.session_closing_responses as response
  where response.session_id = p_session_id
    and response.status = 'SUBMITTED';

  return pg_catalog.jsonb_build_object(
    'schemaVersion', 'discussion-record-context.v1',
    'sessionId', target_session.id,
    'roomId', target_room.id,
    'pinnedPackVersionId', target_room.book_context_pack_version_id,
    'finalWiki', pg_catalog.jsonb_build_object(
      'sessionId', final_wiki.session_id,
      'version', final_wiki.version,
      'kind', final_wiki.kind,
      'baseVersion', final_wiki.base_version,
      'basedThroughSeq', final_wiki.based_through_seq,
      'schemaVersion', final_wiki.schema_version,
      'document', final_wiki.document,
      'createdAt', final_wiki.created_at
    ),
    'messages', message_rows,
    'closingLines', closing_rows
  );
end;
$$;

revoke all on function private.read_discussion_record_context(uuid, integer)
from public, anon, authenticated;
grant execute on function private.read_discussion_record_context(uuid, integer)
to bookseasoning_ai_worker;

create function private.commit_discussion_record(
  p_job_id uuid,
  p_attempt_no integer,
  p_output jsonb
)
returns table (
  commit_status text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_result private.discussion_results%rowtype;
  provider_record private.ai_provider_runs%rowtype;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or jsonb_typeof(p_output) <> 'object'
    or not private.public_jsonb_keys_allowed(p_output)
    or p_output ->> 'schemaVersion' is distinct from 'discussion-record-output.v1'
    or jsonb_typeof(p_output -> 'record') <> 'object'
    or p_output #>> '{record,schemaVersion}' is distinct from 'discussion-record.v1'
    or jsonb_typeof(p_output #> '{record,keyIssues}') <> 'array'
    or jsonb_array_length(p_output #> '{record,keyIssues}') not between 2 and 4
    or jsonb_typeof(p_output -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_output -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'discussion_record_output_invalid';
  end if;
  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'discussion_record_job_not_found';
  end if;
  select result.* into strict target_result
  from private.discussion_results as result
  where result.session_id = target_job.session_id
  for update;
  if target_result.status = 'READY' then
    if target_result.canonical_record is distinct from p_output -> 'record' then
      raise exception using errcode = '22023', message = 'discussion_record_replay_mismatch';
    end if;
    return query select 'COMMITTED'::text, true;
    return;
  end if;
  if target_job.job_type <> 'DISCUSSION_RECORD'
    or target_job.queue_name <> 'ai-record'
    or target_job.task_schema_version <> 'discussion-record-output.v1'
    or target_result.current_job_id <> target_job.id
    or target_result.final_wiki_version <> target_job.base_wiki_version
    or p_output ->> 'sessionId' is distinct from target_job.session_id::text
    or p_output ->> 'finalWikiVersion'
      is distinct from target_job.base_wiki_version::text
    or p_output ->> 'basedThroughSeq'
      is distinct from target_job.target_through_seq::text then
    raise exception using errcode = '22023', message = 'discussion_record_job_mismatch';
  end if;
  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'discussion_record_attempt_stale';
  end if;
  select provider_run.* into provider_record
  from private.ai_provider_runs as provider_run
  where provider_run.job_id = target_job.id
    and provider_run.attempt_no = p_attempt_no
    and provider_run.task_alias = 'DISCUSSION_RECORD_V1'
    and provider_run.status = 'SUCCEEDED';
  if not found then
    raise exception using errcode = '55000', message = 'discussion_record_provider_run_required';
  end if;
  select session.* into strict target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  if target_session.phase <> 'ENDED' then
    raise exception using errcode = '55000', message = 'discussion_record_session_not_ended';
  end if;

  update private.discussion_results as result
  set status = 'READY',
      schema_version = 'discussion-record.v1',
      canonical_record = p_output -> 'record',
      ready_at = occurred_at,
      updated_at = occurred_at
  where result.session_id = target_job.session_id;
  update public.session_runs as session
  set aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      updated_at = occurred_at
  where session.id = target_job.session_id
  returning session.* into target_session;
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, occurred_at
  ) values (
    target_session.id, target_session.last_event_seq,
    target_session.aggregate_version, target_session.channel_epoch,
    'SESSION_RESULT_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'result', pg_catalog.jsonb_build_object('status', 'READY', 'canRetry', false)
    ), occurred_at
  );
  return query select 'COMMITTED'::text, false;
end;
$$;

revoke all on function private.commit_discussion_record(uuid, integer, jsonb)
from public, anon, authenticated;
grant execute on function private.commit_discussion_record(uuid, integer, jsonb)
to bookseasoning_ai_worker;

create function private.discussion_result_public_status(
  p_result_status text,
  p_job_status text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_result_status in ('READY', 'INSUFFICIENT') then p_result_status
    when p_result_status = 'FAILED' then 'FAILED'
    when p_job_status = 'PROCESSING' then 'PROCESSING'
    when p_job_status = 'RETRY_WAIT' then 'RETRYING'
    when p_job_status = 'FAILED' then 'FAILED'
    else 'PENDING'
  end;
$$;

revoke all on function private.discussion_result_public_status(text, text)
from public, anon, authenticated;

create function private.mark_discussion_result_failed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_session public.session_runs%rowtype;
begin
  if new.status = 'FAILED'
    and old.status is distinct from new.status
    and new.job_type in ('FINAL_WIKI', 'DISCUSSION_RECORD')
    and exists (
      select 1 from private.discussion_results as result
      where result.session_id = new.session_id
        and result.current_job_id = new.id
        and result.status <> 'READY'
    ) then
    update private.discussion_results as result
    set status = 'FAILED', updated_at = timezone('utc', now())
    where result.session_id = new.session_id
      and result.current_job_id = new.id;
    update public.session_runs as session
    set aggregate_version = session.aggregate_version + 1,
        last_event_seq = session.last_event_seq + 1,
        updated_at = timezone('utc', now())
    where session.id = new.session_id
    returning session.* into target_session;
    insert into public.session_events (
      session_id, event_seq, aggregate_version, channel_epoch,
      event_type, public_payload, occurred_at
    ) values (
      target_session.id, target_session.last_event_seq,
      target_session.aggregate_version, target_session.channel_epoch,
      'SESSION_RESULT_STATE_CHANGED',
      pg_catalog.jsonb_build_object(
        'result', pg_catalog.jsonb_build_object('status', 'FAILED', 'canRetry', false)
      ), timezone('utc', now())
    );
  end if;
  return new;
end;
$$;

revoke all on function private.mark_discussion_result_failed()
from public, anon, authenticated, bookseasoning_ai_worker;
create trigger ai_job_runs_discussion_result_failed
after update of status on private.ai_job_runs
for each row execute function private.mark_discussion_result_failed();

create function public.get_discussion_result(p_room_id uuid)
returns table (result jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  target_result private.discussion_results%rowtype;
  target_job private.ai_job_runs%rowtype;
  public_status text := 'NOT_STARTED';
  published_record jsonb := null;
  closing_lines jsonb := '[]'::jsonb;
  ready_at timestamptz := null;
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if not private.can_read_session_room(p_room_id) then
    raise exception using errcode = '42501', message = 'session_read_forbidden';
  end if;
  select room.* into strict target_room
  from public.rooms as room where room.id = p_room_id;
  select session.* into strict target_session
  from public.session_runs as session where session.room_id = p_room_id;
  if target_session.phase <> 'ENDED' then
    raise exception using errcode = '55000', message = 'discussion_result_not_available';
  end if;
  select stored.* into target_result
  from private.discussion_results as stored
  where stored.session_id = target_session.id;
  if found then
    select job.* into strict target_job
    from private.ai_job_runs as job where job.id = target_result.current_job_id;
    public_status := private.discussion_result_public_status(
      target_result.status, target_job.status
    );
    if public_status = 'READY' then
      published_record := target_result.canonical_record;
      ready_at := target_result.ready_at;
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'responseId', response.id,
          'profileName', response.profile_name_snapshot,
          'body', response.body
        ) order by response.updated_at, response.id
      ), '[]'::jsonb)
      into closing_lines
      from public.session_closing_responses as response
      where response.session_id = target_session.id
        and response.status = 'SUBMITTED';
    elsif public_status = 'INSUFFICIENT' then
      ready_at := target_result.ready_at;
    end if;
  end if;
  return query select pg_catalog.jsonb_build_object(
    'roomId', target_room.id,
    'sessionId', target_session.id,
    'status', public_status,
    'canRetry', target_room.host_user_id = actor_id and public_status = 'FAILED',
    'record', published_record,
    'closingLines', closing_lines,
    'readyAt', ready_at,
    'serverTime', timezone('utc', now())
  );
end;
$$;

create function public.retry_discussion_result(
  p_command_id uuid,
  p_request_fingerprint text,
  p_room_id uuid
)
returns table (
  room_id uuid,
  session_id uuid,
  job_id uuid,
  status text,
  duplicate boolean,
  server_time timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_room public.rooms%rowtype;
  target_session public.session_runs%rowtype;
  target_result private.discussion_results%rowtype;
  failed_job private.ai_job_runs%rowtype;
  receipt private.discussion_result_command_receipts%rowtype;
  enqueued record;
  next_generation integer;
  occurred_at timestamptz := timezone('utc', now());
begin
  if actor_id is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || p_command_id::text, 0)
  );
  select stored.* into receipt
  from private.discussion_result_command_receipts as stored
  where stored.actor_user_id = actor_id and stored.command_id = p_command_id;
  if found then
    if receipt.request_fingerprint <> p_request_fingerprint
      or receipt.session_id <> (
        select session.id from public.session_runs as session
        where session.room_id = p_room_id
      ) then
      raise exception using errcode = '40001', message = 'command_payload_mismatch';
    end if;
    return query select p_room_id, receipt.session_id, receipt.job_id,
      'PENDING'::text, true, occurred_at;
    return;
  end if;
  select room.* into target_room
  from public.rooms as room where room.id = p_room_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'room_not_found';
  end if;
  if target_room.host_user_id <> actor_id then
    raise exception using errcode = '42501', message = 'host_required';
  end if;
  select session.* into strict target_session
  from public.session_runs as session where session.room_id = p_room_id
  for update;
  select stored.* into strict target_result
  from private.discussion_results as stored where stored.session_id = target_session.id
  for update;
  if target_session.phase <> 'ENDED' or target_result.status <> 'FAILED' then
    raise exception using errcode = '55000', message = 'discussion_result_retry_unavailable';
  end if;
  select job.* into strict failed_job
  from private.ai_job_runs as job
  where job.id = target_result.current_job_id;
  next_generation := target_result.generation_no + 1;
  if target_result.final_wiki_version is null then
    select * into enqueued from private.enqueue_ai_session_job(
      'final-wiki:' || target_session.id::text
        || ':retry:' || next_generation::text,
      'FINAL_WIKI', target_session.id, failed_job.base_wiki_version,
      target_session.last_message_seq,
      'public-evaluator-output.v1', p_command_id::text, 3
    );
  else
    select * into enqueued from private.enqueue_ai_session_job(
      'discussion-record:' || target_session.id::text
        || ':final:' || target_result.final_wiki_version::text
        || ':generation:' || next_generation::text,
      'DISCUSSION_RECORD', target_session.id, target_result.final_wiki_version,
      target_session.last_message_seq, 'discussion-record-output.v1',
      p_command_id::text, 3
    );
  end if;
  update private.discussion_results as stored
  set current_job_id = enqueued.job_id,
      generation_no = next_generation,
      status = 'PENDING',
      updated_at = occurred_at
  where stored.session_id = target_session.id;
  insert into private.discussion_result_command_receipts (
    actor_user_id, command_id, request_fingerprint, session_id, job_id, created_at
  ) values (
    actor_id, p_command_id, p_request_fingerprint,
    target_session.id, enqueued.job_id, occurred_at
  );
  update public.session_runs as session
  set aggregate_version = session.aggregate_version + 1,
      last_event_seq = session.last_event_seq + 1,
      updated_at = occurred_at
  where session.id = target_session.id
  returning session.* into target_session;
  insert into public.session_events (
    session_id, event_seq, aggregate_version, channel_epoch,
    event_type, public_payload, actor_user_id, command_id, occurred_at
  ) values (
    target_session.id, target_session.last_event_seq,
    target_session.aggregate_version, target_session.channel_epoch,
    'SESSION_RESULT_STATE_CHANGED',
    pg_catalog.jsonb_build_object(
      'result', pg_catalog.jsonb_build_object('status', 'PENDING', 'canRetry', false)
    ), actor_id, p_command_id, occurred_at
  );
  return query select p_room_id, target_session.id, enqueued.job_id,
    'PENDING'::text, false, occurred_at;
end;
$$;

create function public.get_session_sync_with_results(
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
  target_result private.discussion_results%rowtype;
  target_job private.ai_job_runs%rowtype;
  result_status text := 'NOT_STARTED';
  closing_state jsonb := null;
begin
  select base.snapshot into strict base_snapshot
  from public.get_session_sync_with_ai(
    p_room_id, p_after_event_cursor, p_after_message_seq, p_message_limit
  ) as base;
  select room.* into strict target_room
  from public.rooms as room where room.id = p_room_id;
  select session.* into strict target_session
  from public.session_runs as session where session.room_id = p_room_id;
  if target_session.phase = 'CLOSING' then
    closing_state := private.session_closing_state_json(target_session.id, actor_id);
  end if;
  select stored.* into target_result
  from private.discussion_results as stored
  where stored.session_id = target_session.id;
  if found then
    select job.* into strict target_job
    from private.ai_job_runs as job where job.id = target_result.current_job_id;
    result_status := private.discussion_result_public_status(
      target_result.status, target_job.status
    );
  end if;
  return query select base_snapshot || pg_catalog.jsonb_build_object(
    'closing', closing_state,
    'result', pg_catalog.jsonb_build_object(
      'status', result_status,
      'canRetry', target_room.host_user_id = actor_id and result_status = 'FAILED'
    )
  );
end;
$$;

revoke all on function public.get_discussion_result(uuid) from public, anon;
revoke all on function public.retry_discussion_result(uuid, text, uuid)
from public, anon;
revoke all on function public.get_session_sync_with_results(
  uuid, bigint, bigint, integer
) from public, anon;
grant execute on function public.get_discussion_result(uuid) to authenticated;
grant execute on function public.retry_discussion_result(uuid, text, uuid)
to authenticated;
grant execute on function public.get_session_sync_with_results(
  uuid, bigint, bigint, integer
) to authenticated;

comment on table private.discussion_results is
  'One official post-session result per session. READY rows are immutable except the explicit account-deletion redaction path.';
