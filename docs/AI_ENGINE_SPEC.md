# 책은양념 MVP AI Engine 명세

> Status: Accepted technical specification  
> Product source of truth: `PRODUCT_SPEC.md` §6~§17  
> Shared technical baseline: `docs/TECHNICAL_PLAN.md`  
> Backend implementation: `docs/BACKEND_PLAN.md`  
> Related decisions: `docs/DECISIONS.md` TECH-007, TECH-008, TECH-023  
> Last updated: 2026-09-02

## 0. 목적과 우선순위

이 문서는 Evaluator, deterministic Policy, AI Host, Living Wiki, Raw Data retrieval과 Final Wiki의 구현 계약을 정의한다. 제품 행동은 `PRODUCT_SPEC.md`가 우선하며 이 문서는 저장 방식, version/cursor, validation, concurrency와 테스트 기준을 구체화한다.

이 문서를 읽어야 하는 작업:

- AI 평가·개입·Opening·Synthesis·공식 기록 구현
- Living Wiki schema, repository, job 또는 migration 변경
- 세션 Raw Data retrieval·검색·색인 변경
- `AI_PRIVATE` context 경계 변경
- AI contract, fixture 또는 eval 변경

이 문서의 **PUBLIC-lane Wiki**는 PUBLIC 원본만으로 설명 가능한 내부 Wiki를 뜻한다. 참가자에게 Wiki 전체를 공개한다는 의미가 아니다. 브라우저에는 current topic, 확정 AI intervention처럼 별도로 검증된 참가자용 projection만 전달한다.

## 1. 불변조건

1. 좋은 인간 대화에서 `WAIT`는 정상 결과다.
2. 7개 Discussion Metrics는 독립적으로 보존하며 총점 하나로 대체하지 않는다.
3. Policy는 한 판단 주기에 원칙적으로 하나의 행동 목표만 선택한다.
4. Evaluator는 관찰하고 Policy가 행동을 결정하며 Host만 참가자용 문장을 생성한다.
5. Raw Data는 수정할 수 없는 사실 원본이고 Living Wiki는 교체 가능한 해석이다.
6. PUBLIC-lane Wiki의 모든 주요 해석은 가능한 범위에서 원본 reference로 재검증할 수 있어야 한다.
7. `AI_PRIVATE` 원문·요약·topic·작성자 reference는 PUBLIC-lane Wiki, Host, 공식 기록과 public event에 존재할 수 없다.
8. 참가자의 공개 발언 변화를 관찰할 수는 있지만 내적 생각의 변화를 단정하지 않는다.
9. Wiki·AI 실패가 인간 채팅, 방장 명령, 타이머와 공식 종료를 막아서는 안 된다.
10. Final Wiki와 성공한 공식 기록은 자동 AI 재실행으로 변경하지 않는다.

## 2. 논리적 실행 흐름

```text
authoritative Raw Data + session state + exact Pack version
  → Public Context Builder
  → Evaluator result + typed Living Wiki patch
  → patch/reference/privacy validation
  → versioned Wiki commit
  → deterministic Policy
      ↘ WAIT
      ↘ one action → Host Context Builder → AI Host
                     → freshness/privacy validation
                     → committed intervention message
```

비용을 줄이기 위해 Evaluator 결과와 PUBLIC-lane Wiki patch를 한 provider 호출에서 받을 수 있다. 그러나 입력 builder, output schema, validation, 저장과 실패 처리는 논리적으로 분리한다. Evaluator 출력이 유효해도 Wiki patch가 유효하지 않으면 이전 Wiki를 유지하며, Wiki가 갱신됐다고 해서 반드시 Host를 호출하지 않는다.

## 3. Canonical reference

Living Wiki와 AI 평가가 사용하는 reference는 자유 문자열이 아니라 allow-list된 구조로 표현한다.

```ts
type PublicEvidenceRef =
  | { type: "MESSAGE"; messageId: string; seqNo: number }
  | { type: "PUBLIC_PREP"; prepAnswerId: string }
  | { type: "AI_INTERVENTION"; messageId: string; seqNo: number }
  | { type: "BOOK_CONTEXT_ITEM"; packVersionId: string; itemId: string };
```

규칙:

