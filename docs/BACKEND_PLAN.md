# 책은양념 MVP 서버 구현 계획

> Status: Accepted implementation plan  
> Product source of truth: `PRODUCT_SPEC.md`  
> Shared technical baseline: `docs/TECHNICAL_PLAN.md`  
> Frontend counterpart: `docs/FRONTEND_PLAN.md`  
> AI engine detail: `docs/AI_ENGINE_SPEC.md`  
> Book Context detail: `docs/BOOK_CONTEXT_SPEC.md`  
> Last updated: 2026-09-01

## 0. 문서 목적과 우선순위

이 문서는 `apps/server`, `packages/domain`, Supabase migration/RLS/function과 queue worker를 별도 서버 작업으로 구현하기 위한 실행 계획이다. 공통 제품 행동과 frontend-facing contract는 이 문서에서 재정의하지 않는다.

문서가 충돌할 때는 다음 순서를 따른다.

1. `PRODUCT_SPEC.md`
2. 승인된 Product/Technical Decision이 있는 `docs/DECISIONS.md`
3. `docs/TECHNICAL_PLAN.md`
4. 이 문서

API, snapshot, Realtime event 또는 error code를 바꾸면 `packages/contracts`를 먼저 수정하고 frontend fixture·호환성을 함께 검증한다. DB 편의를 이유로 제품 단계, 권한, 결과 불변성과 `AI_PRIVATE` 규칙을 축소하지 않는다.

## 1. 서버 책임과 비책임

### 1.1 책임

- NestJS + FastifyAdapter API와 HTTP listener 없는 Nest worker
- Supabase SQL migration, constraints, RLS, grant, transaction function
- JWT 검증, command validation, 권한·상태 재확인과 abuse 방어
- 메시지·참가·세션 단계·타이머·Closing·공식 결과의 authoritative commit
- idempotency, row lock, version conflict와 race-condition 처리
- private Broadcast event, DB snapshot/heartbeat와 cursor 복구 기반
- Supabase Queues/Cron의 enqueue, retry, lease와 stale job 처리
- Evaluator, deterministic Policy, Host, Living Wiki, record와 Builder 실행
- `AI_PRIVATE` 저장·context·LLM task·로그의 구조적 격리
- safe logging, first-party fact/event, Sentry scrub과 운영 metric
- Lightsail container, migration, backup/restore, secret와 배포 runbook

### 1.2 책임이 아닌 것

- 브라우저 화면, local form state, visual pending/failed UX
- 클라이언트 timer나 Presence를 공식 상태로 신뢰
- 프론트 component를 server module에 import
- 전체 DB를 감추는 범용 repository/ORM 추상화
- AI 출력을 검증 없이 message, Wiki 또는 result로 확정
- elevated secret client를 일반 query나 사용자 Host 경로에서 사용
- Full-text RAG, 음성, 설문과 세션 간 장기 기억

## 2. 대상 구조와 모듈 경계

```text
apps/server/
  src/
    api/                    Fastify bootstrap, middleware, controllers
    worker/                 queue consumer bootstrap and schedulers
    modules/
      identity/
      books/
      book-context/
      rooms/
      sessions/
      messages/
      realtime/
      ai-evaluation/
      ai-host/
      living-wiki/
      records/
      admin-builder/
      accounts/
      observability/
    infrastructure/         Supabase, pg/Kysely, provider adapters
packages/domain/
  session-machine/
  policy/
  privacy/
packages/contracts/         public/internal schema export를 분리
supabase/
  migrations/
  tests/                    pgTAP, RLS and command tests
tests/
  fixtures/
  evals/
  e2e/
```

기능별로 `controller → application → domain → infrastructure` 방향을 사용하되 단순 query에 불필요한 계층을 강제하지 않는다. 순수 상태 머신, Policy와 privacy allow-list는 Nest/Supabase/OpenAI SDK를 import하지 않는다.

API와 worker는 application/domain을 공유하지만 bootstrap과 권한이 다르다. worker-only private repository, secret client와 AI_PRIVATE context builder는 API의 일반 Host·record module에서 import할 수 없게 dependency boundary test를 둔다.

## 3. DB와 권한 소유권

### 3.1 Schema source of truth

- `supabase/migrations`의 versioned SQL만 schema, enum, function, trigger, RLS, grant와 extension을 변경한다.
- Dashboard 수동 변경, ORM migration generator와 production hotfix SQL을 원본으로 사용하지 않는다.
- migration마다 local reset, generated DB type drift와 pgTAP을 통과한다.
- destructive 변경은 expand → backfill → application switch → contract 순서로 release를 나눈다.

### 3.2 접근 역할

| Actor | 허용 접근 |
| --- | --- |
| Browser user JWT | Auth, 공개/본인 범위 read, 허용된 private Realtime/Presence |
| API user command | 사용자 JWT가 적용된 좁은 transaction function, 일반 query |
| Worker role | queue claim, AI/public fact와 task별 최소 private repository |
| Admin Builder role | Book/Pack workflow에 한정된 관리 command |
| Account deletion role | Auth 삭제, private 삭제, 공동 기여 익명화 transaction |
| Migration/backup role | runtime과 분리된 schema/backup 전용 credential |

`private` schema는 Supabase Data API exposed schema에 넣지 않는다. security-definer function은 고정 `search_path`, 최소 grant와 내부 actor/상태 재검사를 갖는다.

