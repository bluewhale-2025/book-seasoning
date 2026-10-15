-- Reduce time-signal polling frequency while preserving evaluation gates.
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
    '5 seconds',
    'select private.enqueue_due_ai_evaluations();'
  );
end;
$$;
