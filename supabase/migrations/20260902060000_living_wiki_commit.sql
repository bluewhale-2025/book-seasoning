alter table private.living_wiki_versions
drop constraint living_wiki_versions_base_shape_check;

alter table private.living_wiki_versions
add constraint living_wiki_versions_base_shape_check check (
  (version = 1 and base_version is null)
  or (version > 1 and base_version = version - 1)
);

create function private.living_wiki_checkpoint_preserves(
  p_base_document jsonb,
  p_candidate_document jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_base_document) <> 'object'
    or jsonb_typeof(p_candidate_document) <> 'object'
    or jsonb_typeof(p_base_document -> 'currentTopic') <> 'object'
    or jsonb_typeof(p_candidate_document -> 'currentTopic') <> 'object'
    or jsonb_typeof(p_base_document -> 'perspectiveMap') <> 'array'
    or jsonb_typeof(p_candidate_document -> 'perspectiveMap') <> 'array'
    or jsonb_typeof(p_base_document -> 'issueAndQuestionMap') <> 'array'
    or jsonb_typeof(p_candidate_document -> 'issueAndQuestionMap') <> 'array'
    or jsonb_typeof(p_base_document -> 'coverage') <> 'array'
    or jsonb_typeof(p_candidate_document -> 'coverage') <> 'array' then
    return false;
  end if;

  if p_candidate_document #>> '{currentTopic,topicId}'
      is not distinct from p_base_document #>> '{currentTopic,topicId}'
    or p_candidate_document #>> '{currentTopic,transitionedFromTopicId}'
      is distinct from p_base_document #>> '{currentTopic,topicId}' then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_base_document -> 'perspectiveMap'
    ) as previous(item)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_candidate_document -> 'perspectiveMap'
      ) as candidate(item)
      where candidate.item ->> 'perspectiveId'
        is not distinct from previous.item ->> 'perspectiveId'
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_base_document -> 'issueAndQuestionMap'
    ) as previous(item)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_candidate_document -> 'issueAndQuestionMap'
      ) as candidate(item)
      where candidate.item ->> 'issueOrQuestionId'
        is not distinct from previous.item ->> 'issueOrQuestionId'
    )
  ) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_base_document -> 'coverage'
    ) as previous(item)
    where not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_candidate_document -> 'coverage'
      ) as candidate(item)
      where candidate.item ->> 'subjectType'
          is not distinct from previous.item ->> 'subjectType'
        and candidate.item ->> 'subjectId'
          is not distinct from previous.item ->> 'subjectId'
    )
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function private.living_wiki_checkpoint_preserves(jsonb, jsonb)
from public, anon, authenticated, bookseasoning_ai_worker;