### 3.3 데이터 범주

- Raw fact: profile snapshot, membership, message, prep, session event, reflection
- Authoritative state: room/session phase, deadline, version, result state
- Replaceable interpretation: evaluation, public/private Wiki version, Policy action
- Immutable output: 확정 message, 성공한 official discussion record
- Private content: AI_PRIVATE 원문·private-derived state·평가 근거 중 비공개 reference
- Operational fact: job run, command idempotency, heartbeat, safe analytics event

DB row를 public response로 직접 반환하지 않고 mapper와 public Zod schema allow-list를 통과시킨다.

PUBLIC-lane Living Wiki와 Book Context는 모두 구조화 문서지만 소유권이 다르다. Wiki는 session별 replaceable interpretation이고 Pack은 운영자가 Publish한 versioned reusable knowledge다. Wiki row에 Pack 내용을 복사하거나 Pack row에 session 관찰을 병합하지 않는다.

## 4. API, query와 contract 경계

### 4.1 공통 규칙

- HTTP body/query/param, DB result, queue payload, Realtime event와 LLM output을 각 경계에서 Zod parse한다.
- public contract와 internal/private contract는 package export path부터 분리한다.
- command는 `commandId`, actor, 대상 aggregate와 기대 version을 포함할 수 있어야 한다.
- 오류는 안정된 `code`, 사용자에게 안전한 message와 필요 시 최신 version만 반환한다. stack, SQL, provider/model과 내부 metric은 숨긴다.
- OpenAPI는 Zod contract에서 파생하며 별도 DTO를 원본으로 만들지 않는다.

### 4.2 Query 경계

브라우저가 직접 읽을 수 있는 데이터는 RLS가 적용된 view/query로 제한한다.

- 현재 profile과 최소 공개 participant identity
- Published Book/Pack catalog
- 내 토론, 검색 가능한 방과 참가 가능 여부
- membership 범위 room/session snapshot
- cursor 기반 공식 messages와 PUBLIC prep
- 검증된 current topic/AI intervention 같은 참가자용 public discussion projection
- official record와 제출된 마지막 한 줄

Living Wiki 전체 document, AI_PRIVATE, evaluation/Policy 내부 로그, rate-limit row, queue/job payload, secret와 탈퇴 연결 정보는 public query path에 두지 않는다. 공개 원본만으로 만든 Wiki라는 표현은 데이터 provenance를 뜻하며 참가자에게 Wiki 자체를 공개한다는 뜻이 아니다.

### 4.3 Command inventory

정확한 HTTP path보다 command 의미와 transaction 경계를 먼저 고정한다.

| Domain | 주요 command |
| --- | --- |
| Identity | profile 이름 변경, 계정 탈퇴 |
| Room | 생성, 설정 변경, 취소, password 참가, 시작 전 등록 취소 |
| Membership | 방장 이전, 참가자 내보내기 |
| Prep | 항목 저장·수정·삭제와 visibility 변경; 시작 시 잠금 |
| Session | 시작, 15분 연장, 마무리 선택, 토론 종료, AI 도움 요청 |
| Message | append와 inline reply target 확정 |
| Closing | reflection 제출·수정·삭제·skip |
| Result | 실패한 공식 결과의 방장 수동 재시도 |
| Builder | Book/Pack Draft 생성, 항목·출처 편집/재생성, Review, Publish, Retire |

모든 중요 command는 Nest API를 통과하고 Postgres transaction에서 현재 actor, membership, phase/version, deadline와 idempotency를 다시 확인한다.

## 5. 동시성·idempotency·시간

### 5.1 Aggregate와 lock

- room/membership 변경은 대상 room 또는 capacity guard row를 잠근다.
- session 단계 변경은 `session_runs` row와 `phase_version`을 기준으로 직렬화한다.
- message는 session별 monotonic `seq_no`와 `(session, author, client_message_id)` unique로 중복을 막는다.
- reflection은 `(session, user)` unique와 revision으로 Closing 중 수정 경쟁을 처리한다.
- official result는 session unique이며 `READY` 이후 재생성·수정을 거절한다.

### 5.2 Timer transition

- DB의 UTC deadline과 server time만 authoritative하다.
- 7분에 반복 연장 판단을 열고, 방장이 연장하면 즉시 15분을 추가한다.
- 방장이 5분까지 응답하지 않거나 `마무리하기`를 선택하면 Synthesis로 전환한다.
- 토론 timer 0에서 최대 5분 Closing을 시작한다.
- 현재 접속 중인 실제 참여자 전원이 제출/skip하면 자동 조기 종료할 수 있지만 방장 전용 Closing 조기 마감 command는 만들지 않는다.
- Cron reconciler, API command와 worker retry가 동시에 실행돼도 expected phase/version으로 한 번만 전환한다.

### 5.3 Idempotency

- command idempotency key와 결과를 actor/command type 범위에 저장한다.
- 같은 key·같은 payload는 이전 결과를 반환하고 같은 key·다른 payload는 거절한다.
- 참가자 메시지는 `clientMessageId`를 idempotency key로 사용한다. 재시도 응답은 현재 최신 cursor가 아니라 해당 메시지가 처음 확정된 event cursor를 반환해 누락 이벤트를 소비한 것으로 오인하지 않게 한다.
- event, analytics fact와 queue enqueue는 상태 변경과 같은 transaction에 기록한다.
- job은 logical task key로 중복 실행되어도 같은 결과를 한 번만 commit한다.

