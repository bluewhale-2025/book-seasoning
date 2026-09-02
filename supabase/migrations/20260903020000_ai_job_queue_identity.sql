alter table private.ai_job_runs
drop constraint ai_job_runs_queue_message_id_key;

alter table private.ai_job_runs
add constraint ai_job_runs_queue_message_identity_key
unique (queue_name, queue_message_id);

comment on constraint ai_job_runs_queue_message_identity_key
on private.ai_job_runs is
  'PGMQ message ids are unique inside a queue, not across ai-session and ai-record.';
