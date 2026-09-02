begin;

set local search_path = public, extensions;

select plan(40);

select has_table('private', 'ai_provider_runs', 'provider diagnostics table exists');
select has_table('private', 'ai_openings', 'Opening result table exists');
select has_function(
  'private',
  'record_ai_provider_run',
  array[
    'uuid', 'integer', 'text', 'text', 'text', 'text', 'text', 'text',
    'text', 'text', 'integer', 'jsonb', 'text'
  ],
  'provider diagnostics have a worker-only write boundary'
);
select has_function(
  'private',
  'commit_ai_opening',
  array['uuid', 'integer', 'integer', 'jsonb', 'jsonb', 'boolean'],
  'Opening has an atomic commit boundary'
);
select has_function(
  'private',
  'commit_ai_host_intervention',
  array['uuid', 'integer', 'text', 'integer', 'uuid', 'jsonb', 'jsonb', 'jsonb'],
  'Host has an atomic commit boundary'
);
select has_function(
  'private',
  'fail_ai_host_intervention',
  array['uuid', 'integer', 'uuid', 'text'],
  'automatic Host failure has a content-free diagnostic boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.record_ai_provider_run(uuid,integer,text,text,text,text,text,text,text,text,integer,jsonb,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot write provider diagnostics'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.commit_ai_opening(uuid,integer,integer,jsonb,jsonb,boolean)',
    'EXECUTE'
  ),
  'authenticated clients cannot publish an Opening'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.commit_ai_host_intervention(uuid,integer,text,integer,uuid,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot publish a Host intervention'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.fail_ai_host_intervention(uuid,integer,uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot forge a Host failure'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.record_ai_provider_run(uuid,integer,text,text,text,text,text,text,text,text,integer,jsonb,text)',
    'EXECUTE'
  ),
  'the worker can record provider diagnostics'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_ai_opening(uuid,integer,integer,jsonb,jsonb,boolean)',
    'EXECUTE'
  ),
  'the worker can commit a validated Opening'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.commit_ai_host_intervention(uuid,integer,text,integer,uuid,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'the worker can commit a validated Host intervention'
);
select ok(
  has_function_privilege(
    'bookseasoning_ai_worker',
    'private.fail_ai_host_intervention(uuid,integer,uuid,text)',
    'EXECUTE'
  ),
  'the worker can retain a safe automatic Host failure code'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_provider_runs', 'INSERT'
  ),
  'the worker cannot bypass provider-run validation'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_openings', 'INSERT'
  ),
  'the worker cannot bypass Opening commit checks'
);
select ok(
  not has_table_privilege(
    'bookseasoning_ai_worker', 'private.ai_interventions', 'INSERT'
  ),
  'the worker cannot bypass Host commit checks'
);

insert into auth.users (id, email, aud, role, raw_user_meta_data)
values (
  'ab100000-0000-4000-8000-000000000001',
  'ai-host@example.test',
  'authenticated',
  'authenticated',
  '{"profile_name":"AI Host 테스트"}'::jsonb
);

insert into public.books (id, title, author, publisher, publication_year)
values (
  'ab200000-0000-4000-8000-000000000001',
  'AI Host 테스트 책',
  '작가',
  '출판사',
  2026
);

insert into public.book_context_pack_versions (
  id, book_id, version, status, schema_version, short_description, published_at
) values (
  'ab300000-0000-4000-8000-000000000001',
  'ab200000-0000-4000-8000-000000000001',
  1,
  'PUBLISHED',
  '1',
  'provider Opening Host fixture',
  timezone('utc', now())
);

insert into public.rooms (
  id, title, book_context_pack_version_id, scheduled_start_at, password_hash,
  min_participants, max_participants, host_user_id
) values
(
  'ab400000-0000-4000-8000-000000000001',
  '생성 Opening 방',
  'ab300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2, 5, 'ab100000-0000-4000-8000-000000000001'
),
(
  'ab400000-0000-4000-8000-000000000002',
  'fallback Opening 방',
  'ab300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2, 5, 'ab100000-0000-4000-8000-000000000001'
),
(
  'ab400000-0000-4000-8000-000000000003',
  'Opening transition 방',
  'ab300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2, 5, 'ab100000-0000-4000-8000-000000000001'
),
(
  'ab400000-0000-4000-8000-000000000004',
  'stale Host 방',
  'ab300000-0000-4000-8000-000000000001',
  timezone('utc', now()),
  '$argon2id$v=19$m=19456,p=1,t=2$testsalt$testhash',
  2, 5, 'ab100000-0000-4000-8000-000000000001'
);