## 6. Realtime, Presence와 복구

- committed public event만 DB trigger가 `session:{session_id}:v{channel_epoch}` private official topic으로 발행하고 client는 이 topic에 쓰지 못한다.
- Presence/typing은 같은 WebSocket 연결의 `session:{session_id}:v{channel_epoch}:ephemeral` private topic에서만 client read/write를 허용한다.
- event envelope은 `eventId`, `sessionId`, `aggregateVersion`, `occurredAt`, type과 public payload를 가진다.
- Broadcast는 전달 최적화이며 DB snapshot/cursor가 복구 원본이다.
- Presence/typing은 ephemeral UX이고 참가 등록·실제 참여·최소 인원·Closing 완료의 단독 근거가 아니다.
- 최소 시작 인원과 현재 접속자 기반 Closing 판단에는 durable `session_connections` heartbeat를 사용한다.
- 제거·탈퇴처럼 구독 권한을 즉시 폐기할 때는 `channel_epoch`을 갱신하고 새 private topic 재구독을 요구한다.
- reconnect snapshot에는 server time, phase/version/deadlines, membership/role, participant summary, last cursor, public discussion state와 active session의 현재 두 topic을 포함한다.
- 최초 sync는 최근 message 100개, cursor sync는 이후 message와 event 최대 200개, 과거 message page는 `beforeSeq` 기준 최대 50개를 순서 보존해 반환한다.
- Broadcast payload는 publish 직전 public Zod allow-list와 private canary guard를 통과한다.

## 7. Queue, worker와 failure 처리

### 7.1 Job 원칙

- Supabase Queues에 상태 변경과 같은 transaction으로 enqueue한다.
- worker는 bounded concurrency, visibility timeout/lease, retry/backoff와 poison job 분류를 사용한다.
- job payload에는 원문 content 대신 필요한 경우 안전한 DB reference와 version을 넣는다.
- 실행 전 권한·phase·input cursor freshness를 확인하고 stale job은 성공적인 suppression으로 기록한다.
- 외부 provider 호출과 DB commit 사이의 retry는 idempotent task key로 중복 output을 막는다.

### 7.2 주요 job

- Opening question 생성과 fallback
- PUBLIC evaluation·incremental Wiki patch·Topic Checkpoint, deterministic Policy와 필요한 Host 생성
- 제한된 AI_PRIVATE evaluation task
- Synthesis, Final Wiki와 official discussion record 생성
- Book Context Builder 조사·생성·검수 보조
- session deadline reconciliation, heartbeat expiry
- AI diagnostic log 만료, 계정 삭제 후 정리와 restore tombstone 처리

### 7.3 Degraded mode

- AI failure는 인간 message와 운영 command를 막지 않는다.
- Opening 실패는 기본 질문, 연장 의견 실패는 방장 직접 결정, Synthesis 실패는 안내 후 Closing으로 대체한다.
- official result 실패는 `FAILED` 상태와 방장 수동 재시도를 제공하되 성공 결과는 다시 만들지 않는다.
- incremental Wiki 실패는 마지막 committed version을 유지하고 다음 평가가 미처리 cursor를 포함한다.
- Final Wiki 실패는 세션 종료를 되돌리지 않고 동일 종료 cursor로 재시도한다.
- provider error 원문은 사용자나 일반 log에 노출하지 않는다.

## 8. AI orchestration과 privacy

### 8.1 논리적 pipeline

```text
public context builder
  → Evaluator / PUBLIC-lane Wiki contract
  → deterministic Policy(WAIT 포함, 단일 목표)
  → Host contract
  → freshness·privacy validation
  → committed public intervention
```

Evaluator, Policy, Host, Living Wiki와 record는 contract·version·저장 책임을 분리한다. 비용상 한 provider 호출을 공유해도 logical output과 검증은 합치지 않는다.

Living Wiki document/patch, evidence reference, optimistic commit, Topic Checkpoint, Final Wiki와 Raw Data retrieval은 `docs/AI_ENGINE_SPEC.md`를 구현 기준으로 사용한다.

### 8.2 AI_PRIVATE 경계

- 원문은 `private` schema에 분리하고 일반 session/message query가 join할 수 없게 한다.
- private 입력을 읽는 task는 PUBLIC-lane Wiki patch, Host text나 official record를 출력할 수 없는 schema를 사용한다.
- private-derived state는 작성자와 출처를 추론할 수 없는 내부 판단용 최소 정보만 허용한다.
- prompt/response 원문은 일반 log와 Sentry에 저장하지 않는다.
- public output/event/result는 synthetic canary와 금지 pattern을 검사한다.
- 외부 private LLM 처리는 보존 조건과 privacy gate를 통과하기 전까지 off 상태다.

### 8.3 Provider adapter

- `AiGateway`는 canonical task input/output, model alias, timeout와 usage만 노출한다.
- 초기 adapter는 OpenAI Responses API stateless Structured Outputs를 사용한다.
- provider-specific type과 SDK object를 application/domain에 전달하지 않는다.
- model/provider 변경은 고정 fixture의 live eval과 privacy gate를 통과한 뒤 alias로 승격한다.
- S5-8 OpenAI adapter는 `responses.parse`와 versioned Zod schema를 사용하며 `store: false`, 무도구·무stream·SDK 재시도 0으로 호출한다. Queue가 bounded retry를 소유하고 사용자-facing 결과는 검증·DB commit 전에는 게시하지 않는다.
- logical alias는 Evaluator/Checkpoint를 `gpt-5.6-luna` low, Opening/Host를 `gpt-5.6-terra` low에 연결한다. 실제 model, prompt/schema version, reasoning, latency와 usage 또는 안정된 failure code만 private 진단에 보존하고 입력·출력 원문은 provider 진단에 복제하지 않는다.