create function private.commit_living_wiki_candidate(
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
  target_job private.ai_job_runs%rowtype;
  existing_evaluation private.ai_evaluations%rowtype;
  current_wiki private.living_wiki_versions%rowtype;
  v_current_version integer := 0;
  v_current_cursor bigint := 0;
  v_new_version integer;
  v_write_version boolean;
  v_should_requeue boolean := false;
  v_existing_wrote_version boolean := false;
  occurred_at timestamptz := timezone('utc', now());
begin
  if p_attempt_no <= 0
    or p_base_version < 0
    or p_based_through_seq < 0 then
    raise exception using errcode = '22023', message = 'ai_wiki_commit_input_invalid';
  end if;
  if p_kind not in ('INCREMENTAL', 'TOPIC_CHECKPOINT') then
    raise exception using errcode = '22023', message = 'ai_wiki_kind_invalid';
  end if;
  if p_schema_version <> 'living-wiki.v1'
    or p_evaluator_schema_version <> 'public-evaluator-output.v1'
    or jsonb_typeof(p_document) <> 'object'
    or jsonb_typeof(p_evaluator_result) <> 'object' then
    raise exception using errcode = '22023', message = 'ai_wiki_schema_invalid';
  end if;

  select job.*
  into target_job
  from private.ai_job_runs as job
  where job.id = p_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'ai_wiki_job_not_found';
  end if;
  if target_job.base_wiki_version <> p_base_version
    or target_job.target_through_seq <> p_based_through_seq
    or target_job.task_schema_version <> p_evaluator_schema_version
    or (p_kind = 'INCREMENTAL' and target_job.job_type <> 'PUBLIC_EVALUATION')
    or (p_kind = 'TOPIC_CHECKPOINT' and target_job.job_type <> 'TOPIC_CHECKPOINT')
    or p_evaluator_result ->> 'schemaVersion'
      is distinct from p_evaluator_schema_version
    or p_evaluator_result ->> 'baseWikiVersion'
      is distinct from p_base_version::text
    or p_evaluator_result ->> 'targetThroughSeq'
      is distinct from p_based_through_seq::text
    or p_evaluator_result #>> '{wikiPatch,baseVersion}'
      is distinct from p_base_version::text
    or p_evaluator_result #>> '{wikiPatch,basedThroughSeq}'
      is distinct from p_based_through_seq::text then
    raise exception using errcode = '22023', message = 'ai_wiki_job_output_mismatch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('living-wiki:' || target_job.session_id::text, 0)
  );

  select evaluation.*
  into existing_evaluation
  from private.ai_evaluations as evaluation
  where evaluation.job_id = target_job.id;

  select wiki.*
  into current_wiki
  from private.living_wiki_versions as wiki
  where wiki.session_id = target_job.session_id
  order by wiki.version desc
  limit 1;
  if found then
    v_current_version := current_wiki.version;
    v_current_cursor := current_wiki.based_through_seq;
  end if;

  if existing_evaluation.id is not null then
    if existing_evaluation.canonical_result <> p_evaluator_result then
      raise exception using errcode = '22023', message = 'ai_wiki_commit_replay_mismatch';
    end if;
    if existing_evaluation.committed_wiki_version is not null then
      select exists (
        select 1
        from private.living_wiki_versions as wiki
        where wiki.session_id = target_job.session_id
          and wiki.version = existing_evaluation.committed_wiki_version
          and wiki.source_job_id = target_job.id
      ) into v_existing_wrote_version;
    end if;
    v_should_requeue := existing_evaluation.commit_status = 'SUPPRESSED_STALE_BASE'
      and coalesce(current_wiki.kind, '') <> 'FINAL'
      and v_current_cursor < target_job.target_through_seq;
    return query select
      existing_evaluation.commit_status,
      existing_evaluation.committed_wiki_version,
      v_current_version,
      v_current_cursor,
      v_existing_wrote_version,
      v_should_requeue;
    return;
  end if;

  if target_job.status <> 'PROCESSING'
    or target_job.attempt_count <> p_attempt_no
    or target_job.lease_expires_at is null
    or target_job.lease_expires_at <= occurred_at then
    raise exception using errcode = '55000', message = 'ai_wiki_attempt_stale';
  end if;

  if coalesce(current_wiki.kind, '') = 'FINAL'
    or v_current_version <> p_base_version then
    insert into private.ai_evaluations (
      job_id,
      session_id,
      base_wiki_version,
      committed_wiki_version,
      target_through_seq,
      schema_version,
      canonical_result,
      commit_status,
      validation_code,
      created_at
    ) values (
      target_job.id,
      target_job.session_id,
      p_base_version,
      null,
      p_based_through_seq,
      p_evaluator_schema_version,
      p_evaluator_result,
      'SUPPRESSED_STALE_BASE',
      case when coalesce(current_wiki.kind, '') = 'FINAL'
        then 'LIVING_WIKI_FINAL_LOCKED'
        else 'LIVING_WIKI_STALE_BASE'
      end,
      occurred_at
    );
    v_should_requeue := coalesce(current_wiki.kind, '') <> 'FINAL'
      and v_current_cursor < p_based_through_seq;
    return query select
      'SUPPRESSED_STALE_BASE'::text,
      null::integer,
      v_current_version,
      v_current_cursor,
      false,
      v_should_requeue;
    return;
  end if;

  if p_based_through_seq < v_current_cursor then
    raise exception using errcode = '22023', message = 'ai_wiki_cursor_regression';
  end if;
  if p_kind = 'TOPIC_CHECKPOINT' and (
    v_current_version = 0
    or not private.living_wiki_checkpoint_preserves(
      current_wiki.document,
      p_document
    )
  ) then
    raise exception using errcode = '22023', message = 'ai_wiki_checkpoint_history_lost';
  end if;

  v_write_version := v_current_version = 0
    or p_kind = 'TOPIC_CHECKPOINT'
    or current_wiki.document is distinct from p_document
    or v_current_cursor < p_based_through_seq;

  if v_write_version then
    v_new_version := v_current_version + 1;
    insert into private.living_wiki_versions (
      session_id,
      version,
      kind,
      base_version,
      based_through_seq,
      schema_version,
      document,
      source_job_id,
      created_at
    ) values (
      target_job.session_id,
      v_new_version,
      p_kind,
      case when v_new_version = 1 then null else p_base_version end,
      p_based_through_seq,
      p_schema_version,
      p_document,
      target_job.id,
      occurred_at
    );
  else
    v_new_version := v_current_version;
  end if;

  insert into private.ai_evaluations (
    job_id,
    session_id,
    base_wiki_version,
    committed_wiki_version,
    target_through_seq,
    schema_version,
    canonical_result,
    commit_status,
    validation_code,
    created_at
  ) values (
    target_job.id,
    target_job.session_id,
    p_base_version,
    v_new_version,
    p_based_through_seq,
    p_evaluator_schema_version,
    p_evaluator_result,
    'COMMITTED',
    null,
    occurred_at
  );

  return query select
    'COMMITTED'::text,
    v_new_version,
    case when v_write_version then v_new_version else v_current_version end,
    case when v_write_version then p_based_through_seq else v_current_cursor end,
    v_write_version,
    false;
end;
$$;

revoke all on function private.commit_living_wiki_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) from public, anon, authenticated;

grant execute on function private.commit_living_wiki_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) to bookseasoning_ai_worker;

comment on function private.commit_living_wiki_candidate(
  uuid, integer, text, integer, bigint, text, jsonb, text, jsonb
) is
  'Fenced optimistic Wiki/evaluation commit with stale-base suppression and checkpoint history preservation.';