insert into public.session_runs (
  id, room_id, phase, phase_version, last_message_seq
) values
('ab500000-0000-4000-8000-000000000001', 'ab400000-0000-4000-8000-000000000001', 'OPENING', 1, 0),
('ab500000-0000-4000-8000-000000000002', 'ab400000-0000-4000-8000-000000000002', 'OPENING', 1, 0),
('ab500000-0000-4000-8000-000000000003', 'ab400000-0000-4000-8000-000000000003', 'OPENING', 1, 0),
('ab500000-0000-4000-8000-000000000004', 'ab400000-0000-4000-8000-000000000004', 'CORE', 1, 0);

insert into private.ai_job_runs (
  id, job_key, queue_name, job_type, session_id, base_wiki_version,
  target_through_seq, task_schema_version, status, attempt_count, max_attempts,
  lease_expires_at, started_at, created_at, updated_at
) values
(
  'ab600000-0000-4000-8000-000000000001', 'opening:generated', 'ai-session',
  'OPENING', 'ab500000-0000-4000-8000-000000000001', 0, 0,
  'opening-output.v1', 'PROCESSING', 1, 3,
  timezone('utc', now()) + interval '5 minutes', timezone('utc', now()),
  timezone('utc', now()), timezone('utc', now())
),
(
  'ab600000-0000-4000-8000-000000000002', 'opening:fallback', 'ai-session',
  'OPENING', 'ab500000-0000-4000-8000-000000000002', 0, 0,
  'opening-output.v1', 'PROCESSING', 1, 3,
  timezone('utc', now()) + interval '5 minutes', timezone('utc', now()),
  timezone('utc', now()), timezone('utc', now())
),
(
  'ab600000-0000-4000-8000-000000000003', 'host:opening-transition', 'ai-session',
  'PUBLIC_EVALUATION', 'ab500000-0000-4000-8000-000000000003', 0, 0,
  'public-evaluator-output.v1', 'PROCESSING', 1, 3,
  timezone('utc', now()) + interval '5 minutes', timezone('utc', now()),
  timezone('utc', now()), timezone('utc', now())
),
(
  'ab600000-0000-4000-8000-000000000004', 'host:stale', 'ai-session',
  'PUBLIC_EVALUATION', 'ab500000-0000-4000-8000-000000000004', 0, 0,
  'public-evaluator-output.v1', 'PROCESSING', 1, 3,
  timezone('utc', now()) + interval '5 minutes', timezone('utc', now()),
  timezone('utc', now()), timezone('utc', now())
);

insert into private.ai_job_attempts (
  job_id, attempt_no, queue_read_count, lease_expires_at, started_at
)
select
  job.id, 1, 1, job.lease_expires_at, timezone('utc', now())
from private.ai_job_runs as job
where job.id in (
  'ab600000-0000-4000-8000-000000000001',
  'ab600000-0000-4000-8000-000000000002',
  'ab600000-0000-4000-8000-000000000003',
  'ab600000-0000-4000-8000-000000000004'
);

select private.record_ai_provider_run(
  'ab600000-0000-4000-8000-000000000001', 1, 'OPENING_V1',
  'opening.v1', 'opening-output.v1', 'OPENAI', 'host-model', 'low',
  'SUCCEEDED', 'resp_opening_1', 120,
  '{"inputTokens":100,"outputTokens":30,"reasoningTokens":10,"totalTokens":130}'::jsonb,
  null
);