AI provider와 책 지식 provider는 다른 port다.

- `BookContextProvider`는 room에 고정된 exact Pack version을 canonical document/subset으로 조립한다.
- 신규 catalog와 달리 기존 room consumer는 고정한 Retired version도 읽을 수 있다.
- `SessionRawDataRetriever`는 exact id/seq, metadata/context-window와 선택적 semantic adapter를 같은 application contract 뒤에 둔다.
- live Evaluator/Host는 Builder artifact repository와 web search를 import하지 않는다.
- S5-3 구현의 `PublicContextRepository`는 worker 전용 `read_ai_public_*` 함수 뒤에서 session frame, seq window, exact message id와 PUBLIC prep만 반환한다. Worker role은 원본 table `SELECT` 권한이 없고 `AI_PRIVATE` body table을 조회할 수 없다.
- `PublicContextBuilder`는 base Wiki cursor 앞의 필요한 인접 원문, objective participant facts와 exact room-pinned Pack을 `public-context.v1`으로 검증한다. 한 번의 context가 200개 메시지를 넘으면 partial context를 만들지 않고 명시적으로 실패한다.
- S5-6 `PublicEvaluationService`는 `PUBLIC_EVALUATION | TOPIC_CHECKPOINT` job만 받아 context build → provider-neutral Evaluator port → schema/semantic/reference validation → S5-5 commit 순서를 고정한다.
- metric reason code는 7개 metric과 `LOW | MEDIUM | HIGH` 조합별 allow-list이며 총점은 만들지 않는다. Evaluator가 입력으로 받지 않은 reference, 다른 participant, 공개 대화와 연결되지 않은 Book Grounding, Wiki candidate와 모순되는 metrics/topic/entity projection은 commit 전에 거절한다.
- Closing에서는 Evaluator를 호출하지 않는다. provider가 설정되지 않은 worker는 evaluation을 성공으로 가장하지 않고 안전하게 suppress하며, provider·structured output·Wiki semantic 오류는 Queue의 bounded retry 대상으로 분류한다. 검증된 top-level Evaluation과 typed patch가 중복 표현하는 metrics/topic/관점/책 근거/참여 상태는 top-level을 canonical source로 결정적으로 맞추되, 누락 operation이나 새 의미는 만들지 않는다.
- 성공한 commit은 immutable `evaluation_id`를 함께 반환한다. 이 식별자는 S5-7 Policy correlation에 쓰며 Evaluator의 `suggestedAction` 자체를 Policy 결정으로 승격하지 않는다.
- Opening은 익명 PUBLIC prep과 exact Pack으로 짧은 입장 질문 하나를 생성한다. provider가 없거나 재시도 불가 또는 최종 attempt 실패이면 고정 기본 질문을 사용하며, session당 공개 효과는 한 번이다.
- Host context에는 non-WAIT Policy action, 공개 메시지·Wiki 상태와 필요한 Pack subset만 들어간다. action/attribution/Pack/cursor/reference/privacy 검증 뒤 worker-only commit 함수가 최신 phase/version/message cursor를 다시 확인한다. stale 결과와 자동 Host 실패는 참가자 메시지 흐름을 막지 않으며 실패 원문을 공개하지 않는다.
- Opening의 `TRANSITION` Host action은 AI 메시지와 함께 같은 transaction에서 authoritative phase를 `CORE`로 전환한다.
- S5-9 orchestration은 session 시작과 연장 window를 상태 변경 transaction 안에서 enqueue하고, participant message trigger와 10초 Cron이 message/participation/silence/topic 후보만 계산한다. Cron 안에서는 provider를 호출하지 않는다.
- `POST /v1/rooms/:roomId/session/ai-help`는 방장만 네 가지 고정 reason으로 호출할 수 있는 비동기 command다. one-in-flight와 idempotency를 보장하고 처리/실패 상태는 방장 snapshot에만 보인다. 연장 의견은 모든 참가자에게 `PENDING | READY | UNAVAILABLE`로 보이되 방장 결정을 대체하거나 차단하지 않는다.
- 동일 session의 active orchestration job, stable job key, active attempt fencing과 최대 3회 stale refresh가 중복·오래된 결과의 공개 효과를 막는다. worker는 60초 lease를 20초마다 DB/PGMQ에 함께 연장한다.

Book Context 저장·Provider·Builder의 상세 기준은 `docs/BOOK_CONTEXT_SPEC.md`를 따른다.

### 8.4 Deterministic Policy

