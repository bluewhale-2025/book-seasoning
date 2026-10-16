-- Read-only diagnostics for administrators who can already read this session.
-- Never return canonical_result, Wiki, prompts, bodies or participant identities.
create function public.admin_read_session_ai_diagnostics(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target public.session_runs%rowtype;
  checked_at timestamptz := statement_timestamp();
  participant_at timestamptz;
  intervention_at timestamptz;
begin
  if not private.is_admin(auth.uid()) then
    raise exception using errcode = '42501', message = 'admin_required';
  end if;
  if not private.can_read_session_room(p_room_id) then
    raise exception using errcode = '42501', message = 'session_access_denied';
  end if;
  select * into strict target from public.session_runs where room_id = p_room_id;
  select max(confirmed_at) into participant_at from public.messages
    where session_id = target.id and kind = 'PARTICIPANT';
  select max(committed_at) into intervention_at from private.ai_interventions
    where session_id = target.id and status = 'COMMITTED';

  return jsonb_build_object(
    'checkedAt', checked_at,
    'sessionId', target.id,
    'phase', target.phase,
    'lastMessageSeq', target.last_message_seq,
    'lastParticipantMessageAt', participant_at,
    'lastInterventionAt', intervention_at,
    'silenceSeconds', case when coalesce(participant_at, target.started_at) is null then null
      else greatest(0, floor(extract(epoch from checked_at - coalesce(participant_at, target.started_at))))::integer end,
    'cooldownRemainingSeconds', case when intervention_at is null then 0
      else greatest(0, ceil(extract(epoch from intervention_at + interval '90 seconds' - checked_at)))::integer end,
    'awaitingParticipantResponse', intervention_at is not null
      and intervention_at >= coalesce(participant_at, target.started_at, '-infinity'::timestamptz),
    'latestJob', (
      select jsonb_build_object('id', j.id, 'type', j.job_type, 'status', j.status,
        'attemptCount', j.attempt_count, 'errorCode', j.last_error_code,
        'suppressionReason', j.suppression_reason)
      from private.ai_job_runs j where j.session_id = target.id
      order by j.created_at desc, j.id desc limit 1
    ),
    'evaluations', coalesce((
      select jsonb_agg(entry order by created_at desc, id desc) from (
        select e.created_at, e.id, jsonb_build_object(
          'id', e.id, 'createdAt', e.created_at, 'throughSeq', e.target_through_seq,
          'commitStatus', e.commit_status,
          'metrics', (
            select jsonb_object_agg(metric, jsonb_build_object(
              'level', e.canonical_result->'metrics'->metric->'level',
              'reasonCodes', e.canonical_result->'metrics'->metric->'reasonCodes'
            )) from unnest(array['depth','expansion','bookGrounding','saturation',
              'participationBalance','relevance','activity']) as metric
          ),
          'confidence', e.canonical_result->'confidence',
          'action', p.action, 'reasonCodes', coalesce(p.reason_codes, '[]'::jsonb)
        ) as entry
        from private.ai_evaluations e
        left join private.ai_policy_actions p on p.evaluation_id = e.id
        where e.session_id = target.id
        order by e.created_at desc, e.id desc limit 20
      ) recent
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_read_session_ai_diagnostics(uuid) from public, anon;
grant execute on function public.admin_read_session_ai_diagnostics(uuid) to authenticated;
