create function private.read_reusable_public_evaluation(
  p_job_id uuid,
  p_attempt_no integer
)
returns table (canonical_result jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job private.ai_job_runs%rowtype;
  target_session public.session_runs%rowtype;
  target_directive private.ai_orchestration_jobs%rowtype;
  current_wiki private.living_wiki_versions%rowtype;
  reusable_evaluation private.ai_evaluations%rowtype;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0 then
    raise exception using errcode = '22023', message = 'ai_reusable_evaluation_input_invalid';
  end if;

  select job.* into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'ai_reusable_evaluation_job_not_found';
  end if;
  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_reusable_evaluation_attempt_stale';
  end if;

  select directive.* into target_directive
  from private.ai_orchestration_jobs as directive
  where directive.job_id = target_job.id;
  if not found
    or target_directive.trigger <> 'SILENCE'
    or target_job.job_type <> 'PUBLIC_EVALUATION'
    or target_job.base_wiki_version <= 0 then
    return;
  end if;

  select session.* into target_session
  from public.session_runs as session
  where session.id = target_job.session_id;
  if not found
    or target_session.phase not in ('OPENING', 'CORE', 'EXTENDED')
    or target_session.last_message_seq <> target_job.target_through_seq then
    return;
  end if;

  select wiki.* into current_wiki
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_job.session_id
  order by wiki.version desc
  limit 1;
  if not found
    or current_wiki.version <> target_job.base_wiki_version
    or current_wiki.based_through_seq <> target_job.target_through_seq
    or current_wiki.kind = 'FINAL' then
    return;
  end if;

  select evaluation.* into reusable_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.session_id = target_job.session_id
    and evaluation.job_id <> target_job.id
    and evaluation.commit_status = 'COMMITTED'
    and evaluation.committed_wiki_version = target_job.base_wiki_version
    and evaluation.target_through_seq = target_job.target_through_seq
  order by evaluation.created_at desc, evaluation.id desc
  limit 1;
  if not found then
    return;
  end if;

  return query select reusable_evaluation.canonical_result;
end;
$$;

revoke all on function private.read_reusable_public_evaluation(uuid, integer)
from public, anon, authenticated;
grant execute on function private.read_reusable_public_evaluation(uuid, integer)
to bookseasoning_ai_worker;

comment on function private.read_reusable_public_evaluation(uuid, integer) is
  'Returns a previously validated PUBLIC evaluation only for an active SILENCE job whose latest Wiki already covers the unchanged message cursor.';

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
    '1 second',
    'select private.enqueue_due_ai_evaluations();'
  );
end;
$$;