- `DeterministicPolicyEngine`은 DB·provider 호출이 없는 pure TypeScript rule engine이며 committed evaluation, 평가 당시 PUBLIC context, trigger와 optional host-help reason만 입력받는다.
- 지표를 총점으로 합치지 않고 한 cycle에 `WAIT` 또는 정확히 하나의 목표만 만든다. Evaluator의 `suggestedAction`은 정책 권한이 없으며 결과에 영향을 주지 않는다.
- phase/cursor, explicit host help, extension decision, cooldown, confidence와 좋은 인간 흐름 보존을 metric 조합보다 먼저 적용한다. `Expansion HIGH + Relevance HIGH + Activity HIGH`이면 낮은 Book Grounding 등 다른 약한 신호가 있어도 `WAIT`다.
- LOW 지속 규칙은 base Wiki에 저장된 직전 7개 metric과 현재 committed evaluation을 비교한다. Relevance LOW 한 번, Participation Balance LOW 단독, 좋은 확장 중 Book Grounding LOW는 자동 개입을 만들지 않는다.
- 포화 상태는 한 문장에 여러 목표를 합치지 않고 평가 cycle별 `EXPAND → SUMMARIZE → TRANSITION`으로 진행한다.
- 자동 개입 cooldown 초기 실험값은 90초다. 마지막 committed intervention뿐 아니라 아직 Host 처리를 기다리는 최근 non-WAIT Policy action도 cooldown에 포함하며, 명시적 방장 도움 요청과 정해진 연장 의견은 이 제한을 우회한다.
- `PolicyApplicationService`는 현재 job/context와 persisted directive에서 `MESSAGE_BATCH | SILENCE | PARTICIPATION_THRESHOLD | TOPIC_DURATION | EXTENSION_DECISION | HOST_HELP` trigger를 정규화하고 결정과 evaluation correlation을 repository로 전달한다.
- `private.commit_policy_decision`은 worker active attempt, committed evaluation, Wiki version과 decision envelope을 확인한다. session row lock에서 phase/version과 latest message cursor가 평가 시점과 다르면 non-WAIT action을 저장하지 않고 safe suppression reason을 반환한다. 동일 evaluation replay는 같은 row를 반환하고 다른 결정으로의 재작성은 거절한다.

### 8.5 Living Wiki commit

- job은 `base_wiki_version`과 `target_through_seq`를 고정한다.
- typed patch는 stable item id와 공개 evidence reference만 허용한다.
- reference resolver가 session/Pack 소속, cursor 범위와 존재성을 검증한다.
- DB transaction에서 current Wiki version이 base와 같을 때만 새 version과 evaluation을 commit한다.
- stale base는 `SUPPRESSED_STALE_BASE`로 남기고 최신 cursor 기준 재실행 여부를 판단한다.
- patch validation 실패는 부분 적용하지 않으며 이전 Wiki를 유지한다.
- `FINAL` version은 session unique이고 official record retry가 이를 수정하지 않는다.
- S5-4 `LivingWikiPatchEngine`은 DB write가 없는 application engine이다. base 0 또는 검증된 current Wiki를 복제해 9종 typed operation을 적용하고, 최종 relation graph와 모든 PUBLIC reference가 유효할 때만 candidate document를 반환한다. 과거 topic의 coverage stable id는 checkpoint 이후에도 보존할 수 있다.
- remove는 없는 target을 성공으로 가장하거나 dangling relation을 cascade 삭제하지 않는다. session/base/cursor/FINAL lock, topic transition, relation, schema/private canary와 resolver 누락은 안전한 validation code로 patch 전체를 거절한다.
- S5-4 결과의 `documentChanged`와 `cursorAdvanced`는 후속 commit이 같은 document의 불필요한 재작성과 아직 반영하지 않은 cursor를 구분하기 위한 신호다.
- S5-5 `LivingWikiCommitService`는 `PUBLIC_EVALUATION | TOPIC_CHECKPOINT` job과 canonical Evaluator output의 Pack/base/cursor를 대조하고 검증된 candidate만 `LivingWikiRepository`로 전달한다.
- Postgres commit 함수는 active `attempt_no`와 lease를 fencing token으로 확인하고 session advisory transaction lock 안에서 current version을 다시 읽는다. fresh base만 Wiki version과 evaluation을 함께 commit하며 동일 job replay는 기존 결과를 반환한다.
- stale base는 Wiki를 쓰지 않고 `SUPPRESSED_STALE_BASE` evaluation으로 남긴다. 최신 cursor가 job target보다 뒤처진 경우에만 `shouldRequeue = true`를 반환하며 실제 enqueue 결정은 orchestration이 담당한다.
- 문서와 cursor가 모두 같은 incremental evaluation은 current Wiki version을 재사용해 version churn을 막는다. Topic Checkpoint는 실제 topic 전환과 이전 perspective·issue·coverage stable id 보존을 TypeScript와 DB 양쪽에서 검증한 뒤 명시적인 새 version으로 남긴다.

### 8.6 Raw Data retrieval

- 원본 message/prep/intervention은 immutable source로 유지한다.
- direct lookup과 reference 주변 seq window를 우선한다.
- 위치를 모르는 과거 논의는 session·visibility로 제한된 파생 Search Chunk에서 찾은 뒤 원본을 다시 조회한다.
- PUBLIC과 AI_PRIVATE는 table/repository/context/chunk를 분리한다.
- exact/metadata retrieval eval이 부족할 때만 `SessionRawDataRetriever` 뒤에 embedding semantic search를 추가한다.
- S5-3 reference resolver는 `MESSAGE | AI_INTERVENTION | PUBLIC_PREP | BOOK_CONTEXT_ITEM`을 batch materialize하며 session/room, `targetThroughSeq`, participant/AI message kind와 pinned Pack item을 모두 확인한다. Search Chunk·embedding은 이 interface 뒤의 후속 선택지로 남긴다.

