alter table private.ai_policy_actions
add column trigger text not null default 'MESSAGE_BATCH' check (
  trigger in (
    'MESSAGE_BATCH', 'PARTICIPATION_THRESHOLD', 'SILENCE',
    'TOPIC_DURATION', 'EXTENSION_DECISION', 'HOST_HELP'
  )
),
add column host_help_reason text check (
  host_help_reason is null
  or host_help_reason in (
    'CONVERSATION_STOPPED', 'DISCUSSION_STUCK_OR_REPETITIVE',
    'TOO_FAR_OFF_TOPIC', 'CONFLICT_NEEDS_REFRAMING'
  )
),
add constraint ai_policy_actions_host_help_shape_check check (
  (trigger = 'HOST_HELP' and host_help_reason is not null and action <> 'WAIT')
  or (trigger <> 'HOST_HELP' and host_help_reason is null)
);

create function private.commit_policy_decision(
  p_job_id uuid,
  p_attempt_no integer,
  p_expected_phase text,
  p_expected_phase_version integer,
  p_decision jsonb
)
returns table (
  policy_action_id uuid,
  commit_status text,
  action text,
  suppression_reason text,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_evaluation private.ai_evaluations%rowtype;
  target_session public.session_runs%rowtype;
  existing_action private.ai_policy_actions%rowtype;
  inserted_action private.ai_policy_actions%rowtype;
  decision_action text;
  decision_trigger text;
  decision_host_help_reason text;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or p_expected_phase_version < 0
    or p_expected_phase not in (
      'SCHEDULED', 'OPENING', 'CORE', 'EXTENDED',
      'SYNTHESIS', 'CLOSING', 'ENDED'
    )
    or jsonb_typeof(p_decision) <> 'object'
    or not private.public_jsonb_keys_allowed(p_decision) then
    raise exception using errcode = '22023', message = 'ai_policy_input_invalid';
  end if;
  if p_decision ->> 'schemaVersion' is distinct from 'policy-decision.v1'
    or jsonb_typeof(p_decision -> 'reasonCodes') <> 'array'
    or jsonb_array_length(p_decision -> 'reasonCodes') not between 1 and 4
    or jsonb_typeof(p_decision -> 'supportingEvidenceRefs') <> 'array'
    or jsonb_array_length(p_decision -> 'supportingEvidenceRefs') > 24 then
    raise exception using errcode = '22023', message = 'ai_policy_schema_invalid';
  end if;

  decision_action := p_decision ->> 'action';
  decision_trigger := p_decision ->> 'trigger';
  decision_host_help_reason := p_decision ->> 'hostHelpReason';
  if decision_action not in (
    'WAIT', 'DEEPEN', 'EXPAND', 'RECONNECT', 'RECONNECT_TO_BOOK',
    'RECONNECT_AND_REFLECT', 'INVITE', 'REVIVE', 'SUMMARIZE',
    'TRANSITION', 'RECOMMEND_EXTENSION'
  ) or decision_trigger not in (
    'MESSAGE_BATCH', 'PARTICIPATION_THRESHOLD', 'SILENCE',
    'TOPIC_DURATION', 'EXTENSION_DECISION', 'HOST_HELP'
  ) or (
    decision_trigger = 'HOST_HELP'
    and (
      decision_host_help_reason not in (
        'CONVERSATION_STOPPED', 'DISCUSSION_STUCK_OR_REPETITIVE',
        'TOO_FAR_OFF_TOPIC', 'CONFLICT_NEEDS_REFRAMING'
      )
      or decision_action = 'WAIT'
    )
  ) or (
    decision_trigger <> 'HOST_HELP'
    and decision_host_help_reason is not null
  ) then
    raise exception using errcode = '22023', message = 'ai_policy_decision_invalid';
  end if;

  select job.*
  into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_policy_job_not_found';
  end if;

  select evaluation.*
  into target_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.job_id = target_job.id;
  if not found
    or target_evaluation.commit_status <> 'COMMITTED'
    or target_evaluation.committed_wiki_version is null then
    raise exception using errcode = '55000', message = 'ai_policy_committed_evaluation_required';
  end if;
  if p_decision ->> 'evaluationId'
      is distinct from target_evaluation.id::text
    or p_decision ->> 'evaluationTargetThroughSeq'
      is distinct from target_evaluation.target_through_seq::text
    or p_decision ->> 'wikiVersion'
      is distinct from target_evaluation.committed_wiki_version::text then
    raise exception using errcode = '22023', message = 'ai_policy_evaluation_mismatch';
  end if;

  select policy.*
  into existing_action
  from private.ai_policy_actions as policy
  where policy.evaluation_id = target_evaluation.id;
  if found then
    if existing_action.action is distinct from decision_action
      or existing_action.reason_codes
        is distinct from p_decision -> 'reasonCodes'
      or existing_action.supporting_evidence_refs
        is distinct from p_decision -> 'supportingEvidenceRefs'
      or existing_action.schema_version
        is distinct from p_decision ->> 'schemaVersion'
      or existing_action.trigger is distinct from decision_trigger
      or existing_action.host_help_reason
        is distinct from decision_host_help_reason then
      raise exception using errcode = '22023', message = 'ai_policy_replay_mismatch';
    end if;
    return query select
      existing_action.id,
      'COMMITTED'::text,
      existing_action.action,
      null::text,
      true;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_policy_attempt_stale';
  end if;

  select session.*
  into target_session
  from public.session_runs as session
  where session.id = target_job.session_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_policy_session_not_found';
  end if;

  if decision_action <> 'WAIT' then
    if target_session.phase <> p_expected_phase
      or target_session.phase_version <> p_expected_phase_version
      or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED') then
      return query select
        null::uuid,
        'SUPPRESSED_STALE'::text,
        decision_action,
        'POLICY_PHASE_CHANGED'::text,
        false;
      return;
    end if;
    if target_session.last_message_seq <> target_evaluation.target_through_seq then
      return query select
        null::uuid,
        'SUPPRESSED_STALE'::text,
        decision_action,
        'POLICY_CURSOR_ADVANCED'::text,
        false;
      return;
    end if;
  end if;

  insert into private.ai_policy_actions (
    evaluation_id,
    session_id,
    action,
    reason_codes,
    supporting_evidence_refs,
    schema_version,
    trigger,
    host_help_reason,
    created_at
  ) values (
    target_evaluation.id,
    target_job.session_id,
    decision_action,
    p_decision -> 'reasonCodes',
    p_decision -> 'supportingEvidenceRefs',
    p_decision ->> 'schemaVersion',
    decision_trigger,
    decision_host_help_reason,
    occurred_at
  ) returning * into inserted_action;

  return query select
    inserted_action.id,
    'COMMITTED'::text,
    inserted_action.action,
    null::text,
    false;
end;
$$;

revoke all on function private.commit_policy_decision(
  uuid, integer, text, integer, jsonb
) from public, anon, authenticated;

grant execute on function private.commit_policy_decision(
  uuid, integer, text, integer, jsonb
) to bookseasoning_ai_worker;

comment on function private.commit_policy_decision(
  uuid, integer, text, integer, jsonb
) is
  'Persists one deterministic Policy decision per committed evaluation and suppresses stale user-facing actions at the session lock boundary.';