- reference가 가리키는 원본은 같은 세션 또는 방에 고정된 Pack 버전에 속해야 한다.
- message reference의 `seqNo`는 해당 Wiki 버전의 `basedThroughSeq`를 넘을 수 없다.
- 삭제·익명화가 발생해도 공동 기록의 reference 식별자는 유지하고 사용자 identity와 분리한다.
- PUBLIC contract에는 private prep, private evaluation 또는 private participant-state reference variant를 만들지 않는다.
- 화면이나 Host prompt에 reference 전체를 그대로 노출하지 않고 필요한 공개 원문만 별도 allow-list query로 해석한다.

## 4. Public Evaluator contract

### 4.1 입력

- session과 현재 phase/version/deadline
- 평가 대상 `targetThroughSeq`
- 마지막 확정 Wiki의 version과 `basedThroughSeq`
- 이후 확정된 PUBLIC 메시지 묶음과 필요한 주변 문맥
- PUBLIC 사전 입력
- 방에 고정된 정확한 Published/Retired Pack version에서 Provider가 반환한 Book Context
- 현재 참석·활성·최근 발언·침묵 시간 같은 객관적 session metrics
- 최근 Policy action, cooldown과 host-request 여부

### 4.2 출력

- 7개 metric의 `LOW | MEDIUM | HIGH`, reason code와 evidence reference
- 로그를 위한 짧은 `summaryState`
- 현재 실제 논점과 주요 관점
- 토론에서 실제 사용된 book evidence
- 객관적·의미론적 participation 관찰
- `interventionNeed` 보조 신호와 confidence
- Policy 참고용 suggested action
- `LivingWikiPatchV1`

suggested action은 정책 결정이 아니다. 최종 action은 TypeScript Policy가 privacy, phase, cooldown, 현재 상태와 freshness를 적용해 결정한다. Evaluator는 참가자-facing 문장을 출력하지 않는다.

## 5. Living Wiki document

### 5.1 버전 envelope

```ts
type LivingWikiVersionV1 = {
  sessionId: string;
  version: number;
  kind: "INCREMENTAL" | "TOPIC_CHECKPOINT" | "FINAL";
  baseVersion: number | null;
  basedThroughSeq: number;
  schemaVersion: "living-wiki.v1";
  document: LivingWikiDocumentV1;
  createdAt: string;
};
```

모델명, prompt version, job/attempt와 token usage는 해석 문서가 아니라 private diagnostic metadata에 저장한다. public document가 provider 실행 세부사항에 결합되지 않게 한다.

### 5.2 7개 섹션

| 섹션 | 필수 구조 | 금지 사항 |
| --- | --- | --- |
| Current Topic | 현재 논점·질문, 이전 논점과의 변화, evidence refs | 준비된 agenda를 실제 논점으로 가장 |
| Perspective Map | stable perspective id, 요지, 근거, 충돌·보완 관계 | 복수 관점을 하나의 합의로 평탄화 |
| Book Grounding | 공개 발언과 연결된 책 문장·장면·인물·주장, Pack item ref | 책에 없는 내용을 사실처럼 생성 |
| Issue & Question Map | 핵심 쟁점, 열린 질문, 상태와 관련 관점 | AI의 정답·결론 저장 |
| Coverage | `UNEXPLORED | PARTIAL | EXPLORED`, 판단 근거 | 단순 메시지 수만으로 충분함 판정 |
| Participant State | 공개적으로 표현된 관점·근거, 참석·최근 발언 상태 | 내적 신념 추론, AI_PRIVATE 파생 내용 |
| Metrics & Key Changes | 독립 metric, summary, 공개 발언으로 확인된 변화 | 총점, 근거 없는 심리 변화 |

각 collection item은 Wiki 버전 사이에서 가능한 한 stable id를 유지한다. 관계는 item id로 연결하고 문장 위치나 배열 index에 의존하지 않는다.

### 5.3 typed patch

`LivingWikiPatchV1`은 임의 JSON Patch가 아니라 섹션별 allow-list operation으로 제한한다.

- `SET_CURRENT_TOPIC`
- `UPSERT_PERSPECTIVE` / `REMOVE_PERSPECTIVE`
- `UPSERT_BOOK_GROUNDING` / `REMOVE_BOOK_GROUNDING`
- `UPSERT_ISSUE_OR_QUESTION` / `UPDATE_COVERAGE`
- `UPSERT_PUBLIC_PARTICIPANT_STATE`
- `SET_METRICS_AND_KEY_CHANGES`