## 9. 인증·보안·secret

- Supabase Auth email/password, email confirmation off와 PKCE reset을 사용한다.
- API는 asymmetric JWKS로 access token의 signature, issuer, audience, expiry를 검증한다.
- strict CORS, security header, request size/time limit와 content-type 검사를 적용한다.
- signup/login/reset에는 Turnstile과 Supabase rate limit, 방 password에는 actor-scoped Postgres limiter를 사용한다.
- 방 password는 unique salt의 Argon2id PHC string으로 저장하고 password version을 함께 갱신한다.
- raw password, token, email, content, AI_PRIVATE, IP를 일반 log에 남기지 않는다.
- frontend에는 publishable key만 제공한다. API의 secret client는 Argon2 hash 조회와 30초 join authorization 발급처럼 browser에 허용할 수 없는 최소 RPC에만 사용하고, 실제 membership command는 사용자 JWT의 `auth.uid()`로 다시 확정한다. worker/admin/deletion secret 경로와 application module을 분리한다.
- command payload fingerprint는 server-only `COMMAND_FINGERPRINT_KEY` HMAC으로 만들며 password 원문이나 단순 빠른 hash를 receipt에 저장하지 않는다.
- GitHub는 AWS OIDC를 사용하며 runtime, migration, backup credential을 서로 분리한다.
- secret scanner와 web artifact/Docker context 검사를 CI release gate에 둔다.

## 10. Observability와 product fact

- `SafeLogger`는 allow-list JSON field만 stdout으로 기록하고 request/command/job correlation id를 전달한다.
- route template, latency, status, release/environment와 coarse capacity만 기술 telemetry로 남긴다.
- Sentry는 exception만 수집하고 request body, PII, prompt/response와 private context를 scrub한다.
- authoritative product event는 domain transaction에서 event/command id로 deduplicate한다.
- 다음 관계를 연결할 수 있어야 한다.

```text
evaluation → policy action/WAIT → intervention/suppression
  → subsequent public message window → observable session outcome
```

- Discussion Metrics는 참가자/방장에게 노출하지 않고 하나의 총점으로 합치지 않는다.
- GA로 보낼 coarse funnel은 frontend adapter가 담당하며 server fact는 GA의 진실 원본으로 대체하지 않는다.

## 11. 서버 테스트

### 11.1 PR gate

- lint, typecheck, API/worker production build
- Vitest session machine, Policy, privacy와 application unit test
- local Supabase migration reset와 generated type drift
- pgTAP constraints, RLS, grant와 command function test
- fake AI provider의 structured contract/integration test
- API/worker integration과 핵심 Playwright multi-user smoke 지원

### 11.2 출시 차단 회귀

- 이메일·프로필 생성 원자성, JWT/RLS와 role 권한
- password 참가와 정원 15명 race, 최소 시작 인원 heartbeat
- room 설정·취소·권한 이전·내보내기 경쟁
- message idempotency, sequence, reply와 종료 경계
- 7/5/0분, 반복 연장, 종료와 Cron 동시 실행
- Closing reflection revision/skip/timeout과 공식 종료
- AI failure fallback, WAIT와 단일 행동 목표
- AI_PRIVATE가 Host, PUBLIC-lane Wiki/result/event/log에 누출되지 않음
- Wiki reference 존재성·cursor·session/Pack 소속과 private variant 거절
- stale base patch 억제, atomic reject와 마지막 committed Wiki 보존
- Topic Checkpoint의 이전 관점 보존과 session-unique Final Wiki
- official result `READY` 이후 불변성
- 탈퇴 후 private 삭제·공동 기여 익명화와 restore tombstone 재적용
- Pack 7개 section/item/source/evidence 관계와 부족·충돌 상태 보존
- Published Pack 불변성, atomic Publish/Retire와 room의 Retired exact-version Provider 조회

privacy, 무권한 접근, 공식 결과 불변성, 중복 확정과 탈퇴 후 private 잔존은 허용 임계값 없이 release를 차단한다.

## 12. 성능·부하·용량

- read/command 서버 p95 400/500ms, message ack p95 500ms, reconnect snapshot p95 2초를 초기 budget으로 측정한다.
- AI Opening/Host p95 12초, record p95 60초를 목표로 하되 timeout과 failure가 세션을 막지 않는다.
- index와 query plan은 100개 최근 message snapshot과 cursor 50개 pagination 기준으로 검증한다.
- PR은 10명 smoke, release는 60명 30분 normal, 100명 10분 stress와 단일 방 15명 burst를 fake AI로 수행한다.
- k6 HTTP와 Supabase Realtime harness의 threshold·synthetic cleanup·report를 version control한다.
- 120 connection/limit 60% warning, 160/주요 quota 80%, DB 400MB, 지속 backlog와 반복 p95 실패를 scale/Pro 검토 trigger로 사용한다.

## 13. Lightsail 배포와 데이터 운영