create temporary table generated_opening on commit drop as
select * from private.commit_ai_opening(
  'ab600000-0000-4000-8000-000000000001',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 'opening-output.v1',
    'packVersionId', 'ab300000-0000-4000-8000-000000000001',
    'basedThroughSeq', 0,
    'message', '서로 다른 입장이 드러난 장면부터 이야기해볼까요?',
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  jsonb_build_object(
    'schemaVersion', 'ai-provider-run.v1',
    'taskAlias', 'OPENING_V1',
    'promptVersion', 'opening.v1',
    'outputSchemaVersion', 'opening-output.v1',
    'provider', 'OPENAI',
    'model', 'host-model',
    'reasoningEffort', 'low',
    'responseId', 'resp_opening_1',
    'latencyMs', 120,
    'usage', '{"inputTokens":100,"outputTokens":30,"reasoningTokens":10,"totalTokens":130}'::jsonb
  ),
  false
);

select is(
  (select commit_status from generated_opening),
  'COMMITTED'::text,
  'a fresh generated Opening is committed'
);
select ok(
  not (select fallback_used from private.ai_openings where session_id = 'ab500000-0000-4000-8000-000000000001'),
  'the generated Opening is distinguished from fallback'
);
select is(
  (
    select message.ai_attribution
    from public.messages as message
    where message.id = (select message_id from generated_opening)
  ),
  'OPENING'::text,
  'the public AI message carries Opening attribution'
);
select is(
  (
    select event.public_payload #>> '{message,aiAttribution}'
    from public.session_events as event
    where event.event_type = 'MESSAGE_APPENDED'
      and event.public_payload #>> '{message,messageId}' =
        (select message_id::text from generated_opening)
  ),
  'OPENING'::text,
  'the committed event exposes only the public Opening attribution'
);
select is(
  (
    select provider_run.canonical_run ->> 'model'
    from private.ai_provider_runs as provider_run
    where provider_run.job_id = 'ab600000-0000-4000-8000-000000000001'
  ),
  'host-model'::text,
  'content-free diagnostics preserve the actual model mapping'
);

create temporary table replayed_opening on commit drop as
select * from private.commit_ai_opening(
  'ab600000-0000-4000-8000-000000000001',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 'opening-output.v1',
    'packVersionId', 'ab300000-0000-4000-8000-000000000001',
    'basedThroughSeq', 0,
    'message', '서로 다른 입장이 드러난 장면부터 이야기해볼까요?',
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  (select canonical_run from private.ai_provider_runs where job_id = 'ab600000-0000-4000-8000-000000000001'),
  false
);
select ok(
  (select duplicate from replayed_opening),
  'an identical Opening replay returns the original effect'
);
select is(
  (select count(*) from public.messages where session_id = 'ab500000-0000-4000-8000-000000000001'),
  1::bigint,
  'Opening replay cannot duplicate the public message'
);

