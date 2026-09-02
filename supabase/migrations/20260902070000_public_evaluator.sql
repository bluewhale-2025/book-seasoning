create function private.commit_public_evaluation_candidate(
  p_job_id uuid,
  p_attempt_no integer,
  p_kind text,
  p_base_version integer,
  p_based_through_seq bigint,
  p_schema_version text,
  p_document jsonb,
  p_evaluator_schema_version text,
  p_evaluator_result jsonb
)
returns table (
  evaluation_id uuid,
  commit_status text,
  committed_wiki_version integer,
  current_wiki_version integer,
  current_based_through_seq bigint,
  wrote_wiki_version boolean,
  should_requeue boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  committed record;
  v_evaluation_id uuid;
begin
  select *
  into committed
  from private.commit_living_wiki_candidate(
    p_job_id,
    p_attempt_no,
    p_kind,
    p_base_version,
    p_based_through_seq,
    p_schema_version,
    p_document,
    p_evaluator_schema_version,
    p_evaluator_result
  );

  select evaluation.id
  into strict v_evaluation_id
  from private.ai_evaluations as evaluation
  where evaluation.job_id = p_job_id;

  return query select
    v_evaluation_id,
    committed.commit_status,
    committed.committed_wiki_version,
    committed.current_wiki_version,
    committed.current_based_through_seq,
    committed.wrote_wiki_version,
    committed.should_requeue;
end;
$$;

revoke all on function private.commit_public_evaluation_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) from public, anon, authenticated;

grant execute on function private.commit_public_evaluation_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) to bookseasoning_ai_worker;

comment on function private.commit_public_evaluation_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) is
  'Commits a validated public Evaluator candidate and returns the immutable evaluation identity for Policy correlation.';