각 operation은 `baseVersion`, stable item id와 evidence refs를 가진다. validator는 schema, 길이, reference 존재성, session/Pack 소속, cursor 범위, relation target, private variant 부재와 금지 표현을 확인한다. validation 실패 시 부분 적용하지 않고 patch 전체를 거절한다.

## 6. 업데이트와 concurrency

### 6.1 Incremental cycle

1. trigger가 `targetThroughSeq`를 고정하고 idempotent evaluation job을 enqueue한다.
2. worker는 마지막 committed Wiki와 `basedThroughSeq + 1 ... targetThroughSeq`의 새 PUBLIC 메시지를 읽는다.
3. 필요한 exact/context Raw Data와 Book Context를 추가한다.
4. Evaluator result와 typed patch를 생성·검증한다.
5. transaction에서 current Wiki version이 job의 `baseVersion`과 같은지 다시 확인한다.
6. 같으면 새 Wiki version과 evaluation을 함께 commit한다.
7. 다르면 오래된 결과를 덮어쓰지 않고 `SUPPRESSED_STALE_BASE`로 남긴 뒤 최신 cursor 기준 재평가 필요 여부를 판단한다.
8. committed evaluation만 Policy 입력이 될 수 있다.

동일한 `(session_id, target_through_seq, task_schema_version)`은 한 번만 사용자-visible effect를 만든다. provider 호출은 retry로 중복될 수 있지만 Wiki version, Policy action과 intervention commit은 unique key로 중복을 막는다.

### 6.2 운영 이벤트

침묵, 종료 임박, 연장 판단처럼 새 대화가 없는 이벤트는 기존 Wiki를 사용해 Evaluation만 만들 수 있다. 새로운 근거가 없다면 동일한 Wiki document를 불필요하게 다시 쓰지 않는다.

### 6.3 Topic Checkpoint

Policy가 실제 topic 전환을 확정하거나 새 논점이 명확히 형성되면 관련 Raw Data와 현재 Wiki를 다시 대조한다. 보정 결과는 `TOPIC_CHECKPOINT` version으로 저장하고 이전 topic의 쟁점·관점·coverage를 지우지 않은 채 현재 topic pointer를 이동한다.

### 6.4 Final Wiki

세션 종료 job은 latest Wiki만 신뢰하지 않는다.

1. 전체 topic checkpoint와 reference가 가리키는 Raw Data를 다시 읽는다.
2. 미검증 관계, 존재하지 않는 reference, 근거 없는 변화 주장을 제거·보정한다.
3. 공개 원본만으로 설명 가능한 `FINAL` version을 한 번 확정한다.
4. 공식 토론 기록은 Final Wiki와 필요한 Raw Data를 입력으로 별도 생성·검증한다.

`FINAL`은 session당 하나만 허용한다. 결과 생성 retry는 Final Wiki를 다시 쓰지 않고 동일한 Final version을 입력으로 사용한다.

## 7. Raw Data retrieval

### 7.1 조회 우선순위

1. 대상을 아는 경우 ID, seq, participant, time, topic으로 직접 조회한다.
2. reference 주변 문맥은 같은 session의 인접 seq 범위로 조회한다.
3. 위치를 모르는 과거 논의는 session과 visibility를 먼저 제한한 뒤 파생된 대화 묶음을 검색한다.
4. 검색 결과는 chunk 요약이 아니라 연결된 원본 메시지와 필요한 주변 문맥으로 materialize한다.

### 7.2 Search Chunk

원본 저장 단위는 항상 개별 message다. Search Chunk는 retrieval을 위한 재생성 가능한 파생 index다.

- 초기 실험 단위: 약 4~8개 메시지 또는 300~700 token
- 초기 overlap: 1~2개 메시지
- 종료 후보: topic 전환, Host 새 의제, 대화 중단, 최대 크기
- metadata: session, first/last seq, message ids, participant ids, topic hint, time range, visibility
- PUBLIC과 AI_PRIVATE는 하나의 chunk에 함께 들어갈 수 없음

숫자는 correctness contract가 아니라 eval로 조정하는 실험값이다. 첫 구현은 exact/metadata/context-window retrieval을 우선한다. 위치를 모르는 과거 논의의 recall이 고정 eval을 통과하지 못할 때 같은 `SessionRawDataRetriever` 뒤에 embedding semantic search를 활성화한다. BM25/Hybrid Search는 semantic retrieval의 실제 품질 문제가 확인되기 전에는 추가하지 않는다.