create temporary table fallback_opening on commit drop as
select * from private.commit_ai_opening(
  'ab600000-0000-4000-8000-000000000002',
  1,
  1,
  jsonb_build_object(
    'schemaVersion', 'opening-output.v1',
    'packVersionId', 'ab300000-0000-4000-8000-000000000001',
    'basedThroughSeq', 0,
    'message', '이 책에서 가장 오래 남은 생각과 그 이유를 이야기해볼까요?',
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  null,
  true
);
select is(
  (select commit_status from fallback_opening),
  'COMMITTED'::text,
  'a deterministic fallback Opening can start discussion without provider output'
);
select ok(
  (select fallback_used from private.ai_openings where session_id = 'ab500000-0000-4000-8000-000000000002'),
  'fallback use is retained for diagnostics'
);

insert into private.living_wiki_versions (
  session_id, version, kind, base_version, based_through_seq,
  schema_version, document, source_job_id
) values
('ab500000-0000-4000-8000-000000000003', 1, 'INCREMENTAL', null, 0, 'living-wiki.v1', '{}'::jsonb, 'ab600000-0000-4000-8000-000000000003'),
('ab500000-0000-4000-8000-000000000004', 1, 'INCREMENTAL', null, 0, 'living-wiki.v1', '{}'::jsonb, 'ab600000-0000-4000-8000-000000000004');

insert into private.ai_evaluations (
  id, job_id, session_id, base_wiki_version, committed_wiki_version,
  target_through_seq, schema_version, canonical_result, commit_status
) values
(
  'ab700000-0000-4000-8000-000000000003',
  'ab600000-0000-4000-8000-000000000003',
  'ab500000-0000-4000-8000-000000000003', 0, 1, 0,
  'public-evaluator-output.v1',
  '{"packVersionId":"ab300000-0000-4000-8000-000000000001"}'::jsonb,
  'COMMITTED'
),
(
  'ab700000-0000-4000-8000-000000000004',
  'ab600000-0000-4000-8000-000000000004',
  'ab500000-0000-4000-8000-000000000004', 0, 1, 0,
  'public-evaluator-output.v1',
  '{"packVersionId":"ab300000-0000-4000-8000-000000000001"}'::jsonb,
  'COMMITTED'
);

insert into private.ai_policy_actions (
  id, evaluation_id, session_id, action, reason_codes,
  supporting_evidence_refs, schema_version, trigger
) values
(
  'ab800000-0000-4000-8000-000000000003',
  'ab700000-0000-4000-8000-000000000003',
  'ab500000-0000-4000-8000-000000000003',
  'TRANSITION', '["OPENING_POSITIONS_SURFACED"]'::jsonb, '[]'::jsonb,
  'policy-decision.v1', 'MESSAGE_BATCH'
),
(
  'ab800000-0000-4000-8000-000000000004',
  'ab700000-0000-4000-8000-000000000004',
  'ab500000-0000-4000-8000-000000000004',
  'DEEPEN', '["DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED"]'::jsonb, '[]'::jsonb,
  'policy-decision.v1', 'MESSAGE_BATCH'
);

select private.record_ai_provider_run(
  job.id, 1, 'HOST_INTERVENTION_V1', 'host-intervention.v1',
  'host-intervention-output.v1', 'OPENAI', 'host-model', 'low',
  'SUCCEEDED', 'resp_host_' || right(job.id::text, 1), 80,
  '{"inputTokens":80,"outputTokens":20,"reasoningTokens":5,"totalTokens":100}'::jsonb,
  null
)
from private.ai_job_runs as job
where job.id in (
  'ab600000-0000-4000-8000-000000000003',
  'ab600000-0000-4000-8000-000000000004'
);

create temporary table transitioned_host on commit drop as
select * from private.commit_ai_host_intervention(
  'ab600000-0000-4000-8000-000000000003', 1, 'OPENING', 1,
  'ab800000-0000-4000-8000-000000000003',
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'ab700000-0000-4000-8000-000000000003',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'TRANSITION',
    'reasonCodes', jsonb_build_array('OPENING_POSITIONS_SURFACED'),
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  jsonb_build_object(
    'schemaVersion', 'host-intervention-output.v1',
    'packVersionId', 'ab300000-0000-4000-8000-000000000001',
    'basedThroughSeq', 0,
    'action', 'TRANSITION',
    'attribution', 'AUTOMATIC',
    'message', '두 입장이 드러났습니다. 이제 서로 다른 전제를 더 살펴볼까요?',
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  (select canonical_run from private.ai_provider_runs where job_id = 'ab600000-0000-4000-8000-000000000003')
);

select is(
  (select commit_status from transitioned_host),
  'COMMITTED'::text,
  'a fresh Host intervention is committed once'
);
select is(
  (
    select message.ai_attribution
    from public.messages as message
    where message.id = (select message_id from transitioned_host)
  ),
  'AUTOMATIC'::text,
  'automatic Host attribution is preserved on the public message'
);
select is(
  (select phase from public.session_runs where id = 'ab500000-0000-4000-8000-000000000003'),
  'CORE'::text,
  'a validated Opening TRANSITION advances the authoritative phase to Core'
);
select ok(
  (select phase_transitioned from transitioned_host),
  'the Host commit reports the phase transition'
);
select is(
  (
    select event.public_payload ->> 'reason'
    from public.session_events as event
    where event.session_id = 'ab500000-0000-4000-8000-000000000003'
      and event.event_type = 'SESSION_STATE_CHANGED'
    order by event.event_seq desc
    limit 1
  ),
  'OPENING_COMPLETED_BY_AI'::text,
  'the Opening-to-Core transition is recoverable from the public event log'
);
select is(
  (
    select intervention.status
    from private.ai_interventions as intervention
    where intervention.policy_action_id = 'ab800000-0000-4000-8000-000000000003'
  ),
  'COMMITTED'::text,
  'the intervention record correlates Policy to the immutable message'
);

update public.session_runs
set last_message_seq = 1
where id = 'ab500000-0000-4000-8000-000000000004';

create temporary table stale_host on commit drop as
select * from private.commit_ai_host_intervention(
  'ab600000-0000-4000-8000-000000000004', 1, 'CORE', 1,
  'ab800000-0000-4000-8000-000000000004',
  jsonb_build_object(
    'schemaVersion', 'policy-decision.v1',
    'evaluationId', 'ab700000-0000-4000-8000-000000000004',
    'evaluationTargetThroughSeq', 0,
    'wikiVersion', 1,
    'trigger', 'MESSAGE_BATCH',
    'hostHelpReason', null,
    'action', 'DEEPEN',
    'reasonCodes', jsonb_build_array('DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED'),
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  jsonb_build_object(
    'schemaVersion', 'host-intervention-output.v1',
    'packVersionId', 'ab300000-0000-4000-8000-000000000001',
    'basedThroughSeq', 0,
    'action', 'DEEPEN',
    'attribution', 'AUTOMATIC',
    'message', '근거를 조금 더 구체적으로 살펴볼까요?',
    'supportingEvidenceRefs', '[]'::jsonb
  ),
  (select canonical_run from private.ai_provider_runs where job_id = 'ab600000-0000-4000-8000-000000000004')
);
select is(
  (select commit_status from stale_host),
  'SUPPRESSED_STALE'::text,
  'Host output is suppressed when discussion advances during generation'
);
select is(
  (select suppression_reason from stale_host),
  'HOST_CURSOR_ADVANCED'::text,
  'freshness suppression has a stable safe reason code'
);
select ok(
  (select message_id from stale_host) is null,
  'stale Host output creates no public message'
);
select is(
  (
    select intervention.status
    from private.ai_interventions as intervention
    where intervention.policy_action_id = 'ab800000-0000-4000-8000-000000000004'
  ),
  'SUPPRESSED_STALE'::text,
  'stale suppression remains observable without provider content'
);

delete from private.ai_interventions
where policy_action_id = 'ab800000-0000-4000-8000-000000000004';
select ok(
  private.fail_ai_host_intervention(
    'ab600000-0000-4000-8000-000000000004',
    1,
    'ab800000-0000-4000-8000-000000000004',
    'AI_PROVIDER_RATE_LIMITED'
  ),
  'an automatic Host failure is retained without user-facing content'
);
select is(
  (
    select intervention.status || ':' || intervention.suppression_reason
    from private.ai_interventions as intervention
    where intervention.policy_action_id = 'ab800000-0000-4000-8000-000000000004'
  ),
  'FAILED:AI_PROVIDER_RATE_LIMITED'::text,
  'the failed Host record contains only a stable diagnostic code'
);

select throws_ok(
  $$
    select * from private.commit_ai_opening(
      'ab600000-0000-4000-8000-000000000002', 1, 1,
      '{"schemaVersion":"opening-output.v1","packVersionId":"ab300000-0000-4000-8000-000000000001","basedThroughSeq":0,"message":"질문","supportingEvidenceRefs":[],"aiPrivate":"secret"}'::jsonb,
      null,
      true
    )
  $$,
  '22023',
  'ai_opening_output_invalid',
  'private-shaped output cannot cross the public Opening commit boundary'
);

select throws_ok(
  $$
    update private.ai_provider_runs
    set model = 'rewritten-model'
    where job_id = 'ab600000-0000-4000-8000-000000000001'
  $$,
  '55000',
  'immutable_ai_fact',
  'provider diagnostics cannot be rewritten'
);

select * from finish();
rollback;