- 동일 image/Git SHA에서 public API와 non-public worker를 서로 다른 command로 실행한다.
- API readiness와 worker heartbeat를 분리한다.
- 배포는 backward-compatible DB expand → API/worker → web → smoke 순서다.
- production DB에 down migration을 자동 적용하지 않고 application rollback 뒤 forward-fix한다.
- production data 생성 시점부터 일일·migration 직전 Supabase 논리 dump를 S3 서울 private bucket에 암호화해 30일 보관한다.
- RPO 24시간, RTO 8시간을 내부 목표로 하며 공개 전과 분기별 restore drill을 실시한다.
- Free project pause, DB size, Realtime/Queue quota와 backup age를 감시한다.
- release manifest에 Git SHA, image/deployment version, migration head, contract version과 AI alias를 기록한다.

## 14. Vertical slice별 서버 산출물

현재 구현 상태(2026-09-02): Slice 0~8의 MVP 서버 범위가 완료되었다. Slice 6은 Synthesis, 5분 Closing, 개인 reflection, Final Wiki와 불변 Discussion Record를 durable Queue에 연결했다. Slice 7은 Book Context의 7단계 Builder, web research, Draft/Review/Publish Gate, 재생성 proposal과 Admin API를 구현했다. Slice 8은 current-password 계정 탈퇴, AI_PRIVATE 삭제·공동 기여 익명화, Auth hard-delete recovery, 37일 restore tombstone, 90일 AI 진단 purge와 운영 배포·backup/restore 자산을 구현했다. API와 worker는 같은 container image에서 독립 command로 실행되고 API readiness와 worker heartbeat를 분리한다.

Slice 6~8 검증(2026-09-02): `pnpm check`의 lint/typecheck/unit/build에서 code test 259개(contracts 45, domain 10, server 189, web 15)가 통과했고, local migration reset 뒤 24개 SQL file의 pgTAP 695개 assertion이 통과했다. 실제 model eval은 Evaluator·Opening·Host, Synthesis·Discussion Record와 Builder research·draft를 검증했다. Builder는 web research 7개 출처·22개 claim에서 7개 section·22개 item·28개 evidence link를 만들고 canonical 검증을 통과했다. Node 24.18 Docker image build와 API live/ready, worker SIGTERM graceful shutdown smoke도 통과했다. 원문은 eval 출력이나 진단 로그에 남기지 않았다.

Slice 5-3 검증(2026-09-02): `pnpm check`의 lint/typecheck/unit/build가 통과했고 code test는 contracts 41개, domain 10개, server 74개, web 12개다. local migration reset 후 전체 15개 SQL test file, 452개 pgTAP assertion이 통과했다.

Slice 5-4 검증(2026-09-02): first Wiki, operation별 upsert/remove, operation 순서 독립 관계 해석, dangling relation·없는 remove target·잘못된 transition·base/session/cursor/FINAL·private canary·reference failure/누락·24개 초과 batch와 base 불변성을 테스트했다. `pnpm check`의 code test는 contracts 41개, domain 10개, server 87개, web 12개이며 전체 15개 SQL file, 452개 pgTAP assertion도 다시 통과했다.

Slice 5-5 검증(2026-09-02): fresh/first commit, 동일 job replay, immediate predecessor, no-change version 재사용, stale base 승자 보존과 cursor별 requeue 판단, checkpoint 이력 보존, 잘못된 checkpoint atomic reject, stale worker attempt fencing을 검증했다. `pnpm check`의 code test는 contracts 41개, domain 10개, server 97개, web 12개이며 전체 16개 SQL file, 494개 pgTAP assertion이 통과했다.

Slice 5-6 검증(2026-09-02): fake Evaluator incremental lifecycle, metric별 reason code, 낮은 Book Grounding과 좋은 확장의 공존, context 밖 reference·foreign participant·private canary·불완전 materialization 거절, Book Grounding 토론 연결, Evaluator/Wiki 모순, Closing suppression, stale requeue 전달과 worker retry 분류를 검증했다. `pnpm check`의 code test는 contracts 41개, domain 10개, server 116개, web 12개이며 전체 17개 SQL file, 500개 pgTAP assertion이 통과했다.

Slice 5-7 검증(2026-09-02): 좋은 흐름의 `WAIT`, Evaluator suggested action 무시, Relevance/Depth/Expansion 지속성, 낮은 Book Grounding 단독 복귀 금지, 높은 Saturation 속 Expansion 유지, 조용한 순간의 참여 초대, saturation 단계화, 연장 의견, 방장 도움의 non-WAIT 보장, 90초 cooldown과 Policy 실패의 fail-closed를 pure fixture로 검증했다. DB에서는 evaluation당 단일 immutable action, 동일 replay, worker function 권한, active attempt와 message cursor/phase version race suppression을 확인했다. `pnpm check`의 code test는 contracts 41개, domain 10개, server 139개, web 12개로 총 202개이며 전체 18개 SQL file, 520개 pgTAP assertion이 통과했다.

Slice 5-8 검증(2026-09-02): Responses 요청의 model alias·reasoning·`store: false`·Structured Output·usage/error mapping, SDK import 격리, Opening fallback/retry와 Host schema/reference/privacy gate를 unit fixture로 검증했다. DB에서는 worker-only 권한, provider 진단 불변성, Opening idempotency와 attribution, Host 최신성 억제, 실패의 content-free 기록, Opening→Core 원자 전환을 확인했다. `pnpm check`의 code test는 contracts 43개, domain 10개, server 156개, web 12개로 총 221개이며 전체 19개 SQL file, 560개 pgTAP assertion이 통과했다. `pnpm eval:ai:live`의 실제 alias 고정 eval도 통과했다. Luna Evaluator는 25,407ms와 input/output 10,137/2,682 tokens, Terra Opening은 3,695ms와 1,375/175 tokens, Terra Host는 2,929ms와 2,832/174 tokens를 사용했다. 출력 원문은 기록하지 않았고 각 결과는 기존 schema/semantic/reference/privacy gate를 통과했다. 별도 합성 Queue smoke에서는 Opening job이 첫 attempt에 `fallbackUsed=false`로 처리되어 provider run·Opening·public message·event를 각각 한 건만 확정했고 동일 job key replay는 duplicate로 반환됐다.