## 8. AI_PRIVATE lane

- PUBLIC Evaluator와 PUBLIC-lane Wiki builder는 PUBLIC 원본만 조회한다.
- AI_PRIVATE 원문은 `private` schema와 전용 repository/context builder/task에서만 읽는다.
- Private Evaluator는 자유 텍스트를 출력하지 않고 `unspokenPerspectiveExists`와 제한된 intervention opportunity enum만 저장한다.
- private task는 PUBLIC-lane Wiki patch, Host text, 공식 기록 또는 public event를 같은 호출에서 출력할 수 없다.
- private-derived signal은 Policy의 일반 action으로 변환된 뒤에만 의미가 있으며 Host는 signal 자체를 받지 않는다.
- MVP 첫 출시는 private LLM lane을 off로 유지한다. 보존 설정, provider allow-list, canary와 privacy eval을 통과해야 활성화한다.

## 9. Host와 freshness

Host 입력 allow-list:

- Policy가 고른 단일 action과 공개 reason/reference
- 최신 PUBLIC 메시지와 필요한 공개 주변 문맥
- current PUBLIC-lane Wiki의 필요한 section
- 방에 고정된 Pack version에서 Provider가 반환한 필요한 Book Context
- 출력 길이·어조·비단정·비지목 규칙

생성 후 commit 직전에 session phase, latest seq, action idempotency, Activity 회복, private canary와 forbidden pattern을 확인한다. 입력 cursor 이후 새 대화로 개입 필요가 사라졌으면 `SUPPRESSED_STALE`로 기록하고 게시하지 않는다.

## 10. 장애와 degraded mode

- Evaluation 실패: 마지막 Wiki 유지, 인간 대화 계속, retry budget 안에서 재시도
- Wiki patch 실패: evaluation diagnostic은 남길 수 있으나 patch는 부분 적용하지 않음
- Policy 실패: `WAIT`로 취급하고 사용자-facing 오류를 만들지 않음
- 자동 Host 실패: 인간 대화 계속, 참가자-facing thinking indicator 없음
- Opening 실패: 검증된 기본 질문 사용
- Synthesis 실패: 안내 후 Closing 전환
- Final Wiki 실패: 종료 상태는 유지하고 결과 job을 재시도
- 공식 기록 실패: 기존 Final Wiki를 유지하고 제품 규칙에 따라 방장 재시도 제공

## 11. Observability

다음 관계를 content 원문 없이 연결할 수 있어야 한다.

```text
trigger + input cursor
  → evaluation id + metric/reason codes
  → wiki base/new version + validation result
  → policy action or WAIT + suppression reason
  → intervention id/message seq
  → 다음 evaluation의 metric/change
```

일반 로그에는 message/prep 원문, prompt/response 전체, Wiki 본문과 participant-state 내용을 남기지 않는다. job id, schema/prompt/model version, cursor, latency, token usage, validation/error class와 suppression reason만 허용한다.

## 12. 필수 테스트와 eval

### Deterministic

- stale base patch가 최신 Wiki를 덮어쓰지 않음
- 존재하지 않거나 cursor 이후인 reference 거절
- 다른 session/Pack reference 거절
- private reference variant와 canary가 PUBLIC-lane Wiki/Host/record에서 거절됨
- patch 일부가 잘못됐을 때 전체 atomic reject
- 주제 전환 checkpoint가 이전 perspective/issue를 소실하지 않음
- Final Wiki session unique와 결과 retry 시 불변
- Policy의 `WAIT`, 단일 action, metric 조합 회귀

### AI fixture/eval

- 같은 관점의 반복을 새로운 perspective로 과다 생성하지 않음
- 충돌하는 관점을 거짓 합의로 합치지 않음
- 공개 발언 변화와 내적 생각 변화를 구분함
- Book Grounding LOW지만 Relevance/Expansion이 높은 흐름을 방해하지 않음
- 근거가 부족하면 reference 없는 사실을 만들지 않음
- exact/context retrieval로 오래된 근거를 찾는 사례와 찾지 못해야 하는 사례
- Host가 internal metric, private source 또는 단일 정답을 발화하지 않음

## 13. 구현 순서

Slice 5는 아래 단위로 하나씩 구현하고 각 단계의 deterministic gate를 통과한 뒤 다음 단계로 진행한다.

