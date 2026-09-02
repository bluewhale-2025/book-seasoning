create or replace function private.record_ai_provider_run(
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
      'PUBLIC_EVALUATOR_FINAL_V1',
      'OPENING_V1',
      'HOST_INTERVENTION_V1',
      'SYNTHESIS_V1',
      'DISCUSSION_RECORD_V1'
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

revoke all on function private.record_ai_provider_run(
  uuid, integer, text, text, text, text, text, text, text,
  text, integer, jsonb, text
) from public, anon, authenticated;

grant execute on function private.record_ai_provider_run(
  uuid, integer, text, text, text, text, text, text, text,
  text, integer, jsonb, text
) to bookseasoning_ai_worker;

comment on function private.record_ai_provider_run(
  uuid, integer, text, text, text, text, text, text, text,
  text, integer, jsonb, text
) is 'Records content-free diagnostics for every non-Builder AI task alias.';