Slice 5-9 검증(2026-09-02): 시작 Opening, 4-message batch, 실제 참가자의 60% 이상 고유 발언자, 60초 침묵, 8분 의제 지속, 7분 연장 window와 방장 도움의 enqueue·중복·권한·idempotency·cooldown·역할별 snapshot을 pgTAP으로 검증했다. provider 부재에서는 방장 요청이 안전한 `FAILED`, 연장 의견이 `UNAVAILABLE`이면서 대화·방장 결정은 유지된다. `pnpm check`의 code test는 contracts 45개, domain 10개, server 169개, web 13개로 총 237개이며 migration reset 뒤 전체 20개 SQL file, 596개 pgTAP assertion이 통과했다. 실제 OpenAI Queue E2E에서는 transient provider 실패를 Queue가 재시도한 뒤 Luna Evaluator v2, Wiki, `HOST_HELP/DEEPEN` Policy, Terra Host가 두 번째 attempt에 성공했다. immutable intervention과 공개 AI Host message는 각각 한 건이며 방장 상태는 `SUCCEEDED`, 일반 참가자 상태는 `null`, 합성 private canary는 비노출이었다.

구조 정리(2026-09-02): Room HTTP contract는 유지하면서 application 책임을 query, membership, administration, prep service로 분리했다. 각 service는 feature-local의 좁은 Gateway token만 주입받고, Supabase RPC adapter는 공유 구현체로 조립한다. DB row Zod 검증·public model mapping과 public error mapping은 각각 별도 infrastructure/application boundary로 분리해 S4 session 상태 머신 추가가 Room의 넓은 service나 DB row type에 결합되지 않게 했다.

Slice 4 검증(2026-09-02): pure domain fake-clock test, contract/Nest unit test, client control test와 pgTAP을 함께 둔다. pgTAP은 7/5/0분 및 Closing 만료, 반복 연장, 같은 command 재시도·payload mismatch, stale phase 경쟁, 방장 권한, 강제 종료 후 connection 차단, active join·방장 이전·내보내기·topic epoch 회전을 검증한다. local DB reset 후 전체 13개 SQL test file, 362개 assertion이 통과한다.

| Slice | 서버 산출물 | 프론트/공통 전달물 |
| --- | --- | --- |
| 0 | Nest API/worker, local Supabase, migration/RLS skeleton, health/log/CI/deploy | environment schema, public error와 base contract |
| 1 | Auth 설정, profile trigger/RLS·command, reset SMTP/Turnstile | auth/profile contract와 deterministic fixture |
| 2 | Book catalog + Pack content/provider foundation, room/membership schema와 atomic commands | catalog/Pack fixture, search/snapshot/join conflict contract |
| 3 | message append, sequence, private Broadcast, heartbeat/snapshot | message/event/cursor fixture와 Realtime harness |
| 4 | session machine, deadline/Cron, 연장·종료·관리 commands | phase/deadline/event contract와 fake clock fixture |
| 5 | evaluator/Policy/Host, versioned Wiki/checkpoint/retrieval jobs와 privacy gate | public AI event/state, internal Wiki contract와 fallback fixture |
| 6 | Synthesis/Closing/reflection/Final Wiki/result jobs와 immutable query | closing/result state와 retry error contract |
| 7 | Book Context Builder stages, evidence review, Publish Gate와 audit | admin catalog/workflow/validation contract |
| 8 | 탈퇴·익명화·만료, backup/restore와 운영 강화 | deletion state와 전체 E2E fixture |

각 slice에서 frontend가 server 없이 사용할 수 있는 fixture와 fake adapter input을 먼저 합의한다. 서버 구현이 완료되면 같은 fixture를 실제 controller/event contract test에서도 parse해 drift를 막는다.

## 15. 서버 완료 기준

- API와 worker가 같은 codebase에서 독립 build·실행·health check된다.
- SQL migration이 schema의 유일한 원본이고 local reset·pgTAP·RLS test가 통과한다.
- 중요한 mutation이 server command와 versioned transaction을 거쳐 한 번만 확정된다.
- Realtime 손실·중복·순서 변경 후에도 snapshot/cursor로 수렴한다.
- AI failure가 인간 대화·운영·종료를 차단하지 않는다.
- `AI_PRIVATE`가 storage, import, context, LLM task, output, event와 log 계층에서 격리된다.
- Living Wiki reference/version/checkpoint/Final consistency와 Raw Data source-of-truth 규칙이 회귀 test로 고정된다.
- Pack item/source/evidence, Provider exact version, official result, 탈퇴·익명화와 보관 규칙이 회귀 test로 고정된다.
- Lightsail artifact, migration, secret, backup/restore와 rollback runbook이 준비된다.
- `docs/TECHNICAL_PLAN.md`의 해당 slice E2E 완료 기준을 frontend와 함께 통과한다.