1. **S5-1 — 내부 contract와 fixture (완료, 2026-09-02):** `packages/contracts/internal`에 PUBLIC evidence ref, 7개 독립 metric, Evaluation, 7-section Wiki document/typed patch/version, 단일 Policy action, Opening·Host·연장 의견 contract와 합성 fixture를 정의했다. PUBLIC reference union에는 private variant가 없고 strict schema와 synthetic private canary로 evaluator·Wiki·Host의 명시적 누출 경계를 고정했다.
2. **S5-2 — AI job과 저장 기반 (완료, 2026-09-02):** `ai-session`, `ai-record`, `book-builder` logged Queue와 private `ai_job_runs`/attempt, Living Wiki version, evaluation, Policy action, intervention 저장 기반을 추가했다. queue envelope은 job/session id와 type/cursor/version만 허용하며 unique `job_key`, function-level worker role, claim/visibility lease/연장, bounded concurrency 2, exponential backoff+jitter, stale attempt 차단, terminal archive와 poison 분류를 구현했다. Kysely+`pg` worker adapter는 `WORKER_DATABASE_URL`로만 direct DB에 연결하고 실제 AI handler가 없는 동안 작업을 성공으로 가장하지 않고 `S5_HANDLER_NOT_CONNECTED`로 suppression한다.
3. **S5-3 — Public Context Builder와 Raw Data 조회 (완료, 2026-09-02):** `public-context.v1`은 고정 cursor의 session/phase/deadline, exact base Wiki, PUBLIC message/prep, 객관적 참여·heartbeat·최근 발언 사실, 최근 Policy action과 마지막 확정 개입 시각, room-pinned exact Pack을 하나의 strict contract로 조립한다. Worker는 table `SELECT` 없이 `private.read_ai_public_*` 보안 함수만 실행하며, PUBLIC prep query는 `visibility = 'PUBLIC'` projection으로 AI_PRIVATE row/body를 제외한다. `PublicContextRepository`는 seq window와 exact ID 조회를 제공하고, `PublicEvidenceReferenceResolver`는 같은 session/room, cursor, message kind와 Pack/item 소속을 검증한 뒤 원문을 materialize한다. PUBLIC 모듈의 AI_PRIVATE repository import 금지, private canary, 다른 session/미래 cursor/Pack mismatch를 contract·unit·pgTAP으로 고정했다. 현재 context window는 새 범위 앞 6개 메시지를 포함하고 200개를 넘으면 조용히 자르지 않고 실패한다. Search Chunk와 semantic retrieval은 아직 추가하지 않는다.
4. **S5-4 — Living Wiki 기본 엔진 (완료, 2026-09-02):** `LivingWikiPatchEngine`은 base 0의 첫 Wiki와 기존 Wiki에 9종 allow-list operation을 적용해 commit 전 candidate를 만든다. patch/operation `baseVersion`, session, exact `targetThroughSeq`, cursor 비역행과 FINAL 잠금을 먼저 검증하고, 삭제 target이 없거나 topic 전환 출처가 현재 topic이 아니면 거절한다. 모든 operation을 적용한 최종 상태에서 perspective relation, Book Grounding/issue 연결과 perspective·issue coverage target을 검증하므로 뒤 operation에서 추가되는 stable id는 허용하지만 dangling relation을 자동 cascade로 숨기지 않는다. TOPIC coverage의 stable id는 checkpoint 뒤에도 이전 topic의 탐색 상태를 보존할 수 있다. patch와 최종 문서의 PUBLIC reference를 중복 제거해 24개씩 resolver로 materialize하고 누락 응답도 실패로 처리한다. 어느 단계든 실패하면 candidate를 반환하지 않고 base 객체를 변경하지 않는다. 결과는 document 변경과 cursor 전진을 구분한다.
5. **S5-5 — Wiki 동시성·Topic Checkpoint (완료, 2026-09-02):** `LivingWikiCommitService`가 검증된 Evaluator output과 S5-4 candidate만 repository로 넘긴다. `private.commit_living_wiki_candidate`는 session advisory transaction lock과 active worker `attempt_no` fencing 아래 current version을 다시 확인하고 Wiki version과 evaluation을 함께 commit한다. 같은 job replay는 기존 결과를 반환하고, base가 최신과 다르면 Wiki를 쓰지 않은 채 `SUPPRESSED_STALE_BASE` evaluation과 최신 version/cursor를 반환하며 목표 cursor가 아직 덮이지 않았을 때만 `shouldRequeue`를 켠다. 문서와 cursor가 모두 같은 incremental evaluation은 기존 Wiki version을 재사용하지만 Topic Checkpoint는 별도 version을 만든다. checkpoint는 실제 topic 전환과 이전 perspective·issue·coverage stable id 보존을 application validator와 DB validator 양쪽에서 강제한다.
6. **S5-6 — Evaluator (완료, 2026-09-02):** provider-neutral `PublicEvaluator` port와 `PublicEvaluationService`가 고정 job cursor로 PUBLIC Context를 만들고 Evaluator output을 검증한 뒤 S5-5 Wiki/evaluation commit으로 전달한다. output validator는 `OPENING | CORE | EXTENDED | SYNTHESIS` phase, job/session/base/cursor/exact Pack, 지표·level별 allow-list reason code, context에 실제 제공된 PUBLIC reference, reference materialization, participant 소속과 Book Grounding의 공개 토론 연결을 fail-closed로 확인한다. S5-9 live 검증에서 top-level 평가와 typed patch에 중복되는 metrics/topic/관점/책 근거/참여 projection은 검증된 top-level 값을 canonical source로 삼아 같은 stable id의 patch operation을 결정적으로 정규화한 뒤 저장한다. 새 판단이나 누락 operation을 만들지는 않으며, 정규화 뒤에도 누락·relation/reference·최종 Wiki 모순은 DB 접근 전에 거절한다. fake Evaluator로 incremental lifecycle과 stale suppression을 검증했고, worker routing은 invalid output을 retry 대상으로 분류하되 Closing을 suppress한다. S5-8의 `GatewayPublicEvaluator`가 이 port를 실제 provider adapter에 연결하며, worker key가 없으면 결과 생성을 가장하지 않고 `EVALUATOR_PROVIDER_NOT_CONFIGURED`로 suppress한다. `suggestedAction`은 canonical evaluation에 남는 참고 신호일 뿐 Policy action을 만들지 않는다.
7. **S5-7 — deterministic Policy (완료, 2026-09-02):** `DeterministicPolicyEngine`은 committed evaluation과 그 평가에 사용된 PUBLIC context만 입력으로 받아 총점 없이 정확히 하나의 `action | WAIT`를 선택한다. phase/cursor freshness, 명시적 Host 도움, 연장 의견, 자동 개입 cooldown, confidence, 좋은 인간 흐름 보존 순으로 상위 gate를 적용하며 Evaluator의 `suggestedAction`은 사용하지 않는다. Relevance/Depth/Expansion의 지속 여부는 base Wiki의 이전 metric과 비교하고, `Book Grounding LOW` 또는 `Participation Balance LOW` 단독으로 좋은 흐름을 끊지 않는다. 포화 흐름은 cycle마다 `EXPAND → SUMMARIZE → TRANSITION` 중 하나만 선택한다. 자동 개입 cooldown 초기값은 90초이고 명시적 방장 도움 요청과 연장 의견은 우회한다. `PolicyApplicationService`가 trigger를 정규화하고 worker-only `commit_policy_decision`이 evaluation/Wiki/active attempt를 검증한 뒤 session row lock에서 phase version과 latest message cursor를 재확인한다. 그 사이 대화나 단계가 변한 non-WAIT action은 저장하지 않고 `SUPPRESSED_STALE`로 닫으며 Policy 자체 실패도 사용자-facing effect 없는 `WAIT`로 취급한다. PUBLIC-lane import boundary와 pure fixture, worker routing, pgTAP 권한·idempotency·cursor/phase race 회귀를 고정했다.
8. **S5-8 — provider·Opening·Host (완료, 2026-09-02):** provider-neutral `AiGateway` 뒤에 OpenAI Responses API Structured Outputs adapter를 연결했다. 호출은 `store: false`, 무도구·무stream·무provider conversation으로 실행하며 SDK와 provider 오류 형식은 infrastructure 밖으로 전달하지 않는다. logical alias는 Public Evaluator/Checkpoint를 `gpt-5.6-luna` low, Opening/Host를 `gpt-5.6-terra` low에 매핑하고 환경 설정으로 실제 모델만 교체할 수 있다. 성공·실패 run에는 prompt/schema/model/reasoning/latency/usage와 안정된 오류 코드만 저장하며 prompt/context/응답 원문은 진단 table에 남기지 않는다. Opening은 익명화한 PUBLIC prep과 room-pinned exact Pack만 사용해 하나의 짧은 입장 질문을 생성하고, provider 미설정·비재시도 오류·최종 재시도 실패에는 고정 기본 질문을 원자 확정한다. Host는 non-WAIT Policy의 단일 action, PUBLIC message/Wiki와 최대 8개 Pack item만 입력받고 action·attribution·cursor·Pack·reference와 private/internal metric/단일 정답/참가자 지목 금지 규칙을 검증한 뒤에만 공개 메시지를 원자 확정한다. 생성 중 phase/version/message cursor가 변하면 사용자-visible effect 없이 stale로 억제하고, 자동 Host 실패도 공개 메시지 없이 content-free `FAILED` 진단만 남겨 대화를 막지 않는다. Opening에서 서로 다른 관점이 충분히 드러난 `TRANSITION`은 같은 transaction에서 Core로 전환한다. `pnpm eval:ai:live`는 고정 Evaluator·Opening·Host 사례를 실제 alias로 호출해 동일 schema/semantic/privacy gate를 다시 통과시키되 모델 문장은 출력하지 않고 실행 metadata와 합격 여부만 보고한다. 2026-09-02 live eval에서 세 task가 모두 통과했고, 합성 Opening job의 실제 worker→provider→DB 흐름도 첫 attempt에 fallback 없이 한 메시지·한 이벤트·한 immutable Opening으로 확정되며 동일 key replay가 중복 효과를 만들지 않음을 확인했다. S5-8 시점에는 worker의 수동 enqueue만 지원했으며, 실제 message·silence·방장 도움 trigger는 아래 S5-9에서 연결했다.
9. **S5-9 — orchestration과 강화 (완료, 2026-09-02):** session 시작 transaction은 Opening을, participant message trigger와 10초 Cron reconciler는 message batch·고유 발언자·침묵·의제 지속 candidate를 durable `PUBLIC_EVALUATION` job으로 enqueue한다. trigger/reason은 content-free private directive에 명시해 worker가 추론하지 않으며, active job과 unique orchestration key로 중복을 억제한다. stale base·Policy·연장 결과는 최신 Wiki/cursor로 최대 3회 bounded refresh하고 이전 attempt는 공개 효과를 만들지 않는다. 종료 7분 전 window는 비차단 `PENDING | READY | UNAVAILABLE` 연장 의견을 만들고 방장 판단 권한을 바꾸지 않는다. `POST /v1/rooms/:roomId/session/ai-help`는 방장·phase/version·idempotency·one-in-flight·90초 재요청 실험값을 검증하고 네 가지 고정 reason만 받아 비동기 상태를 반환한다. 처리 상태는 방장 snapshot에만 보이며 성공한 non-WAIT Host 메시지만 모든 참가자에게 한 번 공개된다. 60초 queue lease를 20초마다 DB와 PGMQ에 함께 연장해 최대 60초 provider 호출 두 개를 포함하는 긴 job의 attempt fencing을 유지한다. provider timeout/connection은 content-free code로 분류하고 SDK 재시도는 0으로 둬 Queue가 bounded retry를 단독 소유한다. degraded pgTAP은 자동 실패가 대화를 막지 않고 host-help `FAILED`, 연장 `UNAVAILABLE`만 안전하게 노출함을 검증했다. 실제 Luna Evaluator v2 → Wiki → `HOST_HELP/DEEPEN` Policy → Terra Host → DB 흐름도 transient provider 실패 뒤 두 번째 attempt에 성공했고, AI Host 메시지·intervention은 각각 한 건, 일반 참가자의 host request state는 `null`, 합성 `AI_PRIVATE` canary는 비노출이었다.

exact/metadata retrieval eval이 부족할 때만 같은 retriever interface 뒤에 derived Search Chunk와 semantic adapter를 활성화한다. Final Wiki·Synthesis·Closing·공식 기록 lifecycle은 Slice 6에서 구현한다.

AI slice가 완료됐다고 판단하려면 Wiki가 “생성된다”는 것뿐 아니라 reference 정합성, stale-write 방지, privacy 경계, checkpoint/finalization과 실패 시 이전 버전 보존까지 검증해야 한다.
