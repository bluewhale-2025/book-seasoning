# Decision Log

이 문서는 AI 독서토론 서비스의 **중요한 기술 결정과 필요한 제품 변경 결정**을 기록한다.

제품의 기준선은 `PRODUCT_SPEC.md`이며, 제품 행동을 변경하는 Decision은 최종적으로 Product Spec에도 반영해야 한다.

---

## Decision 유형

- **TECH:** 제품 동작은 유지한 채 구현 방식을 결정
- **PRODUCT:** 사용자 경험 또는 AI 행동 자체를 변경
- **EXPERIMENT:** 아직 확정하지 않고 실험값으로 운영할 결정

## Status

- `PROPOSED`
- `ACCEPTED`
- `SUPERSEDED`
- `REJECTED`

---

## Decision 작성 템플릿

```md
## [TECH-NNN] 결정 제목

- Date: YYYY-MM-DD
- Status: PROPOSED
- Owner:
- Related:
  - PRODUCT_SPEC.md §...

### Context
무엇을 결정해야 하며 왜 지금 필요한가?

### Decision
무엇을 선택하는가?

### Alternatives
1. 대안 A
2. 대안 B
3. 대안 C

### Rationale
선택 이유와 핵심 근거.

### Trade-offs
얻는 것과 포기하는 것.

### Consequences
이 결정으로 이후 구현/운영에 생기는 영향.

### Revisit Trigger
어떤 조건이 생기면 이 결정을 다시 검토할 것인가?
```

---

# Accepted Decisions

## [TECH-001] Design System v0.1 UI 구현 기준선

> Visual direction과 color clause는 `[TECH-025]`가, UI font clause는 `[TECH-026]`이 대체한다. semantic token·React·Tailwind·Radix·CVA 기반 결정은 유지한다.

- Date: 2026-08-29
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §6, §10, §11, §12
  - `docs/DESIGN_SYSTEM.md`

### Context

책은양념의 AI 최소 필요 개입 철학과 사람 중심 토론 경험을 일관된 UI로 구현하려면 공통 디자인 토큰과 접근 가능한 컴포넌트 기반이 필요하다. 현재 저장소에는 기존 프론트엔드 환경이 없다.

### Decision

- 시각 방향은 `Warm Editorial`을 기본으로 하고 `Quiet Contemporary`의 정교한 상태 표현 규칙을 적용한다.
- 디자인 토큰은 framework-neutral semantic CSS custom properties로 정의한다.
- UI 컴포넌트 계층은 React + TypeScript를 기준으로 한다.
- 스타일링과 variant 구성은 Tailwind CSS, shadcn/ui 방식, Radix primitives, CVA를 사용한다.
- Vite는 Design System v0.1 내부 showcase의 빌드·검증 도구로만 사용하며 실제 서비스 애플리케이션 프레임워크를 확정하지 않는다.
- 기본 UI 서체는 앱에 번들되는 `SUIT Variable`을 사용한다.

### Alternatives

1. CSS Modules와 자체 headless component만 사용
2. Material UI 등 완성형 component suite 도입
3. Storybook을 함께 도입

### Rationale

semantic CSS token은 향후 애플리케이션 구조가 정해져도 재사용하기 쉽다. React와 shadcn/ui 방식은 UI 소유권을 프로젝트에 유지하면서 Radix primitives를 통해 접근 가능한 interaction 기반을 제공한다. Storybook은 v0.1 검증 범위에 비해 초기 설정 비용이 크므로 별도 showcase page로 시작한다.

### Trade-offs

- 컴포넌트 코드와 상태 조합을 프로젝트가 직접 관리해야 한다.
- 완성형 UI suite보다 초기 구성 작업이 많다.
- showcase용 Vite 설정은 실제 애플리케이션 프레임워크 결정 후 이동하거나 통합해야 할 수 있다.

### Consequences

- 토큰과 컴포넌트는 도메인 의미를 반영한 이름을 사용한다.
- AI Host, 현재 의제, 세션 상태는 일반 accent와 분리된 semantic token을 가진다.
- 실제 서비스는 `TECH-002`에 따라 기존 Vite 자산을 React SPA로 발전시킨다.

### Revisit Trigger

- 실제 애플리케이션 프레임워크가 React가 아닌 것으로 결정될 때
- Radix primitive가 필요한 접근성 또는 interaction 요구를 충족하지 못할 때
- 컴포넌트 수와 상태 조합이 증가해 전용 문서화 도구가 필요해질 때

---

# Technical Planning Decisions

아래 결정은 `docs/TECHNICAL_PLAN.md`의 구현 기준선이다. `TECH-002`~`TECH-024`는 제품 소유자와의 순차 검토를 마치고 모두 `ACCEPTED` 상태다.

## [TECH-002] React SPA와 Node backend의 AWS 분리 배포

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §16
  - `TECH-001`

### Context

현재 Vite 프로젝트는 Design System showcase다. 제품 소유자는 프론트와 서버를 독립적으로 배포하고 Vercel의 고정비와 serverless 응답 편차를 피하면서 서울 사용자 기준의 예측 가능한 성능을 원한다. 제품은 로그인 이후 사용하는 실시간 앱이므로 SEO와 dynamic SSR의 우선순위가 낮다.

### Decision

- frontend는 React + Vite + TypeScript SPA로 구현하고 AWS Amplify Hosting에 배포한다.
- 기존 semantic token, Tailwind, Radix, CVA 컴포넌트를 그대로 발전시킨다.
- backend는 별도 Node.js API와 AI worker로 구성해 AWS Lightsail Container 서울 리전에 배포한다.
- frontend와 backend는 같은 저장소에서 contract를 공유하되 독립 build/deploy artifact를 가진다.
- 정적 frontend는 CloudFront CDN을 사용하고, 항상 켜진 Node backend는 critical command와 AI 작업을 담당한다.

### Alternatives

1. Next.js App Router + Vercel 일체형 배포
2. Next.js SSR + AWS Amplify, 별도 Node backend
3. Vite SPA + Supabase serverless function만 사용
4. Vite SPA + ECS/Fargate backend

### Rationale

로그인 중심 실시간 앱에는 SSR 이득이 제한적이며, 기존 Vite 자산을 그대로 사용할 수 있다. Amplify의 정적 CDN과 서울 Lightsail의 always-on process를 분리하면 cold start를 피하고 frontend·backend를 독립적으로 배포할 수 있다. Lightsail은 ECS/Fargate보다 초기 비용과 운영 복잡도가 예측 가능하다.

### Trade-offs

- Vercel 일체형보다 CI/CD와 AWS 환경 설정이 많다.
- SSR을 사용하지 않으므로 최초 사용자별 데이터는 client hydration 이후 가져온다.
- Lightsail은 Vercel Function보다 자동 확장이 약하고 용량을 직접 관찰해야 한다.
- frontend와 backend의 CORS, token 전달, shared contract version을 관리해야 한다.

### Consequences

- 첫 구현은 Vite showcase를 제품 SPA로 정리하고 Node API/worker entry point를 만드는 Slice 0부터 시작한다.
- Amplify에는 공개 가능한 frontend 환경 변수만 둔다.
- Lightsail API와 worker는 서울 리전에서 실행하고 API latency와 worker resource 경쟁을 측정한다.
- package와 runtime 버전은 구현 시 stable 버전으로 pin한다.

### Revisit Trigger

- 공개 페이지 SEO나 SSR이 핵심 제품 요구가 될 때
- Lightsail 단일 서비스의 성능·가용성·확장성이 운영 목표를 충족하지 못할 때
- frontend와 backend 분리 운영 비용이 Vercel 일체형보다 명확히 커질 때

## [TECH-003] Supabase Postgres·Auth·Realtime 관리형 기반

- Date: 2026-08-30
- Amended: 2026-09-01 — 기술 기획·폐쇄 MVP 기간의 hosted plan을 Free로 변경
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §4, §5, §17
  - `docs/TECHNICAL_PLAN.md` §3~§7

### Context

계정, 관계형 데이터, 강한 권한 규칙, 실시간 메시지, 재접속을 작은 팀이 MVP 범위에서 운영해야 한다.

### Decision

- 기술 기획, 구현과 폐쇄 MVP 검증 기간은 Supabase Free의 서울 리전을 사용한다.
- Free active project 두 개를 staging과 production에 하나씩 할당하고 local은 Supabase CLI stack을 사용한다.
- Supabase Postgres를 authoritative data store로 사용한다.
- Supabase Auth의 email/password와 PKCE password reset을 사용하고 email confirmation은 끈다.
- 배포 환경의 재설정 메일은 custom SMTP를 사용한다.
- Supabase Realtime의 private Broadcast, Presence, typing Broadcast를 사용한다.
- Supabase Queues와 Cron을 durable job·시간 전환 기반으로 사용한다.
- exposed table에는 RLS를 기본 적용한다.
- Supabase 전용 접근은 infrastructure boundary에 격리해 표준 PostgreSQL schema와 application contract의 이전 가능성을 유지한다.

### Alternatives

1. Firebase Auth + Firestore
2. Clerk/Auth0 + 별도 Postgres + 별도 realtime
3. 자체 Postgres/Auth/WebSocket 운영

### Rationale

관계형 constraint와 transaction이 강한 제품 규칙에 적합하고 Auth, RLS, realtime, queue를 한 데이터 권한 체계로 연결할 수 있다. 서울 리전 Lightsail과 DB 위치를 맞출 수 있으며, AWS RDS에 Cognito·WebSocket·Queue를 별도 조합하는 것보다 MVP의 인프라 작업을 줄인다.

### Trade-offs

- Supabase의 RLS와 Realtime 권한 모델에 대한 결합이 생긴다.
- custom SMTP와 별도 환경 project 운영이 필요하다.
- 공급자 장애가 인증·DB·realtime에 함께 영향을 줄 수 있다.
- Free에는 자동 DB backup과 PITR이 없고 낮은 활동이 이어지면 project가 자동 pause될 수 있다.
- Free DB 500MB, egress·Realtime·connection quota를 지속적으로 감시해야 한다.

### Consequences

- migration, seed, generated type, pgTAP test를 저장소에서 관리한다.
- elevated Supabase secret API key는 browser에 두지 않는다.
- production data가 생기기 시작하는 시점부터 독립 논리 backup과 restore drill을 운영한다.
- pause/540 응답, DB size, egress, Realtime message·peak connection 임계치를 감시하고 upgrade trigger를 운영 runbook에 두어야 한다.

### Revisit Trigger

- 예상 동시 접속·메시지량에서 Realtime이 안정성 기준을 충족하지 못할 때
- 적용 지역이나 고객 요구가 자체 호스팅 또는 다른 데이터 위치를 요구할 때
- 실제 사용자에게 지속적으로 공개해 auto-pause·support 부재가 허용되지 않을 때
- DB 400MB 또는 주요 Free quota의 80%에 근접할 때
- 하루치 RPO와 자체 backup만으로는 사용자 기록의 신뢰성을 만족하지 못할 때

## [TECH-004] 서버 command와 Postgres transaction 기반 상태 확정

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §10, §17.2
  - `docs/TECHNICAL_PLAN.md` §5, §6, §8

### Context

메시지, 시작, 연장, 종료, Closing, 결과에는 동시 요청·재시도·권한 충돌이 존재한다. client optimistic state를 최종 기준으로 삼으면 제품의 공식 기록 불변성과 장애 복구 규칙을 지킬 수 없다.

### Decision

- 브라우저는 Supabase Auth 작업, RLS로 보호된 읽기, Realtime 구독, Presence와 typing에 직접 연결한다.
- MVP의 모든 중요한 domain mutation은 NestJS Command API를 유일한 애플리케이션 진입점으로 사용한다. 브라우저가 table write나 domain RPC를 직접 호출하지 않는다.
- 중요한 mutation은 인증된 versioned command로 표현한다.
- NestJS는 인증, 입력 validation, rate limit, password hash 검증, workflow와 response mapping을 담당한다.
- command는 idempotency key, 예상 aggregate version, 권한과 현재 상태를 Postgres transaction 안에서 검사한다.
- session 전환은 row lock, `phase_version`, 조건부 update로 한 번만 확정한다.
- DB는 constraint, 권한, 현재 상태, 동시성 불변조건, mutation, event/job 기록을 한 transaction에서 최종 확정한다. NestJS의 사전 권한 검사는 사용자 경험을 위한 것이며 DB 판정을 대체하지 않는다.
- DB가 확정한 snapshot과 cursor를 client의 최종 기준으로 삼는다.
- 일반 사용자 command는 사용자 JWT 범위 또는 제한된 전용 DB 권한으로 실행한다. elevated Supabase secret API key는 worker·관리자·계정 삭제처럼 필요한 module에만 격리한다.

### Alternatives

1. client optimistic update 후 충돌을 best-effort로 보정
2. application memory lock
3. 모든 명령을 queue로 직렬화
4. 메시지 등 저지연 command를 browser에서 Postgres RPC로 직접 호출

### Rationale

원본 데이터와 권한이 있는 곳에서 경쟁 상태를 해결하면 API instance 수와 무관하게 일관성을 유지할 수 있다. command idempotency는 네트워크 재시도의 중복 효과도 막는다. MVP의 write entry point를 NestJS로 통일하면 validation, rate limit, password·private data 경계와 관측을 한 곳에서 관리할 수 있다. 읽기와 Realtime은 Supabase에 직접 연결하므로 추가 API hop은 상태를 변경하는 요청에만 발생하고, 서울의 always-on API와 DB 사이 실제 latency를 측정해 최적화할 수 있다.

### Trade-offs

- DB function과 application command의 경계를 명확히 관리해야 한다.
- 단순 CRUD보다 초기 구현과 테스트가 많다.
- 충돌 응답을 처리하는 UI가 필요하다.
- 중요한 write에 browser → API → DB hop이 생기고 API 가용성이 mutation 가용성에 영향을 준다.
- 일반 API에서 elevated secret API key를 무분별하게 사용하지 않도록 DB client와 module 권한을 분리해야 한다.

### Consequences

- 성공 응답 후에만 운영 상태를 화면에 반영한다.
- append-only event와 aggregate version을 남긴다.
- 핵심 command마다 concurrency와 RLS test를 작성한다.
- 인증 SDK 작업을 제외한 frontend domain code에는 직접 table write와 domain RPC 호출을 두지 않는다.
- 메시지 write latency를 별도 관찰하고, 병목이 실측될 때만 `sendMessage`의 직접 RPC를 제한적으로 재검토한다.

### Revisit Trigger

- command 수와 DB 로직이 지나치게 복잡해져 독립 domain service가 명확히 유리해질 때
- 서울 환경에서도 API hop 때문에 메시지 확정 latency가 제품 목표를 반복적으로 넘을 때

## [TECH-005] Supabase private Realtime과 DB heartbeat의 역할 분리

- Date: 2026-08-30
- Amended: 2026-09-02 — 공식 event topic과 client-writable ephemeral topic을 분리
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §5, §6, §17.2
  - `docs/TECHNICAL_PLAN.md` §7

### Context

UI에는 빠른 Presence와 typing이 필요하지만 세션 시작 최소 인원은 DB transaction 안에서 확정 가능하고 재현 가능한 연결 정보가 필요하다. 또한 Supabase Realtime의 Broadcast write 권한은 event 이름별 공식 발행자를 보증하지 않으므로, client typing과 DB가 확정한 `session_event`를 하나의 writable topic에 두면 참가자가 공식 event를 흉낼 수 있다.

### Decision

- MVP realtime provider로 Supabase Realtime을 사용한다.
- 활성 세션은 membership RLS로 보호한 두 private topic을 같은 WebSocket 연결에서 사용하고 public channel을 허용하지 않는다.
  - `session:{session_id}:v{channel_epoch}`: DB가 확정한 `session_event`만 수신하는 공식 read-only Broadcast topic
  - `session:{session_id}:v{channel_epoch}:ephemeral`: 사용자-facing Presence와 typing Broadcast를 위한 client read/write topic
- commit된 message/state는 `session_events` insert 후 DB trigger의 `realtime.send(..., private := true)`로 공식 topic에 발행하고, client에는 이 topic의 Broadcast write 권한을 주지 않는다.
- active session의 현재 `channel_epoch`와 membership을 정확한 topic RLS에서 다시 확인하며, 종료·취소 session은 Realtime topic 권한을 주지 않는다.
- 시작 가능 인원과 Closing 전원 응답 판단에는 durable `session_connections` heartbeat를 사용한다.
- Broadcast는 알림 수단이며 client는 event 누락·중복·순서 변경을 권한 검사된 DB snapshot + cursor로 복구한다.
- 내보내기처럼 구독 권한을 즉시 폐기해야 하는 transaction은 `channel_epoch`을 증가시킨다. 이후 event는 새 topic에만 보내고 남은 참가자는 재구독하며, 제거된 사용자는 새 topic의 RLS를 통과할 수 없다.
- application event contract와 client adapter는 Supabase SDK payload에서 분리해 transport 교체 범위를 제한한다.

### Alternatives

1. Realtime Presence만 모든 인원 판정에 사용
2. DB polling만 사용
3. NestJS + Socket.IO stateful gateway 자체 운영
4. Ably 또는 Pusher 관리형 realtime
5. AWS AppSync Events 또는 API Gateway WebSocket
6. SSE + HTTP command

### Rationale

ephemeral 신호의 낮은 지연과 transaction 가능한 서버 판정을 분리하면 두 요구를 동시에 만족한다. DB-only publish topic으로 공식 event의 발행 경계를 보존하고, Broadcast가 손실되어도 DB cursor로 수렴한다. 이미 선택한 Supabase Auth, Postgres와 membership RLS를 같은 경계에서 사용하므로 별도 channel 인증 service, connection server와 fan-out store를 운영하지 않아도 된다.

### Trade-offs

- Presence와 heartbeat 두 계층을 관리한다.
- 활성 세션당 두 topic을 join·cleanup하지만 tab 당 WebSocket 연결은 공유해야 한다.
- heartbeat 만료 threshold에 따라 잠깐의 오탐이 생길 수 있다.
- client가 중복 tab과 cursor gap을 처리해야 한다.
- Realtime join 권한은 connection 동안 cache되므로 권한 폐기 시 channel epoch 전환과 참가자 재구독이 필요하다.
- Supabase Realtime의 latency, quota, 장애와 가격 정책에 의존한다.

### Consequences

- 15초 heartbeat와 30초 online threshold를 초기 실험값으로 둔다.
- realtime event에는 공개 DTO만 포함하고 transport wrapper의 id와 `eventId`를 같게 유지한다.
- reconnect E2E, 공식 topic write 거절, 두 탭 deduplication test가 필수다.
- commit-to-render latency, channel join, reconnect와 Presence 지연을 환경별 p50/p95로 관찰한다.
- 내보내기·탈퇴·권한 변경 E2E에서 이전 epoch 구독자가 이후 event를 받지 못하는지 검증한다.

### Revisit Trigger

- 모바일·background tab에서 heartbeat 오탐이 반복적으로 시작을 막을 때
- Realtime 확장성 또는 비용이 목표를 벗어날 때
- 서울 사용자 기준 commit-to-render latency 또는 reconnect 성공률이 제품 목표를 반복적으로 충족하지 못할 때

## [TECH-006] Supabase Queues·Cron과 Lightsail worker 기반 durable job

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §17.2, §18
  - `docs/TECHNICAL_PLAN.md` §6.4, §9.7, §10

### Context

AI 평가와 결과, Builder, 보관 만료는 재시도와 중복 방지가 필요하고 web request 생명주기보다 오래 걸릴 수 있다. 초기 MVP에서 별도 workflow SaaS를 추가할지 결정해야 한다.

### Decision

- Postgres-native Supabase Queues의 logged queue를 durable queue로 사용한다.
- latency와 자원 격리를 위해 `ai-session`, `ai-record`, `book-builder` queue를 분리한다. pure DB maintenance는 queue 없이 Cron 함수로 처리할 수 있다.
- 상태 변경 transaction 안에서 공식 상태·event와 queue message를 함께 확정한다. HTTP handler가 commit 후 별도로 enqueue하지 않는다.
- queue payload에는 `job_id`, type, aggregate id, input cursor/version만 넣고 message·AI_PRIVATE 원문은 넣지 않는다.
- Cron은 짧고 deterministic한 due session reconciliation과 만료 DB 작업만 실행한다. AI 호출이나 queue consumer 실행을 Cron job 안에서 하지 않는다.
- 별도 Nest application-context로 실행하는 Lightsail worker가 `read_with_poll`로 queue를 소비하고 queue별 bounded concurrency로 처리한다.
- worker는 visibility timeout과 긴 작업의 lease 연장을 관리하고, 성공한 message를 archive한다.
- 외부 AI 호출은 중복될 수 있다고 가정하고 unique `job_key`, freshness check와 조건부 result commit으로 사용자-visible effect를 한 번만 확정한다.
- retry 가능한 실패는 backoff + jitter로 재시도하고, 최대 시도 후에는 message를 archive하고 `job_runs.FAILED`로 보존한다.
- 긴 Builder는 여러 durable stage로 분해하며 한 job에서 전체 조사를 끝내지 않는다.
- Supabase Edge Function은 짧은 webhook이나 database-near 호출이 명확히 유리할 때만 보조적으로 사용한다.
- Trigger.dev 같은 외부 durable execution은 초기 도입하지 않는다.

### Alternatives

1. Trigger.dev durable tasks
2. Supabase Edge Function queue consumer
3. Inngest 등 event workflow SaaS
4. web request 중 처리
5. Redis queue 추가
6. AWS SQS Standard/FIFO queue

### Rationale

현재 예상 규모에서는 Postgres와 같은 관리 경계 안에서 durable delivery와 재시도를 만들 수 있고 추가 공급자·secret·과금을 줄인다. session state와 job enqueue를 실제 같은 transaction으로 연결할 수 있어 상태만 바뀌고 작업이 유실되는 dual-write를 피한다. 이미 확정한 always-on Lightsail Node runtime은 Edge Function의 실행 제약 없이 API와 같은 TypeScript domain·privacy package를 공유할 수 있다. queue를 용도별로 나누면 느린 Builder가 실시간 Host 작업을 막지 않는다.

### Implementation status

2026-09-02 S5-9에서 시작·message·연장 window trigger를 상태 transaction/DB trigger에, 침묵·의제 시간 후보를 10초 Cron reconciler에 연결했다. Cron은 candidate enqueue만 하고 provider는 Nest worker가 호출한다. trigger와 방장 도움 reason은 message/prep 원문이 없는 private directive로 저장하며 stable job key, active-job gate, attempt fencing과 최대 3회 stale refresh로 공개 효과를 한 번만 확정한다. 초기 queue lease는 60초이고 worker가 20초마다 DB lease와 PGMQ visibility를 함께 연장한다. 실제 Evaluator와 Host가 한 job에서 연속 호출되는 흐름 및 transient provider retry에서도 동일 attempt 소유권이 유지됨을 live E2E로 확인했다. 2026-09-03에는 PGMQ `msg_id`가 queue별 sequence라는 점을 반영해 AI job의 delivery identity를 `(queue_name, queue_message_id)` 복합 unique로 교정했다. 따라서 `ai-session`과 `ai-record`가 같은 숫자의 message id를 발급해도 서로 충돌하지 않는다.

### Trade-offs

- 복잡한 workflow UI와 step replay를 직접 보완해야 한다.
- polling, graceful shutdown, lease 갱신과 crash recovery를 직접 구현해야 한다.
- API와 worker가 같은 Lightsail 용량을 공유하면 자원 경쟁이 생길 수 있다.
- pgmq/pg_cron 함수와 운영 지표는 Supabase/Postgres에 결합되며 다른 queue로 이동할 때 infrastructure adapter와 migration을 바꿔야 한다.

### Consequences

- job state, attempt, idempotency, dead-letter 상태를 DB에 명시한다.
- web handler에서 AI 결과를 기다리지 않는다.
- queue schema를 browser Data API에 노출하지 않고 worker 전용 최소 권한으로 소비한다.
- 초기 bounded concurrency는 `ai-session=2`, `ai-record=1`, `book-builder=1`을 가설값으로 두고 resource와 rate limit 지표로 조정한다.
- API latency와 worker concurrency를 함께 측정하고 필요하면 worker를 별도 Lightsail service로 분리한다.
- application의 `JobQueue` port와 vendor-neutral job envelope을 유지해 SQS나 workflow service로 바꿀 때 domain job handler는 재사용한다. 외부 queue로 이동하면 DB transaction과 publish 사이를 보장하는 transactional outbox relay를 새 infrastructure로 추가한다.

### Revisit Trigger

- 단일 Lightsail service에서 API와 worker 자원 경쟁이 반복될 때
- workflow 수가 늘어 재시도·관찰·운영 비용이 외부 orchestrator 비용보다 커질 때
- queue backlog, throughput 또는 Postgres 부하가 AI와 사용자 transaction에 지속적으로 영향을 줄 때

## [TECH-007] OpenAI Responses API와 구조화된 AI contract

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner / Engineering / AI
- Related:
  - `PRODUCT_SPEC.md` §8, §9, §15, §18
  - `docs/TECHNICAL_PLAN.md` §9

### Context

Evaluator, Host, Living Wiki, 결과는 서로 다른 책임과 검증 규칙을 가지며, 모델 변경에도 일관된 contract와 비용 관리가 필요하다.

### Decision

- provider-neutral `AiGateway`와 canonical request/result contract를 application 경계로 두고 OpenAI SDK는 infrastructure adapter에만 둔다.
- 초기 provider는 OpenAI이며 Responses API와 Structured Outputs를 stateless하게 사용한다. 요청은 `store: false`로 실행하고 provider conversation과 `previous_response_id`를 제품의 기억으로 사용하지 않는다.
- Evaluator, Wiki, Host, Synthesis, record, Builder는 각자 versioned input/output schema를 가지며 provider 응답은 canonical result로 변환한 뒤 runtime·semantic 검증을 다시 통과한다.
- 검증 전 사용자-facing AI 출력은 stream하지 않는다. 전체 결과의 schema, privacy와 freshness를 확인하고 DB에 한 번 확정한 뒤 Broadcast한다.
- Policy는 모델이 아니라 deterministic TypeScript 규칙으로 구현한다.
- prompt, schema, context builder와 model mapping은 versioned logical task alias로 관리한다. DB에는 실제 provider/model/reasoning과 각 version을 기록한다.
- 초기 후보는 반복 평가에 `gpt-5.6-luna`의 `none/low`, Host·Opening·Synthesis에 `gpt-5.6-terra`의 `low`, record·Builder에 Terra의 `medium`을 사용하되 eval을 통과한 mapping만 배포한다.
- live Evaluator와 Host에는 web search나 외부 tool을 허용하지 않는다. Builder tool은 별도 allow-list, source capture와 운영자 Review 경계 안에서만 사용한다.
- commit 전 freshness와 중복 검사를 수행한다.
- Claude 등 다른 provider는 adapter, 고정 eval과 privacy 검토를 통과한 뒤 task별로 사용할 수 있다. `AI_PRIVATE`가 포함될 수 있는 task는 명시적으로 승인된 provider만 허용하며 자동 cross-provider fallback을 금지한다.
- 상위 모델이나 다른 provider를 자동 장애 fallback으로 사용하지 않고 동일 alias의 제한 재시도와 deterministic product fallback을 우선한다.

### Alternatives

1. 모든 역할을 하나의 agent prompt에 결합
2. Chat Completions와 자유 형식 JSON parsing
3. 단일 고성능 모델만 모든 작업에 사용
4. application/domain에서 OpenAI SDK와 response type을 직접 사용
5. 실패 시 자동으로 상위 모델 또는 다른 provider 호출

### Rationale

명시적 schema는 실패를 빠르게 격리하고 role contract를 테스트 가능하게 한다. 작업별 모델 routing은 사용자-facing 품질을 유지하면서 반복 평가 비용을 제어한다. deterministic Policy는 제품 규칙의 회귀 검증을 가능하게 한다. provider-neutral contract는 context builder, Policy, privacy/freshness 검증, job handler와 eval을 다시 작성하지 않고 provider adapter를 교체할 수 있게 한다. 검증 전 streaming을 막으면 immutable AI 메시지와 private leak 방지 규칙을 함께 지킬 수 있다.

### Trade-offs

- prompt/schema/model version을 함께 운영해야 한다.
- 소형 모델은 일부 평가에서 품질이 부족할 수 있다.
- provider마다 JSON Schema, refusal, reasoning, tool, usage와 오류 형식이 달라 adapter와 compatibility test가 필요하다.
- API 호환성과 의미론적 품질은 다르므로 provider/model마다 eval과 privacy 승인이 필요하다.
- stateless context를 애플리케이션이 구성하므로 context 크기·비용과 cursor 정확성을 직접 관리해야 한다.

### Implementation status

2026-09-02 S5-8에서 `AiGateway`/task catalog와 OpenAI Responses adapter를 구현했다. OpenAI SDK import와 client 생성은 infrastructure에만 두고, Evaluator/Checkpoint와 Opening/Host alias를 분리했다. provider 실행 진단에는 콘텐츠 없이 실제 model·prompt/schema version·reasoning·latency·usage 또는 안정된 failure code만 남긴다. Opening 고정 fallback과 Host schema/privacy/freshness 검증 뒤 worker-only atomic commit까지 연결했다. Luna Evaluator와 Terra Opening/Host의 live 고정 eval 및 합성 Opening worker→DB idempotency smoke를 통과했다. 2026-09-02 S5-9에서는 첫 Wiki patch의 완전성과 중복 projection 일치를 명시한 `public-evaluator.v2`를 적용했다. 2026-09-03 `public-evaluator.v4`에서는 exact allowed evidence catalog와 required envelope를 provider 입력에 추가하고 metric별 level/reason-code 조합을 JSON Schema로 제한했다. 공개 message seq·Book item id로 모델이 선택한 opaque evidence ID는 같은 context의 실제 UUID로 정규화하고, 중복 reference와 존재하지 않는 Wiki entity를 향한 dangling relation·coverage edge만 제거한다. 누락된 canonical projection operation은 검증된 top-level 평가에서 서버가 조립하되 새로운 관점·근거·문장은 만들지 않는다. 알 수 없는 evidence locator는 기존 resolver·Pack·cursor 검증으로 거절한다. provider timeout·connection·schema 실패는 content-free code로 분류하고 SDK `maxRetries: 0`을 유지해 durable Queue만 bounded retry를 소유하며, 최종 실패에도 `ATTEMPTS_EXHAUSTED` 대신 마지막 원인 코드를 보존한다. 실제 host-help Queue E2E는 transient provider 실패 뒤 두 번째 attempt에 성공했다.

### Consequences

- structured validation 실패와 semantic eval 실패를 구분한다.
- provider 원문 response 전체를 일반 로그에 남기지 않는다.
- model/provider 변경은 고정 eval set과 task별 privacy allow-list를 통과해야 한다.
- `packages/domain`과 job handler는 provider SDK를 import하지 않고 `AiGateway` canonical type만 사용한다.
- 사용자-visible Host output은 non-streaming commit으로만 게시한다.

### Revisit Trigger

- 비용·지연·품질 중 하나가 운영 목표를 지속적으로 충족하지 못할 때
- 다른 공급자가 명확한 품질 또는 데이터 처리 이점을 제공할 때
- Structured Output 제약 때문에 canonical schema의 의미를 반복적으로 축소해야 할 때

## [TECH-008] AI_PRIVATE의 구조적 context 격리

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Engineering / AI / Security
- Related:
  - `PRODUCT_SPEC.md` §3, §9, §17
  - `docs/TECHNICAL_PLAN.md` §9.3~§9.5, §11

### Context

AI_PRIVATE는 Evaluator 내부 판단에는 사용될 수 있지만 Host 출력과 참가자-facing 결과에는 원문·작성자·추론 가능한 출처가 노출되면 안 된다. prompt 지시만으로 이 불변조건을 보호하기에는 부족하다.

### Decision

- PUBLIC과 AI_PRIVATE는 조회 권한, context builder, LLM task와 저장 경로를 분리한 two-lane 구조로 처리한다.
- AI_PRIVATE 원문과 private-derived 상태는 Data API에 노출하지 않는 별도 `private` schema에 저장하고, 전용 최소 권한 worker만 읽을 수 있게 한다.
- AI_PRIVATE가 입력된 LLM 호출은 PUBLIC-lane Wiki patch, Host 문장, 공식 결과 또는 공개 event를 생성할 수 없다.
- Private Evaluator 출력은 자유 텍스트·요약·키워드·작성자 reference가 아니라 `unspokenPerspectiveExists`, `interventionOpportunity` 같은 제한된 enum/boolean contract만 허용한다.
- Host DTO에는 AI_PRIVATE 원문이나 private topic을 담는 필드를 만들지 않고, Host·Living Wiki·record module은 private repository를 import할 수 없게 코드 경계를 검사한다.
- Host는 PUBLIC 자료, 공개 가능한 Wiki와 Policy action만 기본 입력으로 받는다. 제한된 private signal은 별도 sanitizer와 leak guard를 통과한 일반적 개입 목표에만 사용할 수 있으며 MVP 첫 출시는 이 경로를 off로 둔다.
- AI_PRIVATE task는 전용 provider project/key와 별도 allow-list를 사용하며 자동 cross-provider fallback을 금지한다. `store: false`를 사용하되 이를 Zero Data Retention과 동일시하지 않는다.
- 조직·project의 승인된 데이터 보존 설정을 확인하지 못하면 외부 LLM을 통한 AI_PRIVATE 처리를 비활성화한다.
- 일반 로그에는 prompt·response·원문·파생 텍스트를 남기지 않고 허용된 실행 metadata만 기록한다.
- synthetic canary를 사용해 Host prompt/output, Wiki, record, event와 log 누출을 자동 테스트한다.
- 계정 삭제 시 AI_PRIVATE 원문과 모든 private-derived 상태를 함께 삭제한다.

### Alternatives

1. 한 prompt에 private 원문을 넣고 모델에게 비노출 지시
2. AI_PRIVATE를 전혀 사용하지 않음
3. 운영자가 private 원문을 검토한 뒤 수동 승인

### Rationale

타입·권한·쿼리·LLM task 경계에서 민감 원문이 공개 출력 경로에 도달하지 않게 하면 모델의 지시 준수에만 의존하지 않는다. `store: false`는 API상 response 저장 여부이고 ZDR은 별도 조직·project 설정이므로, 공급자 보존 조건도 별도 출시 조건으로 검증한다. 초기 off는 공개 대화만으로 제품 가설을 먼저 검증하면서 privacy 위험을 낮춘다.

### Trade-offs

- private 사전 입력이 Host 표현에 직접 기여하는 정도가 초기에는 낮다.
- 전용 schema, DB role, context builder와 테스트로 구현 복잡도가 늘어난다.
- 비식별 신호를 켤 때 별도 품질·privacy 검증이 필요하다.
- 보존 조건을 충족하는 provider를 사용할 수 없으면 private LLM 처리 기능을 계속 비활성화해야 한다.

### Consequences

- admin 기본 조회에도 다른 사용자의 private 원문을 노출하지 않는다.
- 일반 로그와 오류 추적에서 body를 redact한다.
- private 원문을 읽는 호출과 공개 결과를 생성하는 호출을 비용 절감을 이유로 합치지 않는다.
- 이 경계 위반은 threshold로 완화할 수 없는 출시 차단 오류다.

### Revisit Trigger

- 안전한 private signal이 없으면 핵심 제품 가치가 성립하지 않는다는 사용자 검증 근거가 생길 때
- privacy review가 더 강한 격리 또는 별도 데이터 store를 요구할 때

## [TECH-009] 다층 회귀 테스트와 AI eval 출시 gate

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Engineering / AI
- Related:
  - `PRODUCT_SPEC.md` §20
  - `docs/TECHNICAL_PLAN.md` §14, §15

### Context

제품의 핵심 위험은 일반 UI 오류뿐 아니라 RLS 누출, 동시 상태 전환, 불필요한 AI 개입, private 정보 노출과 결과 불안정성이다. 한 종류의 테스트로는 이를 검증할 수 없다.

### Decision

- 일반 PR의 빠른 gate는 formatting/lint/typecheck, production build, Vitest domain·Policy, Testing Library component와 fake AI adapter contract test로 구성하고 약 10분 이내를 목표로 한다.
- DB gate는 local Supabase migration reset, generated type drift와 pgTAP 기반 RLS·constraint·command function 검사를 실행한다.
- Playwright multi-context로 방장·참가자의 가입부터 종료 후 재열람까지 핵심 smoke flow와 동시성·재접속을 검증한다.
- 일반 코드 PR에서는 실제 LLM을 호출하지 않는다. prompt, model, schema, context builder 또는 Policy 변경과 staging/release 후보에서만 작은 versioned fixture set으로 live-model eval을 실행한다.
- AI eval은 정확한 문장 일치 대신 `WAIT` 적절성, 단일 개입 목표, Book Grounding 오용 금지, 근거 충실성, 내적 변화 단정 금지, 공식 결과 충실성과 privacy를 평가한다.
- synthetic private canary가 Host prompt/output, Wiki, record, Realtime event와 log 어디에도 나타나지 않는지 자동 검사한다.
- 대표 fixture는 자동 rubric과 소규모 human review를 함께 사용한다.
- AI_PRIVATE 누출, 무권한 기록 접근, 공식 결과 불변성 위반, command 중복 확정, 탈퇴 후 private 잔존은 한 건만 발생해도 출시를 차단한다.
- 전역 coverage 숫자를 출시 기준으로 사용하지 않고 상태 전환·권한·privacy·Policy 불변조건의 branch coverage와 명시적 회귀 시나리오를 기준으로 삼는다.

### Alternatives

1. E2E 중심 테스트만 작성
2. TypeScript unit test만 작성
3. AI 품질은 운영 후 수동 확인만 수행

### Rationale

각 위험을 가장 가까운 계층에서 빠르게 잡으면서 실제 다중 사용자 흐름도 보장한다. 의미론적 AI 품질은 deterministic unit test와 분리된 eval이 필요하다.

### Trade-offs

- local Supabase와 다중 브라우저 CI 시간이 추가된다.
- AI fixture와 rubric을 지속적으로 관리해야 한다.
- 외부 모델 호출 eval은 비용과 변동성이 있다.
- 빠른 PR gate와 staging/release gate가 분리되어 운영 규칙이 조금 복잡해진다.

### Consequences

- pure domain logic을 UI와 DB glue에서 분리한다.
- privacy, 종료 불변성, 연장 경쟁은 출시 차단 test가 된다.
- 실제 모델 eval은 작은 고정 set으로 staging에서 실행하고 일반 PR에는 fake/recorded contract test를 사용한다.
- prompt·model·schema·context builder·Policy 변경은 live-model eval 대상임을 CI가 판별하거나 PR checklist에서 명시한다.

### Revisit Trigger

- CI 시간이 개발 속도를 심각하게 방해할 때
- 운영 실패 유형이 현재 test 계층에서 반복적으로 누락될 때

## [TECH-010] NestJS + FastifyAdapter 기반의 간결한 모듈형 backend

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §15, §16
  - `TECH-002`, `TECH-003`

### Context

Lightsail에서 항상 실행되는 Node API와 AI worker의 framework 및 process 구조를 정해야 한다. 제품 소유자는 NestJS 경험이 있고, 과거 NestJS 프로젝트의 controller → use case → repository 계층 분리 경험을 활용할 수 있다. 다만 해당 프로젝트에서는 endpoint마다 반복되는 use case/interface, 거대한 전역 DI token registry, 기능 간 관계를 모두 가진 user entity, 요청·응답 전체 로깅과 얕은 테스트로 인해 유지보수·프라이버시·동시성 위험이 커졌다.

### Decision

- backend framework는 NestJS를 사용하고 HTTP adapter는 `FastifyAdapter`를 사용한다.
- 같은 `apps/server` codebase에 HTTP API와 queue worker의 별도 entry point를 둔다. API는 Nest HTTP application, worker는 HTTP listener가 없는 Nest application context로 실행한다.
- 기능별 module 안에서 `controller → application → domain → infrastructure` 경계를 사용하되, 복잡한 규칙이나 교체 가능한 외부 의존성이 있을 때만 계층과 interface를 추가한다.
- endpoint마다 일률적으로 use case interface와 위임 service를 만들지 않는다. 단순 조회는 query service로, 상태 전이·권한·트랜잭션이 있는 변경은 명시적인 command/application service로 구성한다.
- 전역 문자열 `DI_TYPES` registry를 만들지 않는다. feature-local `Symbol` 또는 class provider를 사용하고 module의 공개 export를 최소화한다.
- 모든 persistence 관계를 하나의 거대 entity graph로 연결하지 않고 ID와 좁은 repository/query 경계로 기능 간 결합을 제한한다. DB 제약과 상태 확정 방식은 별도 transaction decision을 따른다.
- global validation은 입력 allow-list를 기본으로 하고, 외부 응답은 명시적 response DTO/schema로 제한한다.
- Supabase Auth token을 검증하며 장기 access token을 직접 발급하는 custom JWT 체계는 만들지 않는다.
- 구조화 로그는 request id, route, status, latency와 허용된 운영 metadata만 남긴다. token, password, message body, AI 입력·출력과 `AI_PRIVATE` 원문은 기본적으로 기록하지 않는다.
- TypeScript strict mode, health/readiness, graceful shutdown, non-root multi-stage container와 API/worker별 bounded concurrency를 baseline으로 한다.

### Alternatives

1. framework 없이 Fastify를 직접 사용
2. NestJS 기본 Express adapter 사용
3. 과거 프로젝트의 hexagonal directory와 interface 구조를 그대로 복제
4. API와 worker를 처음부터 별도 repository/service로 분리

### Rationale

NestJS는 팀의 익숙함과 module/DI/testing 생태계를 활용할 수 있고, FastifyAdapter를 통해 schema 기반 처리와 낮은 HTTP overhead를 함께 얻을 수 있다. API와 worker가 domain, contract, privacy guard를 공유하면서 entry point와 runtime resource는 분리된다. 선택적 계층화는 핵심 상태 머신과 AI 경계를 테스트 가능하게 유지하면서 MVP의 파일 수와 wiring 비용을 억제한다.

### Trade-offs

- 순수 Fastify보다 framework bootstrap과 DI overhead가 있다.
- 일부 Express 전용 middleware와 Nest package는 Fastify 호환성을 확인해야 한다.
- 계층을 언제 분리할지 코드 리뷰 기준이 필요하며 기능마다 directory 모양이 완전히 같지 않을 수 있다.
- API와 worker가 같은 package를 공유하므로 import boundary와 entry point별 provider 구성을 테스트해야 한다.

### Consequences

- Slice 0에서 API와 worker entry point, shared application/domain module, validation·logging·health baseline을 함께 만든다.
- HTTP adapter에 종속된 request/response object를 application/domain 계층으로 전달하지 않는다.
- 비공개 context repository는 일반 Host·record module에서 import할 수 없도록 module 및 static boundary test를 둔다.
- 이전 프로젝트 코드는 직접 복사하지 않고 검증된 계층 분리 원칙만 새 contract에 맞게 적용한다.

### Revisit Trigger

- 측정 결과 Nest bootstrap, memory 또는 request overhead가 Lightsail 용량의 명확한 병목이 될 때
- Fastify adapter 호환성 문제로 핵심 기능이나 보안 middleware 구현이 반복적으로 막힐 때
- API와 worker의 배포 주기·확장 요구가 크게 달라져 package 또는 service 분리가 더 단순해질 때

## [TECH-011] SQL migration과 역할별 Postgres 접근 경계

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §8, §11, §15
  - `TECH-003`, `TECH-004`, `TECH-010`

### Context

RLS, transaction command function, trigger, private schema와 Supabase Queue를 사용하는 구조에서는 schema와 transaction의 Source of Truth를 하나로 유지해야 한다. 동시에 브라우저의 사용자 범위 접근과 worker·관리자의 내부 접근은 권한 모델이 다르므로 같은 고권한 client로 처리하면 안 된다.

### Decision

- database schema, RLS, function, trigger, grant와 extension의 유일한 원본은 versioned Supabase CLI SQL migration으로 관리한다.
- 브라우저의 Auth, 허용된 읽기와 Realtime은 generated database type을 적용한 `supabase-js`를 feature data-access adapter 안에서 사용한다. browser의 domain table write와 직접 mutation RPC는 금지한다.
- 중요한 사용자 mutation은 NestJS가 인증·입력을 확인한 뒤 사용자 JWT가 적용된 Supabase client로 좁은 Postgres command function을 RPC 호출한다. function 내부에서 최종 권한·상태·version·idempotency와 event/job enqueue를 한 transaction으로 확정한다.
- worker·관리자·계정 삭제 등 내부 작업은 Kysely + `pg`를 infrastructure repository에서만 사용하고, 기능별 최소 권한 DB role을 부여한다.
- Kysely query type과 DB row type은 infrastructure 밖으로 노출하지 않고 domain/application contract로 변환한다.
- TypeORM, Prisma 또는 Drizzle의 entity/schema DSL과 migration generator를 schema Source of Truth로 함께 사용하지 않는다.
- Lightsail의 장기 실행 API·worker DB 연결은 direct connection을 우선한다. IPv6 reachability가 없으면 Supavisor session pooler를 사용하며 transaction pooler는 기본값으로 사용하지 않는다.
- migration과 관리 작업은 runtime application credential과 분리된 migration credential로 실행한다.

### Alternatives

1. TypeORM entity와 migration을 schema Source of Truth로 사용
2. Drizzle schema와 Supabase SQL migration을 함께 유지
3. 모든 backend 접근을 elevated secret key의 `supabase-js`로 처리
4. 모든 사용자 요청에서 직접 Postgres 연결에 JWT claim을 수동 주입

### Rationale

SQL migration은 Postgres 고유 기능과 Supabase 확장을 손실 없이 표현하고 DB 불변조건을 리뷰 가능한 한곳에 둔다. 사용자 JWT RPC는 `auth.uid()`와 RLS 경계를 보존하며, Kysely는 내부 worker의 복잡한 조회에 타입 안전성을 제공하면서 schema를 소유하지 않는다. 역할별 adapter 경계는 elevated secret key의 과도한 확산을 막고 domain 규칙을 특정 query library로부터 분리한다.

### Trade-offs

- `supabase-js`와 Kysely 두 접근 방식을 목적에 맞게 구분해야 한다.
- SQL migration과 DB function 작성 역량이 필요하다.
- generated Supabase type과 내부 Kysely type의 drift 검사가 필요하다.
- direct connection과 session pooler 중 실제 production network 경로를 배포 전에 검증해야 한다.

### Consequences

- repository와 data-access code review에서 어떤 credential·role·schema를 사용하는지 확인한다.
- elevated Supabase secret key와 private schema credential은 frontend bundle과 일반 API module에 존재할 수 없다.
- CI에서 migration reset, pgTAP, generated type drift와 command function contract를 검사한다.
- Postgres를 유지하는 한 domain/application contract와 대부분의 SQL 자산은 Supabase 외 환경에서도 재사용할 수 있다.

### Revisit Trigger

- PostgREST/RPC round trip이 측정된 병목이 되어 사용자 command의 직접 DB 실행이 더 안전하고 단순해질 때
- 내부 query 복잡도가 낮아 Kysely 유지 비용이 이점보다 커질 때
- Supabase 이탈 또는 데이터 계층 변경으로 SQL function·RLS 전략 자체를 바꿔야 할 때

## [TECH-012] 프론트엔드 상태와 Realtime projection의 책임 분리

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Frontend
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §7, §12
  - `TECH-004`, `TECH-005`, `TECH-011`

### Context

서버 snapshot, Realtime event, Presence/typing, 전송 대기 메시지와 화면 상태를 하나의 전역 store에 섞으면 어떤 값이 공식 상태인지 불명확해진다. 특히 event 누락·중복·순서 변경과 재접속 시 DB snapshot으로 복구해야 하므로 서버 상태와 일시적 client 상태의 책임을 구분해야 한다.

### Decision

- route, auth guard, URL/search parameter와 route error boundary는 React Router Data Mode로 관리한다.
- 프로필, 방, membership, 공식 메시지, session phase, 검증된 참가자용 AI projection과 결과처럼 서버가 공개한 확정 상태는 TanStack Query가 조회·cache·invalidate한다. Living Wiki 전체 document는 browser cache에 두지 않는다.
- Presence, typing, connection state, reply target와 pending message outbox처럼 세션에 한정된 일시 상태는 session route마다 새로 생성하는 scoped Zustand store로 관리하고 퇴장 시 폐기한다.
- composer value, dialog open처럼 한 컴포넌트에만 필요한 상태는 React local state를 사용한다.
- Supabase Auth session은 전용 Auth provider가 소유하며 Zustand나 Query cache에 session token을 복제하지 않는다.
- React Router loader는 auth 확인과 TanStack Query prefetch/`ensureQueryData`만 담당하고 별도 server-data cache를 만들지 않는다.
- DB snapshot이 authoritative state다. Realtime event는 `seq_no`, aggregate version과 channel epoch를 검사하는 순수 `SessionEvent` reducer를 통과해 Query cache에 반영한다.
- cursor/version gap을 발견하면 event 추정을 계속하지 않고 입력을 잠근 뒤 snapshot을 다시 가져와 cache를 교체한다.
- pending message는 `clientMessageId`로 공식 message와 합치고, command 실패 시 공식 cache에 넣지 않은 채 재시도 가능한 client 상태로 남긴다.
- Zustand에 공식 메시지·Wiki·결과의 복사본을 저장하지 않고 Query cache와 대화 본문을 localStorage에 영구 보존하지 않는다.
- Redux와 application 전체를 담는 단일 global store는 MVP에서 도입하지 않는다.

### Alternatives

1. 모든 상태를 Redux Toolkit 하나에서 관리
2. TanStack Query만 사용하고 Presence·typing까지 Query cache에 저장
3. 모든 서버 데이터를 Zustand에 복제
4. React Context와 local state만으로 Realtime 세션 전체를 관리

### Rationale

서버 상태, ephemeral realtime 상태와 local UI 상태를 수명과 정답 주체에 따라 나누면 재접속 때 DB snapshot으로 확실하게 복구할 수 있다. TanStack Query는 shared remote state의 cache와 invalidation을 맡고 scoped Zustand는 빈번한 ephemeral update를 좁은 selector로 전달하므로 전체 화면 재렌더와 거대한 전역 store를 피한다.

### Trade-offs

- 개발자가 Query cache와 Zustand 중 어느 쪽에 상태를 둘지 기준을 지켜야 한다.
- Realtime event를 Query cache에 적용하는 reducer와 gap recovery 구현이 필요하다.
- loader와 Query prefetch의 중복 호출을 막는 query key convention이 필요하다.

### Consequences

- `features/*/queries`, `features/*/realtime`과 session-scoped store의 import boundary를 분리한다.
- Query key factory와 `SessionEvent` reducer를 공유 contract로 테스트한다.
- session 전환, logout과 권한 제거 시 Query cache와 scoped store에서 해당 사용자가 더 이상 볼 수 없는 데이터를 즉시 제거한다.
- E2E에서 event gap, 중복 event, reconnect, pending message confirm/fail과 방 전환 상태 격리를 검증한다.

### Revisit Trigger

- client-only 상태가 크게 늘어 여러 scoped store 간 orchestration이 더 복잡해질 때
- 매우 긴 대화에서 Query cache update가 측정된 렌더링 병목이 될 때
- offline-first와 영구 draft 복구가 새로운 제품 요구사항으로 확정될 때

## [TECH-013] Zod 기반 공유 runtime contract

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §8, §9, §12
  - `TECH-007`, `TECH-010`, `TECH-012`

### Context

TypeScript type은 실행 시 사라지므로 browser, HTTP, Realtime, queue, DB와 LLM 경계에서 신뢰할 수 없는 값을 검증할 runtime schema가 필요하다. frontend와 backend가 각자 DTO를 만들거나 provider별 schema를 직접 정의하면 validation과 타입이 쉽게 어긋난다.

### Decision

- `packages/contracts`의 Zod 4 schema를 command, response, snapshot, Realtime event, job envelope와 canonical AI input/output contract의 단일 원본으로 사용한다.
- TypeScript contract type은 별도 interface로 중복 작성하지 않고 `z.infer`로 파생한다.
- 외부 입력 object는 `z.strictObject` 등 allow-list schema로 unknown field를 거절한다.
- React는 API 응답과 Realtime event를 신뢰하기 전에 검증하고, 비단순 form은 React Hook Form과 Zod resolver를 사용한다.
- NestJS는 Standard Schema 또는 좁은 Zod validation pipe로 body/query/param을 controller 진입 경계에서 검증한다. `class-validator`/`class-transformer` DTO를 병행하지 않는다.
- queue consumer는 job payload를, provider adapter는 LLM response를, infrastructure adapter는 필요한 외부 응답을 canonical schema로 다시 검증한다.
- 공개 API response와 event payload는 반환 또는 publish 직전에 별도 public allow-list schema를 항상 검증한다. schema 밖 필드가 있으면 조용히 노출하지 않고 commit/publish를 실패시킨다.
- DB generated type이나 Kysely row type을 API contract로 직접 재사용하지 않고 repository mapping을 거친다.
- 형식·길이·필수 여부는 contract schema가 검사하고, 권한·중복·인원·상태·동시성 같은 authoritative 규칙은 domain과 Postgres transaction이 다시 검사한다.
- 오류 응답은 stable `code`, 일반화된 `message`와 허용된 field error만 포함하고 stack, SQL, 내부 metric과 provider 정보를 제외한다.
- OpenAPI와 provider용 JSON Schema는 canonical Zod schema에서 파생한 산출물로 취급하고 별도 Source of Truth로 만들지 않는다.

### Alternatives

1. NestJS class-validator DTO와 frontend type을 별도로 유지
2. TypeScript interface만 공유하고 runtime validation은 각 adapter가 수동 구현
3. OpenAPI 문서를 먼저 작성하고 code generation 결과를 contract 원본으로 사용
4. 각 LLM provider의 schema 형식을 application contract로 직접 사용

### Rationale

Zod schema 하나에서 runtime validation, TypeScript type과 JSON Schema를 파생하면 경계마다 같은 규칙을 검증할 수 있다. NestJS, React와 provider adapter는 schema를 소비하지만 domain/application contract는 특정 HTTP 또는 LLM SDK 타입에 종속되지 않는다.

### Trade-offs

- 큰 schema의 parse 비용과 bundle 크기를 관리해야 한다.
- DB 제약과 Zod 기본 형식 규칙 일부가 의도적으로 중복된다.
- OpenAPI 변환에서 표현되지 않는 refinement는 별도 문서 또는 test가 필요할 수 있다.
- response 검증 실패를 안전하게 처리하는 공통 exception mapping이 필요하다.

### Consequences

- contract 변경은 schema version, producer와 consumer compatibility를 함께 검토한다.
- contract fixture를 frontend, API, worker와 provider adapter test에서 재사용한다.
- public response schema와 private/internal schema를 파일 및 export 경계에서 분리한다.
- `packages/contracts`는 NestJS, Supabase와 provider SDK를 import하지 않는다.

### Revisit Trigger

- schema 변환 제약으로 OpenAPI 또는 복수 provider compatibility가 반복적으로 깨질 때
- contract package가 domain behavior까지 포함해 과도하게 커질 때
- 측정 결과 runtime parse가 대용량 message snapshot의 명확한 병목이 될 때

## [TECH-014] pnpm workspace 기반의 최소 monorepo

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §3, §15, §16
  - `TECH-002`, `TECH-010`, `TECH-013`

### Context

현재 단일 Vite showcase를 독립 배포되는 web/server와 공유 contract/domain/design-system package로 전환해야 한다. package 경계와 build 순서를 관리할 도구가 필요하지만 작은 MVP에 대형 monorepo orchestrator를 먼저 도입할 필요는 없다.

### Decision

- package manager와 monorepo workspace는 pnpm을 사용하고 저장소 루트에 하나의 `pnpm-lock.yaml`을 둔다.
- 초기 workspace는 `apps/web`, `apps/server`, `packages/contracts`, `packages/domain`, `packages/design-system`으로 구성한다. Supabase migration과 공통 E2E/eval fixture는 package로 만들지 않고 루트 자산으로 유지한다.
- 내부 package dependency는 `workspace:*` protocol로 명시하고 모든 package를 MVP 동안 `private: true`로 둔다.
- Node와 pnpm version은 `.node-version`, root `engines`와 `packageManager`로 pin한다.
- TypeScript project references와 `tsc -b`를 사용해 build graph와 compile boundary를 검사한다.
- root script는 pnpm workspace/filter 기능으로 app별 build·test·deploy와 전체 CI를 실행한다.
- workspace cycle은 허용하지 않고 CI에서 실패시킨다. package는 public export만 사용하며 다른 package의 source deep import와 상대 경로 횡단을 금지한다.
- `web`과 `server`는 서로 직접 의존하지 않고 contracts/domain package만 공유한다. domain은 NestJS, Supabase, AWS, OpenAI와 UI framework를 import하지 않는다.
- Turborepo, Nx, Changesets와 package publishing workflow는 MVP에서 도입하지 않는다.
- 기존 Vite showcase의 component와 token은 Slice 0에서 `apps/web`과 `packages/design-system`으로 이동하되 불필요하게 재작성하지 않는다.

### Alternatives

1. npm workspace를 유지
2. pnpm workspace와 Turborepo를 처음부터 함께 사용
3. Nx가 package 생성·build·dependency boundary를 모두 관리
4. frontend와 backend를 별도 repository로 분리

### Rationale

pnpm workspace는 단일 lockfile, 엄격한 dependency 접근, workspace protocol과 filter 실행을 제공해 현재 규모의 build graph를 충분히 관리한다. TypeScript project references가 compile 순서와 package 경계를 보완하므로 remote cache와 복잡한 task graph 도구는 실제 필요가 생길 때 추가하는 편이 단순하다.

### Trade-offs

- 기존 npm lockfile과 설치 환경을 pnpm으로 한 번 전환해야 한다.
- root script와 TypeScript reference graph를 직접 관리한다.
- 초기에는 remote build cache가 없어 CI가 package를 다시 빌드할 수 있다.

### Consequences

- Slice 0에서 root package를 workspace root로 전환하고 web/server의 독립 production artifact를 검증한다.
- dependency 방향은 static import test와 TypeScript build로 검사한다.
- Amplify는 `apps/web`, Lightsail image는 `apps/server`와 필요한 workspace dependency만 대상으로 빌드한다.
- package 수와 CI 시간이 유의미하게 늘기 전에는 monorepo 도구를 추가하지 않는다.

### Revisit Trigger

- package와 task 수가 늘어 변경 범위 기반 실행과 remote cache가 CI 시간을 명확히 줄일 수 있을 때
- 독립 release/versioning이 필요한 공유 package가 생길 때
- web/server의 보안 또는 배포 독립성 때문에 별도 repository가 더 단순해질 때

## [TECH-015] privacy-safe observability와 이중 product analytics

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering / Privacy
- Related:
  - `docs/TECHNICAL_PLAN.md` §11, §13, §15
  - `TECH-008`, `TECH-009`, `TECH-010`, `TECH-012`

### Context

장애 원인과 제품 가설을 분석하려면 기술 로그, 오류 추적과 사용자 행동 이벤트가 필요하다. 그러나 대화·사전 입력·AI context가 일반 로그나 제3자 분석 서비스로 넘어가면 제품의 privacy invariant를 위반할 수 있다. GA4는 유입과 큰 퍼널에는 유용하지만 authoritative domain action과 AI 개입 효과의 원본으로는 적합하지 않다.

### Decision

- NestJS의 JSON structured logger를 stdout에 사용하고 application `SafeLogger`가 allow-list metadata만 기록한다.
- API는 `AsyncLocalStorage`로 `requestId`를 command와 enqueue까지 전달하고 worker는 `jobId → evaluationId → policyActionId → interventionId` 관계를 이어 기록한다.
- 일반 로그의 허용 필드는 route template, method, status, latency, request/command/job/evaluation id, stable error code, retry 여부, deployment version과 environment로 제한한다.
- request/response body, query string, 이메일, 프로필 이름, token/cookie, 방 password, 메시지·prep·reflection, LLM prompt/response와 AI_PRIVATE 원문·파생 텍스트는 일반 로그와 오류 추적에 보내지 않는다.
- frontend/backend exception 추적은 Sentry를 사용하되 Session Replay, user-provided PII, console/network body collection을 끄고 `beforeSend` scrub과 normalized route name을 적용한다. source map은 CI에서 비공개 업로드하고 public artifact에서 제외한다.
- production performance trace는 staging privacy test 후 낮은 sampling으로만 활성화하며, 초기에는 Prometheus, Grafana, ELK와 전면 OpenTelemetry infrastructure를 운영하지 않는다.
- API liveness/readiness, worker heartbeat와 queue backlog를 별도로 노출·감시한다. Lightsail의 짧은 기본 container log는 최근 장애 확인용이고 audit 또는 장기 분석 원본으로 사용하지 않는다.
- authoritative domain action과 제품 학습 event는 first-party `analytics_events`/관련 fact table에 transaction commit 기준으로 한 번만 기록한다. event id 또는 command id로 중복을 제거한다.
- GA4는 landing, signup/login, room search 사용 여부, room create/join, session start/complete와 record view 같은 coarse funnel만 수집한다.
- GA4에는 이메일·프로필·Auth user id, User-ID, room/session/message id, 방·책 제목, 검색어, 원문, AI metric/context와 AI_PRIVATE 관련 값을 보내지 않는다.
- GA4 Google Signals, 광고 개인화, user-provided data와 불필요한 Enhanced Measurement를 끄고 allow-list event만 수동 전송한다. room URL은 식별자가 없는 route template으로 정규화한다.
- `Analytics` port 아래 `FirstPartyAnalyticsAdapter`와 `GaAnalyticsAdapter`를 분리하고 각 event를 Zod allow-list schema로 검증한다. server-confirmed action은 click이 아니라 transaction 성공 event를 원본으로 삼는다.
- GA script는 적용 가능한 privacy 고지·동의 전에는 로드하지 않는 보수적 consent 방식을 사용한다. production 활성화 전에 국외 이전 근거, 처리방침·고지 항목, provider 보유 기간과 삭제 절차를 검토한다.

### Alternatives

1. 모든 사용자 행동과 제품 지표를 GA4에 전송
2. Postgres first-party event만 사용하고 유입 분석을 하지 않음
3. session replay와 heatmap 중심의 product analytics 도구 사용
4. 초기부터 OpenTelemetry Collector, Prometheus, Grafana와 log backend를 자체 운영

### Rationale

coarse marketing funnel과 session/domain/AI 관계 분석은 필요한 식별 수준과 정답 주체가 다르다. GA4를 최소 퍼널에만 사용하고 authoritative action chain을 자체 Postgres에 두면 privacy와 분석 정확도를 함께 지킬 수 있다. 기술 로그·Sentry·product event를 분리하면 운영 오류 데이터가 제품 기록을 대신하거나 민감 원문을 수집하는 일을 피한다.

### Trade-offs

- 같은 사용자 여정을 GA와 first-party event에서 완전히 동일하게 연결하지 않는다.
- event taxonomy와 두 adapter의 allow-list를 관리해야 한다.
- Lightsail 기본 로그 보존이 짧으므로 오래된 기술 문제는 Sentry와 durable fact를 통해서만 추적할 수 있다.
- GA production 활성화 전에 privacy/legal 검토와 사용자-facing 고지 또는 동의 작업이 필요할 수 있다.

### Consequences

- product event schema는 event name/version, occurred_at, source, pseudonymous actor와 허용된 coarse property만 가진다.
- 원문이나 높은 cardinality 식별자는 analytics property가 될 수 없고 code review와 schema test에서 거절한다.
- 계정 삭제와 analytics 식별자 처리, raw event 보관 기간은 출시 전 privacy runbook에서 검증한다.
- 로그·Sentry·GA에 synthetic private canary를 넣어 외부 전송이 없는지 integration test한다.

### Revisit Trigger

- Lightsail에서 ECS 등으로 이동해 AWS native 장기 log·alarm 구성이 더 단순해질 때
- 서비스와 트래픽이 늘어 distributed tracing이나 전용 metric backend가 장애 대응에 필요해질 때
- first-party 분석 질의가 운영 DB 부하를 만들어 별도 warehouse가 필요할 때
- 법적 검토 또는 사용자 기대가 GA 수집 범위를 더 줄이거나 국내/자체 분석 도구를 요구할 때

## [TECH-016] Supabase Auth custom SMTP와 Resend 기반 password reset

- Date: 2026-09-01
- Amended: 2026-09-02 — Supabase 전역 CAPTCHA 제약에 맞춰 Managed Turnstile을 로그인에도 적용
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §3.1
  - `docs/TECHNICAL_PLAN.md` §4, §11, §15
  - `TECH-003`, `TECH-015`

### Context

MVP는 이메일 확인을 요구하지 않지만 이메일을 통한 비밀번호 재설정은 제공해야 한다. Supabase 기본 SMTP는 production 전달에 적합하지 않으며, 재설정 token과 template 책임을 별도 application mail system으로 중복 구현할 필요는 없다.

### Decision

- Supabase Auth의 PKCE password reset flow와 custom SMTP를 사용하고 초기 SMTP provider는 Resend로 한다.
- Supabase Auth가 reset token, 만료와 인증 template을 소유하고 Resend는 SMTP transport만 담당한다. NestJS mail service, 자체 token과 mail queue는 만들지 않는다.
- MVP 발송 범위는 password reset으로 제한한다. 가입 이메일 확인, 토론 알림과 marketing mail은 보내지 않는다.
- 인증 전용 sending subdomain과 From address를 사용하고 SPF, DKIM과 DMARC를 설정한다. auth와 향후 marketing 발송 평판을 섞지 않는다.
- open/click tracking을 끄고 메일에는 profile name, 방·책·토론 정보와 user-generated content를 넣지 않는다. 하나의 reset CTA와 최소한의 보안 안내만 포함한다.
- reset 요청은 이메일 존재 여부와 무관하게 같은 사용자-facing 응답을 반환하고 redirect allow-list는 local/staging/production의 정확한 URL로 제한한다.
- local은 Supabase Mailpit, staging과 production은 별도 Resend credential/domain 또는 환경으로 분리한다.
- recipient email, reset token과 link는 application log, Sentry와 analytics에 기록하지 않는다.
- provider·Supabase rate limit을 설정하고 회원가입·로그인·password reset에 Cloudflare Turnstile managed challenge를 공통 적용한다.
- production 활성화 전 이메일 주소의 국외 처리위탁/보관, provider 보유 기간과 삭제·계약 조건을 privacy 문서에서 검토한다.

### Alternatives

1. Supabase 기본 SMTP를 production에서도 사용
2. AWS SES SMTP 사용
3. NestJS가 reset token과 메일 발송을 자체 구현
4. Supabase Send Email Auth Hook과 Resend API를 처음부터 사용

### Rationale

Resend는 Supabase custom SMTP에 직접 연결할 수 있어 password reset만 필요한 작은 MVP의 설정과 운영 부담이 작다. Supabase Auth에 token과 template 책임을 유지하면 보안 흐름을 중복 구현하지 않는다. SES는 규모가 커지면 비용·AWS 통합 이점이 있지만 초기 sandbox 해제, bounce와 complaint 운영이 추가된다.

### Trade-offs

- Resend라는 추가 국외 processor와 계정이 생긴다.
- SMTP provider 장애가 password reset 가능성에 영향을 준다.
- 저발송량에서도 domain authentication과 전달 평판을 관리해야 한다.
- 추후 product notification이 확정되면 auth mail과 별도 발송 pipeline 결정이 필요하다.

### Consequences

- production checklist에 DNS 인증, test inbox 전달, 만료·재사용·redirect E2E와 generic response 검사를 포함한다.
- Auth template 변경은 보안 링크와 user-generated data 부재를 review한다.
- Resend provider event를 product analytics에 연결하거나 contact list를 만들지 않는다.

### Revisit Trigger

- 발송량과 비용이 SES 전환의 운영 비용보다 커질 때
- deliverability 또는 provider 장애가 계정 복구를 반복적으로 막을 때
- 알림·초대 등 password reset 밖의 product mail 요구가 확정될 때
- privacy/legal 요구가 provider 또는 데이터 region 변경을 요구할 때

## [TECH-017] SPA token, API perimeter와 방 password abuse 방어

- Date: 2026-09-01
- Amended: 2026-09-02 — 가입·로그인·reset에 전역 Managed Turnstile 적용
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §3, §5, §17
  - `docs/TECHNICAL_PLAN.md` §4, §14, §15
  - `TECH-003`, `TECH-004`, `TECH-005`, `TECH-015`, `TECH-016`

### Context

browser가 Supabase Auth·RLS·Realtime에 직접 접속하는 SPA 구조에서는 access token을 JavaScript runtime이 취급한다. 따라서 cookie BFF를 추가하는 대신 XSS·token 유출 경로를 줄여야 한다. 또한 최소 4자로 확정된 방 password와 이메일 확인 없는 가입·reset flow는 별도의 brute-force와 abuse 방어가 필요하다.

### Decision

- Supabase Auth session은 전용 client가 소유하고 access/refresh token을 Zustand, 자체 `localStorage`, log, Sentry와 analytics에 복제하지 않는다.
- browser는 bearer access token으로 Nest API를 호출하고 Nest는 Supabase JWKS로 signature와 issuer, audience, expiry, subject를 검증한다. decode만 한 claim은 신뢰하지 않는다.
- elevated Supabase secret API key와 private signing material은 browser bundle에 넣지 않는다.
- production은 HTTPS/HSTS, `@fastify/helmet`, exact-origin CORS, request body 한도와 Zod 길이·형식 제한을 적용한다. bearer auth에서 CSRF보다 XSS를 주요 browser 위험으로 취급한다.
- Amplify 보안 header에 strict CSP를 설정해 자체 origin, Nest API, 필요한 Supabase endpoint와 검증된 Sentry·GA endpoint만 허용한다. `object-src 'none'`, `frame-ancestors 'none'`, 제한된 `base-uri`를 기본으로 하고 `unsafe-eval`은 허용하지 않는다.
- 메시지·prep·reflection 등 user-generated text는 HTML/Markdown으로 실행하지 않고 plaintext로 rendering한다. MVP에서 rich text와 자동 linkify를 추가하지 않는다.
- 회원가입·로그인·password reset은 Cloudflare Turnstile managed challenge와 Supabase Auth rate limit을 함께 사용한다.
- 방 password는 unique salt를 사용한 Argon2id PHC string으로만 저장한다. 초기 parameter는 `m=19 MiB, t=2, p=1`이며 Lightsail에서 벤치마크해 서버 부하와 검증 지연을 조정한다.
- MVP에서 password pepper는 사용하지 않는다. 방 password 변경은 hash와 `password_version`을 같이 갱신하고 기존 등록자는 password 재입력 없이 재진입한다.
- 방 password 실패는 우선 방·actor별 1분 5회, 1시간 20회로 제한하되 방 전체를 잠그지 않는다. 값은 배포 없이 조정 가능한 configuration으로 관리한다.
- sensitive limiter는 Postgres의 private security bucket에 두어 API instance와 restart 사이에도 유지한다. 빠른 process-local limiter를 앞단에 병용하되 Redis는 MVP에 추가하지 않는다.
- browser가 Argon2 hash를 읽거나 password 검증을 우회하지 못하도록 API의 secret-only RPC가 hash와 version을 읽고, 검증 성공 시 actor·room·password version에 묶인 30초 일회성 authorization hash를 저장한다. 실제 `join_room`은 사용자 JWT의 `auth.uid()`로 actor를 다시 확인하고 authorization을 소비한다.
- command receipt의 payload 동일성은 별도 server-only HMAC key로 만든 fingerprint로 확인하며 password 원문이나 빠른 무키 hash를 저장하지 않는다.
- 제한 식별에 IP가 필요하면 raw IP 대신 별도 secret으로 HMAC한 단기 identifier만 사용한다. 제출 password와 실패 입력은 보안 log에도 남기지 않는다.
- 위조·만료·잘못된 issuer JWT, CORS/CSP/header, XSS plaintext rendering, Argon2 평문·log 유출, 다중 instance rate limit와 기존 등록자·퇴장·정원 처리 우선순위를 자동 테스트한다.

### Alternatives

1. HttpOnly cookie BFF를 추가하고 browser의 Supabase 직접 접속을 제거
2. 방 password를 bcrypt 또는 빠른 hash로 저장
3. 방 전체 lockout 또는 application memory rate limit만 사용
4. 선택 적용을 위한 별도 Auth proxy와 Turnstile server verification을 운영
5. Argon2id에 application pepper를 추가

### Rationale

Supabase direct Auth/RLS/Realtime 구조를 유지하면서 token의 불필요한 복제와 script 실행 표면을 줄인다. 짧은 방 password는 제품 요구를 바꾸지 않고 memory-hard hash, actor-scoped rate limit와 CAPTCHA로 보완한다. Postgres limiter는 Redis 운영 없이도 수평 확장·재시작 시 제한을 유지한다.

### Trade-offs

- SPA token은 JavaScript runtime에 존재하므로 CSP와 XSS 방어가 계속 중요하다.
- Turnstile은 인증 form에 작은 마찰과 외부 provider 의존성을 추가한다.
- Argon2id는 빠른 hash보다 API memory·CPU를 더 사용한다.
- Postgres limiter는 실패 시도마다 DB write를 추가한다.

### Consequences

- security header/CSP, JWT verifier, public/private key 환경 검증을 Slice 0에 포함한다.
- 가입·로그인·reset Turnstile, Auth rate limit과 reset generic response를 Slice 1의 E2E 기준에 포함한다.
- Argon2 hash, password version을 포함한 atomic join command와 durable limiter를 Slice 2에 구현한다.
- Slice 2 API는 local limiter → durable limiter → Argon2 verify → short-lived authorization → room lock/capacity/membership commit 순서를 사용한다.
- password 실패 통계는 GA/product analytics가 아니라 민감한 security telemetry로 분리한다.

### Revisit Trigger

- 다중 API instance 트래픽이 Postgres limiter 부하를 만들어 Redis 또는 edge limiter가 필요할 때
- 분산 brute-force·DDoS가 관찰돼 별도 WAF나 강화된 challenge가 필요할 때
- rich text, HTML 또는 user link preview가 제품 요구로 확정될 때
- Supabase 직접 Auth/RLS/Realtime 접속을 제거해 cookie BFF가 더 단순해질 때

## [TECH-018] GitHub Actions 산출물 승격 배포와 forward-only rollback

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §15, §16
  - `TECH-002`, `TECH-003`, `TECH-006`, `TECH-010`, `TECH-014`, `TECH-015`

### Context

Amplify, Lightsail Container와 Supabase가 서로 다른 시점에 임의 버전을 배포하면 DB·API·worker·web contract가 어괋날 수 있다. staging에서 검증한 code와 production code의 동일성을 보장하고, application artifact처럼 즉시 down rollback할 수 없는 DB를 호환 가능하게 배포해야 한다.

### Decision

- production 기준선인 보호된 `main`, staging 통합·배포용 `staging`과 짧은 feature branch를 사용하고 PR CI 통과 후만 merge한다.
- GitHub Actions를 CI와 DB·Lightsail·Amplify 배포의 단일 orchestrator로 사용한다. 각 provider의 독립 auto-deploy가 확정된 순서를 우회하지 않게 한다.
- PR은 formatting/lint/typecheck, unit/component, local Supabase reset·pgTAP, build와 핵심 Playwright smoke를 실행한다.
- `staging` branch push는 web static artifact와 server container image를 한 번 만들고 Git SHA·checksum으로 고정한 후 staging을 자동 배포한다. `main` push는 staging 배포를 시작하지 않는다.
- production은 staging에서 검증된 exact Git SHA를 `main` 기준선에 반영한 뒤 protected GitHub Environment의 명시적 수동 승인으로 동일 release artifact를 재build 없이 승격한다.
- AWS credential은 GitHub OIDC와 environment·repository·branch로 제한된 최소 권한 IAM role을 사용한다. Supabase와 runtime provider의 secret만 environment별 GitHub secret/cloud configuration에 분리한다.
- web artifact에는 Supabase URL·publishable key 등 공개 설정만 포함하고 secret API key, DB, OpenAI, Resend와 signing secret을 포함하지 않는다.
- local, staging, production은 Supabase project, Lightsail service, Amplify branch/app, Sentry, GA, SMTP, domain과 secret을 공유하지 않는다.
- 환경별 Lightsail Container Service 하나에 동일 image·Git SHA의 public API container와 non-public worker container를 다른 command로 함께 배포한다.
- 배포는 `backward-compatible DB expand migration → API/worker → web → smoke`순으로 진행한다. data backfill과 schema contract/delete는 별도 배포로 나누고 이전 application rollback window가 끝난 후에만 제거한다.
- 환경별 GitHub Actions concurrency lock으로 동시 배포를 금지한다.
- 배포 후 API readiness, migration head, worker heartbeat·queue 소비, 로그인·기본 조회와 synthetic command smoke를 확인한다.
- web은 직전 Amplify artifact/version, API·worker는 직전 Lightsail deployment version, AI는 직전 prompt/model alias로 rollback한다.
- production DB migration에 automatic down rollback을 사용하지 않는다. application을 먼저 되돌릴 수 있는 expand migration을 기본으로 하고 DB 수정은 새 forward-fix migration으로 적용한다.
- release manifest에 Git SHA, artifact checksum, Lightsail image/deployment version, DB migration head, API/event/job contract version, AI prompt/model alias, 배포자와 시각을 기록한다.
- MVP에 Kubernetes, ECS, ArgoCD, Terraform/CDK와 PR별 Supabase preview project를 도입하지 않는다. Dockerfile, Amplify/header 설정, 배포 script와 환경 생성·rollback runbook을 version control한다.

### Alternatives

1. Amplify, Lightsail와 Supabase가 `main` commit을 각자 자동 배포
2. staging과 production에서 각각 소스를 재build
3. `main` merge 시 production까지 즉시 자동 배포
4. API와 worker를 처음부터 별도 Lightsail service와 release pipeline으로 분리
5. 초기부터 ECS/Fargate, Kubernetes 또는 전면 IaC를 도입

### Rationale

하나의 workflow가 schema·server·web 순서와 승격 조건을 관리하면 부분 배포와 contract mismatch를 줄일 수 있다. staging이 검증한 산출물을 production에 그대로 옮기면 재build drift를 피한다. 하나의 Lightsail deployment에 API와 worker를 함께 두면 독립 process를 유지하면서 release 호환성과 rollback을 단순하게 가져간다.

### Trade-offs

- production 배포에 수동 승인 단계가 추가된다.
- GitHub Actions artifact 보관 기간 안에 production으로 승격해야 한다.
- API와 worker가 하나의 Lightsail service size와 release 주기를 공유한다.
- forward-only migration은 여러 release에 걸친 expand/contract 규율을 요구한다.
- 초기 cloud resource의 일부는 runbook에 따라 생성하므로 full IaC보다 manual drift 가능성이 높다.

### Consequences

- workflow, multi-stage Dockerfile, environment validation, artifact manifest와 deploy/rollback runbook을 Slice 0에 추가한다.
- API readiness와 worker heartbeat를 독립적으로 검증하고 deployment version을 safe log에 허용된 metadata로 넣는다.
- destructive migration PR은 expand/backfill/contract 순서와 이전 버전 호환성을 review한다.
- artifact retention, cloud data backup·restore와 secret rotation은 별도 운영 기준으로 연결한다.

### Revisit Trigger

- API와 worker의 자원·scale·release 주기가 달라져 별도 service가 더 단순해질 때
- Lightsail의 deployment, secret, autoscaling 또는 network 제약이 운영 요구를 반복적으로 막을 때
- 인프라 resource가 늘어 manual drift가 장애·복구 위험이 될 때
- 다중 개발자의 동시 DB 변경이 늘어 PR별 Supabase branch가 필요할 때

## [TECH-019] Supabase Free의 독립 논리 backup·restore와 삭제 재적용

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §17
  - `docs/TECHNICAL_PLAN.md` §11, §15, §16
  - `TECH-003`, `TECH-008`, `TECH-011`, `TECH-018`, `PRODUCT-029`, `PRODUCT-030`

### Context

폐쇄 MVP 기간에 사용하는 Supabase Free에는 automatic database backup과 PITR이 없다. 사용자 계정, 토론 원본·결과와 AI_PRIVATE를 authoritative Postgres에 저장하므로 project 삭제, 운영 실수, migration 오류와 data corruption에 대비한 별도 backup이 필요하다. 계정 탈퇴 후 이전 backup을 복원할 때 삭제된 개인정보가 부활하지 않는 절차도 필요하다.

### Decision

- 초기 내부 복구 목표는 RPO 24시간, RTO 8시간으로 두되 외부 SLA로 표시하지 않는다.
- production data가 생기기 시작한 시점부터 GitHub Actions scheduled workflow가 Supabase CLI로 `roles`, `schema`, `data`의 논리 backup을 하루 한 번 생성한다.
- production DB migration 직전에도 추가 backup을 생성하고 backup 성공·검증 전에 migration을 시작하지 않는다.
- backup은 AWS S3 서울 리전의 전용 private bucket에 보관한다. GitHub OIDC 최소 권한 role, Block Public Access, server-side encryption, TLS, 환경별 prefix와 접근 감사를 사용한다.
- dump, backup credential와 복호화된 data를 Git repository, GitHub artifact, application log, Sentry와 개인 local 디스크에 남기지 않는다.
- current/non-current backup object는 30일 후 lifecycle로 삭제하고 Object Lock은 사용하지 않는다.
- staging은 production backup을 공유하지 않고 migration·synthetic seed로 재생성한다.
- 탈퇴 시 운영 DB의 계정·AI_PRIVATE 삭제와 공동 기여 익명화를 즉시 적용한다. 이전 backup에는 최대 30일 남을 수 있음을 privacy 문서에 명시하고 공개 전 법적 검토한다.
- 탈퇴 `user_id`, 삭제 시각과 처리 버전만 담은 암호화된 restore tombstone을 DB backup과 분리해 37일 보관한다. backup 복원 후 service를 열기 전에 tombstone을 재적용하고 완료된 tombstone은 기한 후 삭제한다.
- 복구 시 `maintenance/read-only → worker/Cron 중지 → restore → migration catch-up → tombstone 재적용 → Auth/RLS/Realtime/Queue 검증 → stale lease 정리 → worker 재개 → smoke → 서비스 재개`순서를 사용한다.
- restore는 idempotency와 job 상태를 검증해 AI 메시지·결과·Builder publish가 중복 확정되지 않게 한다. 기존 auth token은 복구 방식에 따라 무효화될 수 있으며 재로그인을 안전한 기본으로 둔다.
- 공개 전 한 번, 이후 분기별로 최신 backup의 restore drill을 실행한다. production data는 개인 PC로 내려받지 않고 AI·SMTP·Sentry·GA 외부 전송을 끈 제한된 임시 cloud 환경에서만 검증한 후 제거한다.
- backup 실패, 마지막 성공 age, file size 급변, Supabase 540 pause, DB 350MB warning·400MB upgrade 준비와 주요 Free quota 80%를 감시한다.
- MVP에 Supabase Storage object를 authoritative file store로 사용하지 않는다. 파일 저장이 추가되면 DB backup이 object를 포함하지 않는 제약에 맞춰 별도 object backup을 먼저 설계한다.
- PITR은 Free에서 사용하지 않는다. 하루치 data loss가 허용되지 않는 실제 공개·유료 운영 단계에서 Supabase Pro·PITR를 재검토한다.

### Alternatives

1. Free 운영 중 backup을 만들지 않고 migration file만 유지
2. production DB dump를 Git repository 또는 GitHub artifact에 저장
3. 즉시 Pro·PITR로 전환
4. backup을 무기한 보관
5. backup 복원 시 계정 탈퇴·삭제를 재적용하지 않음

### Rationale

Free plan의 비용 이점을 유지하면서 제공자 project 삭제와 운영 실수에 대한 독립 restore 경로를 만든다. versioned migration만으로는 사용자 데이터를 복구할 수 없으며, S3의 제한된 30일 보관은 복구 기회와 개인정보 잔존 기간을 유한하게 만든다. restore tombstone은 이전 backup이 탈퇴·private 삭제를 되돌리지 않게 한다.

### Trade-offs

- RPO 24시간 내의 최근 토론 기록은 재해 시 손실될 수 있다.
- sensitive production dump와 tombstone을 추가로 보호·파기해야 한다.
- restore drill과 environment 재설정에 운영 시간이 든다.
- Free project pause·support 부재·quota 제한은 backup으로 해결되지 않는다.

### Consequences

- backup workflow, S3 lifecycle·IAM, backup manifest, pre-migration gate와 restore runbook을 배포 자산으로 관리한다.
- restore fixture와 drill에 auth user, RLS, queue/job, migration history, AI_PRIVATE 권한과 tombstone replay를 포함한다.
- production data 생성 전에 backup을 실제로 복원해 검증하지 못하면 운영 gate를 통과하지 못한다.

### Revisit Trigger

- 하루치 토론·계정 손실이 사용자 신뢰에 허용되지 않을 때
- 실제 공개·유료 서비스로 전환해 auto-pause와 support 부재를 허용할 수 없을 때
- DB 400MB 또는 주요 Free quota 80%에 근접할 때
- 파일 upload·Supabase Storage가 제품 범위에 추가될 때
- 복구 시간과 자체 backup 운영비가 Pro·PITR 비용보다 커질 때

## [TECH-020] 환경별 secret, 신규 Supabase key와 무중단 rotation

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `docs/TECHNICAL_PLAN.md` §4, §11, §15, §16
  - `TECH-003`, `TECH-008`, `TECH-011`, `TECH-017`, `TECH-018`, `TECH-019`

### Context

browser, API, worker, migration·backup workflow와 외부 provider가 서로 다른 권한을 필요로 한다. Supabase의 legacy `anon`/`service_role` JWT API key는 신규 publishable/secret API key와 asymmetric JWT signing key로 대체되고 있으므로, 새 MVP를 legacy shared secret에 결합하지 않는다. Lightsail·GitHub·Supabase·OpenAI·Resend 등에 퍼진 secret을 유출 없이 배포·교체하는 기준이 필요하다.

### Decision

- browser는 `sb_publishable_...` Supabase key만 사용한다. API, worker·admin은 가능하면 서비스별로 분리한 `sb_secret_...` key를 사용하고 공유 elevated key를 최소화한다.
- Supabase Auth는 managed asymmetric signing key를 사용하고 NestJS는 JWKS로 사용자 JWT를 검증한다. extract 가능한 legacy JWT secret을 application secret으로 사용하지 않는다.
- local은 gitignored `.env.local`/`.env.test`를 사용하고 repository에는 값 없는 `.env.example`만 둔다.
- staging과 production은 Supabase, DB role, OpenAI, Resend, Turnstile, Sentry·GA private configuration을 공유하지 않는다.
- GitHub Actions AWS 접속은 OIDC를 사용하고 migration·backup·deploy에 필요한 최소 secret만 GitHub Environment secret으로 둔다. private repository 요금제가 Environment approval을 제공하지 않으면 production은 `workflow_dispatch`, branch 제한과 명시적 확인 입력으로 보완한다.
- API·worker runtime secret은 Lightsail Container deployment environment에 주입하고 image, web artifact, repository, release manifest, backup, log·Sentry에 복제하지 않는다. production `.env` file을 image·server disk에 만들지 않는다.
- Lightsail에 workload identity없이 Secrets Manager를 연결하기 위해 다른 장기 AWS credential을 container에 넣는 구조는 도입하지 않는다. MVP에 별도 secret SaaS도 추가하지 않는다.
- application bootstrap은 Zod로 environment variable의 존재·형식·환경 조합만 검증하고 값을 error에 포함하지 않는다.
- CI에 secret scanner와 web artifact/Docker context 금지 pattern 검사를 둔다. 최소한 `sb_secret_`, DB URL/password, OpenAI/SMTP/Turnstile key, private signing material과 dump/.env 파일을 검사한다.
- secret inventory에는 이름, owner, environment, 사용 service, 생성·최종 교체 시각과 revoke 절차만 남기고 값은 남기지 않는다.
- GitHub, AWS, Supabase, OpenAI, Resend와 Sentry 관리자 계정은 MFA와 개인 계정을 사용하고 공유 login을 금지한다. recovery code는 온라인 작업 문서와 분리해 보관한다.
- 정상 rotation은 `new key 생성 → staging 적용·검증 → production 배포 → old key 미사용 확인 → revoke`순서로 실행한다. 교체 절차는 6개월마다 staging에서 훈련하고 사용자 관리 key는 최소 연 1회 검토·교체한다.
- Supabase signing key는 `standby → current → previously used → revoked`의 overlap을 사용하고 access token 만료와 JWKS cache를 확인한다. 사고 시에는 무중단보다 즉시 revoke와 재로그인을 우선한다.
- OpenAI key 유출은 비용 차단, Supabase secret/DB credential 유출은 data 접근 차단, SMTP key 유출은 account recovery 남용 차단을 우선하는 incident runbook을 둔다.

### Alternatives

1. legacy `anon`/`service_role` JWT key와 shared JWT secret 사용
2. API·worker·admin이 하나의 elevated key와 DB credential 공유
3. runtime secret을 Docker image 또는 production `.env` file에 포함
4. Lightsail에 long-lived AWS credential을 넣어 Secrets Manager 호출
5. 초기부터 외부 secret-management SaaS 도입

### Rationale

신규 Supabase key 체계는 public/elevated API key와 JWT signing을 분리해 서비스별 revoke와 asymmetric verification을 가능하게 한다. OIDC, 환경 분리와 artifact scanning은 secret이 소스·frontend·log로 이동하는 경로를 줄인다. MVP에서는 실제 workload identity가 없는 secret manager 연동보다 제한된 deployment environment와 검증·rotation 규율이 더 단순하다.

### Trade-offs

- Lightsail deployment environment에 runtime secret이 존재하므로 AWS 관리 권한을 매우 좁게 유지해야 한다.
- 서비스별 key와 환경 분리로 inventory·rotation 대상이 늘어난다.
- private GitHub Free repository에서는 environment approval·secret gate가 제한될 수 있어 수동 dispatch 보완이 필요하다.

### Consequences

- legacy key 용어와 구현을 publishable/secret key·asymmetric JWKS 기준으로 일괄되게 사용한다.
- `.env.example`, `.gitignore`, Docker ignore, environment schema, secret scanner·artifact scan과 rotation/incident runbook을 Slice 0에 추가한다.
- backend key를 사용하는 module과 DB role의 실제 최소 권한을 integration test한다.

### Revisit Trigger

- 개발·운영자가 늘어 중앙 secret manager와 접근 감사가 더 단순해질 때
- Lightsail에서 ECS/Fargate 등 workload IAM role을 제공하는 runtime으로 이동할 때
- compliance·고객 요구가 HSM/KMS 기반 중앙 rotation·access log를 요구할 때
- private repository 요금제 제약으로 production secret·approval 분리가 충분히 안전하지 않을 때

## [TECH-021] 폐쇄 MVP 성능 예산·Free 용량과 부하 검증

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §17
  - `docs/TECHNICAL_PLAN.md` §13–16
  - `TECH-002`, `TECH-003`, `TECH-005`, `TECH-006`, `TECH-009`, `TECH-015`, `TECH-019`

### Context

이전 서비스에서 체감 성능이 나빴던 경험이 있어 AWS·Supabase 조합이 빠를 것이라는 가정만으로는 충분하지 않다. Supabase Free Realtime은 200 concurrent connection·초당 100 event 제한이 있고 Broadcast fan-out도 event로 계산된다. 사용자 체감, API·Realtime·AI 지연과 인프라 용량을 분리해 측정할 기준이 필요하다.

### Decision

- 아래 값은 외부 SLA가 아니라 폐쇄 MVP의 초기 성능 예산이며 staging·production 실측으로 재조정한다.
- 서울 일반 mobile network의 field p75 기준으로 LCP 2.5초 이하, INP 200ms 이하, CLS 0.1 이하를 목표로 하고 mobile·desktop을 분리해 측정한다.
- room 초기 snapshot 표시 p95 2초, 일반 API read 서버 p95 400ms, 중요 command 확정 p95 500ms, message ack p95 500ms, 다른 참가자의 반영 p95 1초, network 복구 후 authoritative sync p95 3초를 목표로 한다.
- 예정 시각 기준 server 상태 전환은 최대 10초 내에 수렴하는 기존 기준을 유지한다.
- user-facing Opening·Host 응답 p95 12초, 공식 결과 생성 p95 60초를 운영 목표로 두되 AI latency는 채팅·연장·종료를 차단하지 않는다.
- 방 진입 snapshot은 최근 message 100개만 포함하고 이전 메시지와 종료 record는 cursor pagination으로 50개씩 추가한다. 전체 열람 권한은 유지하고 전송·rendering만 나눈다.
- message DOM이 커져 측정 결과 필요할 때 virtualization을 적용한다. admin Builder·무거운 결과 route는 lazy loading하고 초기 사용자 route JavaScript는 gzip 약 350KB를 예산으로 시작한다.
- 폐쇄 MVP의 정상 운영 목표는 Realtime 동시 사용자 60명이며 release 전 100명까지 부하 검증한다. 120 connection 또는 Realtime limit 60%에서 warning, 160 connection 또는 주요 quota 80% 전에 Pro 전환을 준비한다.
- 하나의 tab은 가능하면 Realtime connection 하나를 공유하고 route 이탈 시 channel·Presence를 정리한다. typing은 debounce/throttle하고 background tab의 불필요한 typing·Presence 전송을 중지한다.
- 일반 PR은 10명 수준의 빠른 concurrency smoke를 실행한다. release candidate는 staging에서 60명·30분 normal mix, 100명·10분 stress와 한 방 15명의 동시 join·message·reconnect burst를 검증한다.
- HTTP는 k6, Realtime은 k6 WebSocket 또는 `supabase-js` synthetic client로 측정한다. 부하 test에는 synthetic account/data와 fake AI·SMTP·analytics를 사용하고 완료 후 정리한다.
- 같은 release test 3회 중 2회 이상 p95 예산 실패, Lightsail CPU/memory 15분 이상 70%, worker backlog의 지속 증가, DB 400MB/주요 Free quota 80%, Realtime 429·`too_many_connections`·`tenant_events`, 실제 message 반영 1초 목표의 반복 실패를 조사·upgrade trigger로 삼는다.
- performance telemetry에 route template, duration, status, release/environment와 coarse connection/job count만 남기고 user content·AI_PRIVATE·token·email·room title은 넣지 않는다.

### Alternatives

1. 출시 후 체감 불만으로만 성능 문제를 판단
2. Supabase Free 상한인 200 동시 connection까지를 정상 운영 목표로 사용
3. 방 진입·종료 record에서 전체 메시지를 한 번에 전송
4. 일반 PR마다 실제 AI와 100명 부하 test 실행
5. 초기부터 상위 Supabase plan·Lightsail size로 over-provisioning

### Rationale

사용자 체감·API·Realtime·AI 지연을 나누면 성능 문제의 원인을 불필요한 인프라 확장과 구분할 수 있다. Free limit에 headroom을 남기고 실제 session 패턴을 부하 test하면 예상 가능한 폐쇄 MVP 운영이 가능하다. cursor pagination은 기록 접근 범위를 줄이지 않고 초기 load와 DOM 비용을 제한한다.

### Trade-offs

- 부하 harness, synthetic data cleanup과 성능 지표 관리 비용이 추가된다.
- 메시지 pagination으로 과거 기록 탐색에 추가 요청이 필요하다.
- 350KB bundle 목표는 실제 SDK 구성에 따라 조정될 수 있다.
- Lightsail Container metric에 native alarm이 없어 초기 감시·notification의 일부를 application 또는 운영 점검으로 보완해야 한다.

### Consequences

- web-vitals, safe API/job latency histogram, bundle budget check와 synthetic performance fixture를 구현한다.
- message/snapshot contract에 cursor pagination을 포함하고 index·query plan을 DB integration test에서 검증한다.
- k6/API와 Realtime synthetic harness, threshold·cleanup script와 release performance report를 test 자산으로 관리한다.

### Revisit Trigger

- 실제 field p75/p95가 초기 budget의 현실성을 반복적으로 반박할 때
- Realtime fan-out·connection quota가 제품 성장을 제한할 때
- 종료 record의 전체 탐색 패턴이 pagination/virtualization 변경을 요구할 때
- AI latency·비용이 사용자 Outcome에 명확한 영향을 줄 때

## [TECH-022] Baseline browser, responsive web과 WCAG 2.2 AA 구현 목표

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §17
  - `docs/TECHNICAL_PLAN.md` §3, §14, §16
  - `TECH-001`, `TECH-002`, `TECH-009`, `TECH-012`, `TECH-021`

### Context

실시간 토론은 모바일 화면, 가상 keyboard, background tab, 다중 브라우저와 스크린리더에서도 메시지·timer·Closing·운영 명령을 사용할 수 있어야 한다. legacy browser까지 지원하면 bundle·test 비용이 커지며, 실시간 메시지와 매초 timer를 무분별하게 live region으로 읽으면 오히려 사용이 불가능해진다.

### Decision

- desktop Chrome·Edge·Firefox·Safari의 최신 stable과 직전 version, 최신·직전 iOS major의 Safari, Android Chrome 최신·직전 version을 지원 범위로 한다. Samsung Internet 최신 stable에서 핵심 flow를 수동 smoke한다.
- in-app browser는 best-effort로 두고 필수 API가 없거나 오류가 발생하면 기본 browser로 열기를 안내한다. Internet Explorer와 legacy bundle은 지원하지 않는다.
- Vite major의 `Baseline Widely Available` production target을 기본으로 사용하고 지원 정책을 넘어선 browser용 `plugin-legacy`를 추가하지 않는다.
- WebSocket, Web Crypto 등 필수 capability를 bootstrap에서 확인하고 부족하면 깨진 UI 대신 browser update 안내를 표시한다. `BroadcastChannel`과 같은 최적화 API는 없어도 핵심 flow가 작동하게 한다.
- responsive web은 360 CSS px부터 mobile·tablet·desktop을 지원하고 `100dvh`, safe-area inset과 가상 keyboard를 처리한다. orientation 변경에도 draft·session state를 유지한다.
- hover-only 필수 기능을 금지하고 sticky timer·Closing·composer가 서로와 keyboard focus를 가리지 않게 한다. PWA install, 완전 offline mode·background push는 MVP 범위에서 제외한다.
- WCAG 2.2 AA를 구현 목표로 하되 공식 적합성 인증을 주장하지 않는다.
- semantic HTML·native control·label, keyboard-only 핵심 flow, dialog/menu 초점 이동·복귀, visible focus, 일반 text 4.5:1 명암비, 색 이외의 상태 표시, 200% zoom/reflow, reduced motion을 적용한다.
- touch target은 가능하면 44×44 CSS px 이상으로 하고 drag·복잡 gesture만으로 실행하는 핵심 action을 두지 않는다.
- 새 message는 사용자가 최신 위치를 보고 있을 때만 polite live announcement를 사용한다. 과거를 읽는 중에는 본문 대신 `새 메시지 N개`를 알리고 typing을 반복 음성 공지하지 않는다.
- timer는 매초 screen reader에 읽지 않고 7분·5분·1분, Closing 시작·종료 등 핵심 경계만 알린다. AI·system·participant message type과 reply 작성자·인용 관계를 text semantics로 제공한다.
- 동일 profile name은 저장된 이름을 바꾸지 않고 참가자 관리 UI에서만 avatar와 session-local 보조 표식으로 구분한다.
- `lang="ko"`, UTF-8을 기본으로 하고 server timestamp는 UTC로 저장하되 사용자 화면은 로컬 timezone으로 표시한다.
- ESLint a11y 규칙, Testing Library semantic query, component/Playwright `axe-core`를 자동 검증에 추가한다. Chromium·Firefox·WebKit 핵심 flow, 360px/device profile, keyboard-only·macOS/iOS VoiceOver를 release 전 수동 검증한다.

### Alternatives

1. Chromium desktop을 유일 지원 환경으로 선정
2. Internet Explorer·오래된 Safari까지 legacy transpilation/polyfill 제공
3. 접근성을 출시 후 수동 보완 작업으로 미룸
4. 모든 Realtime event·timer tick을 live region으로 공지
5. native mobile app 또는 PWA/offline을 MVP에 포함

### Rationale

Vite의 현행 Baseline target과 주요 evergreen browser 정책을 연결하면 legacy bundle 비용 없이 명확한 지원 범위를 유지할 수 있다. semantic primitive·keyboard·focus와 실시간 announcement 규칙을 처음부터 구현하면 나중에 토론 UI 구조를 다시 쓰는 비용을 줄인다. 중요 event만 음성 공지해 실시간 정보를 전달하면서 인지 과부하를 피한다.

### Trade-offs

- browser·device·screen reader test matrix와 수동 QA 비용이 추가된다.
- 오래된 기기와 in-app browser 사용자는 기본 browser로 이동해야 할 수 있다.
- Realtime live announcement의 정도는 실제 screen reader 사용자 검증으로 조정할 수 있다.

### Consequences

- design-system component와 핵심 route에 semantic·focus·contrast·target·responsive test를 포함한다.
- browser capability gate, mobile viewport/keyboard fixture, Realtime accessibility announcement helper를 공유 인프라로 둔다.
- 기능 slice의 완료 기준에 Chromium/WebKit/Firefox 핵심 flow와 keyboard/axe 통과를 포함한다.

### Revisit Trigger

- 지원 범위 밖 browser·OS 사용자가 유의미한 비중을 차지할 때
- 실제 screen reader 테스트가 live announcement·virtualized message 패턴의 변경을 요구할 때
- 법적·공공기관 요구가 공식 접근성 인증·추가 기준을 요구할 때
- native app, PWA·push·offline이 제품 요구로 확정될 때

## [TECH-023] Evidence-linked Living Wiki와 optimistic version commit

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §13~§17
  - `docs/AI_ENGINE_SPEC.md`
  - `docs/TECHNICAL_PLAN.md` §5.3, §9.6
  - `TECH-004`, `TECH-006`, `TECH-007`, `TECH-008`, `TECH-009`

### Context

Living Wiki가 단순한 최신 요약 JSON이면 모델이 만든 해석을 원본과 다시 대조하기 어렵고, 동시에 실행된 오래된 평가가 최신 상태를 덮어쓸 수 있다. 주제 전환과 종료 시점에 누적 요약 오류가 그대로 공식 기록으로 전달될 위험도 있다. 반대로 매 메시지마다 전체 세션을 다시 분석하면 비용·지연이 커지고 인간 대화를 차단할 가능성이 높다.

### Decision

- Living Wiki는 session-scoped versioned structured document로 저장한다.
- 각 version은 `INCREMENTAL | TOPIC_CHECKPOINT | FINAL`, `base_version`, `based_through_seq`와 schema version을 가진다.
- Current Topic, Perspective Map, Book Grounding, Issue & Question Map, Coverage, 공개 근거 기반 Participant State, Discussion Metrics & Key Changes의 7개 section을 canonical contract로 둔다.
- 관점·관계·책 근거·변화 주장은 가능한 한 allow-list된 message, PUBLIC prep, AI intervention 또는 exact Pack item reference를 가진다.
- 모델 출력은 임의 full overwrite나 범용 JSON Patch가 아니라 stable item id를 사용하는 typed operation으로 제한한다.
- patch는 reference 존재성, session/Pack 소속, cursor 범위, relation target, schema와 private variant 부재를 검증한 후 atomic하게 적용한다.
- commit transaction에서 current version이 `base_version`과 다르면 오래된 결과를 저장하지 않고 suppression/retry 판단으로 전환한다.
- 주제 전환에는 관련 원본을 재검토한 Topic Checkpoint를 만들고, 세션 종료에는 checkpoint와 Raw Data를 다시 검증한 session-unique Final Wiki를 만든다.
- Final Wiki는 공식 기록과 분리하며 record retry는 동일 Final version을 입력으로 사용한다.
- Raw Data retrieval은 exact ID/seq와 metadata/context window를 우선한다. 위치를 모르는 과거 논의는 원본 message ids를 보존하는 파생 Search Chunk로 찾고 다시 원본을 읽는다.
- 첫 구현의 exact/metadata retrieval이 고정 eval을 통과하지 못할 때 `SessionRawDataRetriever` 뒤에 embedding semantic search를 활성화한다. Hybrid/BM25는 실제 검색 품질 문제가 확인되기 전에는 추가하지 않는다.

### Alternatives

1. 매 평가마다 Wiki 전체 JSON을 overwrite
2. Wiki 없이 최근 메시지 또는 전체 세션 원문만 매번 전달
3. append-only 자연어 요약만 저장
4. 처음부터 모든 세션 메시지에 embedding과 Hybrid Search 적용
5. provider conversation state를 세션 기억으로 사용

### Rationale

근거 reference와 cursor를 가진 version은 Wiki가 해석이라는 지위를 유지하면서 원본 검증과 재현을 가능하게 한다. optimistic base check는 한 session 안의 AI race를 단순한 last-write-wins로 만들지 않는다. Topic Checkpoint와 Final 재검증은 비용이 높은 전체 재분석을 전환점에만 사용한다. retrieval abstraction과 단계적 semantic 도입은 원문의 “필요할 때 원본으로 내려간다”는 목적을 보존하면서 30분 MVP에 불필요한 색인 복잡도를 먼저 지지 않게 한다.

### Trade-offs

- typed patch, stable item id, reference resolver와 version migration이 필요하다.
- LLM 출력 schema와 DB commit 로직이 단순 요약 저장보다 복잡하다.
- semantic search를 늦추면 초기 exact/metadata retrieval이 놓치는 과거 논의가 있을 수 있으므로 eval이 필수다.
- checkpoint/finalization에서 추가 모델 호출과 원본 조회 비용이 든다.

### Consequences

- `packages/contracts/internal`에 Wiki document/patch/evidence schema와 fixture를 둔다.
- `living_wiki_versions`는 version kind, base version과 cursor를 저장하고 Final은 session unique로 제한한다.
- worker는 stale-base suppression, patch atomic reject와 다음 cursor 재처리를 구현한다.
- PUBLIC-lane Wiki 전체는 browser query 대상이 아니며 current topic 등 검증된 참가자용 projection만 event/snapshot으로 내보낸다.
- Wiki reference/concurrency/checkpoint/final/privacy eval은 Slice 5~6 release gate가 된다.

### Revisit Trigger

- 30분 세션에서도 exact/metadata retrieval이 고정 recall eval을 반복적으로 통과하지 못할 때
- patch conflict/retry가 AI job의 유의미한 비율을 차지할 때
- checkpoint latency·비용이 session 진행이나 결과 생성 budget을 넘을 때
- Wiki schema가 책 장르나 토론 형태를 충분히 표현하지 못할 때
- 세션 간 기억이 Product Decision으로 추가될 때

## [TECH-024] Normalized Book Context Pack과 AI 선행 Provider foundation

- Date: 2026-09-01
- Status: ACCEPTED
- Owner: Product owner / Engineering
- Related:
  - `PRODUCT_SPEC.md` §18~§20
  - `docs/BOOK_CONTEXT_SPEC.md`
  - `docs/TECHNICAL_PLAN.md` §5.1, §9.7, §16
  - `PRODUCT-025`, `PRODUCT-027`, `PRODUCT-028`
  - `TECH-006`, `TECH-007`, `TECH-011`, `TECH-013`

### Context

초기 Slice 2 구현은 Published Pack catalog, 짧은 설명과 exact version pin만 만들었다. 이는 방 생성 흐름에는 충분하지만 Product Spec의 7개 지식 section, 항목별 FACT/해석 구분, 출처·근거·불확실성을 표현하지 못한다. Builder를 Slice 7까지 미루면서 content model까지 미루면 Slice 5 Evaluator/Host가 `short_description`이나 임시 JSON에 결합되고 나중에 AI contract를 다시 만들어야 한다.

### Decision

- Book Context authoring model은 version에 종속된 normalized section, item, item relation, source와 item-source evidence table로 구현한다.
- item은 7개 section, stable id, `FACT | AUTHOR_STATEMENT | INTERPRETATION | DISCUSSION_SIGNAL`, book locator와 `SUPPORTED | LIMITED | CONFLICT | INSUFFICIENT` evidence state를 가진다.
- source는 Tier A~E와 citation/locator metadata를 보존하고 item-source 관계는 `SUPPORTS | CONTRADICTS | CONTEXT_ONLY`를 표현한다.
- Draft authoring row와 Builder intermediate artifact를 live AI consumer에서 분리한다.
- Published content row는 불변이며 새 version Publish와 기존 active version Retire를 한 transaction으로 처리한다.
- 신규 catalog에는 active Published만 노출하지만 room에 고정된 Retired exact version은 기존 session consumer가 계속 읽을 수 있다.
- application의 `BookContextProvider`가 normalized row를 canonical `BookContextDocumentV1` 또는 budgeted subset으로 조립한다. Evaluator/Host는 table과 Builder schema를 직접 import하지 않는다.
- Slice 2에 Pack content/provider foundation과 실제 구조를 가진 최소 Published fixture를 추가한다.
- 자동 웹 조사, durable Builder, Admin 편집·재생성·Review·Publish Gate·감사 UI는 Slice 7에서 완성한다.
- Full-text book ingestion과 embedding index는 만들지 않는다.

### Alternatives

1. Pack 전체를 단일 JSONB document로만 저장
2. `short_description`만 유지하고 Builder 구현 시 schema 결정
3. Builder와 Pack content model 전체를 Slice 2로 당김
4. 처음부터 책 전체 본문 RAG를 Pack 대신 사용
5. Evaluator와 Host가 Pack DB table을 직접 조회

### Rationale

항목별 편집, 출처 다대다 관계, 충돌과 Publish validation에는 normalized model이 명확한 FK와 감사 경계를 제공한다. Provider는 AI contract를 저장·Builder 구현에서 분리한다. content foundation만 먼저 만들고 운영 workflow를 Slice 7에 유지하면 AI가 실제 제품 구조를 사용하면서도 MVP 일정에 Builder 전체를 앞당기지 않는다.

### Trade-offs

- 단일 JSONB보다 table·join·mapper와 migration 수가 늘어난다.
- canonical document 조립과 schema version adapter가 필요하다.
- Slice 2 범위가 Pack foundation만큼 늘어난다.
- 최소 Published fixture의 출처·근거를 수동 검수해 유지해야 한다.

### Consequences

- 기존 `20260901020000_book_catalog.sql`은 catalog/version skeleton으로 문서화하고 후속 migration에서 content model을 확장한다.
- `docs/BOOK_CONTEXT_SPEC.md`가 Pack/Provider/Builder 구현의 상세 기준이 된다.
- public catalog contract와 internal/admin Pack contract export를 분리한다.
- Slice 5 AI는 room-pinned `BookContextProvider`만 사용하고 Builder artifact/web search에 접근하지 않는다.
- Pack immutability, Retired exact-version access, evidence/reference와 Publish Gate가 DB/provider test에 포함된다.

### Revisit Trigger

- normalized authoring query와 운영자 편집 성능이 실제 병목이 될 때
- canonical document assembly latency가 AI context budget을 반복적으로 넘을 때
- Pack만으로 Book Grounding 품질이 사용자 실험의 병목으로 확인될 때
- 콘텐츠 권리 검토가 source metadata나 evidence 보존 방식을 변경하도록 요구할 때
- Full-text RAG 도입이 별도 Product/Technical Decision으로 승인될 때

## [TECH-025] 밀리의 서재 기반 Design System v0.2 시각 리셋

> UI font와 typography spacing clause는 `[TECH-026]`이 대체한다.

- Date: 2026-09-02
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `docs/DESIGN_SYSTEM.md`
  - `TECH-001`, `TECH-022`

### Context

기존 `Warm Editorial`의 beige·terracotta 색감은 제품 소유자가 원하는 밝고 익숙한 독서 서비스의 인상과 맞지 않았다. 제품 행동과 이미 합의한 정보 구조는 유지하면서 color, typography hierarchy, radius와 component emphasis를 다시 정할 필요가 있다.

### Decision

- Design System v0.2의 최우선 시각 reference로 2026-09-02 현재 밀리의 서재 웹을 사용한다.
- `#242424`와 white를 기본으로 하고 `#F7F7F7`, `#F2F2F2`, `#ECECEC`, `#6F6F6F`의 neutral scale을 사용한다.
- `#FFC004`는 선택, 현재 위치, unread와 짧은 강조에 제한한다. 대표 행동은 `#242424` 배경과 white text를 사용한다.
- 밝은 노랑을 흰 배경 위 text나 의미 있는 icon에 직접 사용하지 않고 `accent-strong`을 별도로 둔다. focus ring은 검정으로 유지해 접근 가능한 경계를 만든다.
- 밀리의 서재에서 확인한 굵고 간결한 sans-serif hierarchy를 따르되 기존 번들·라이선스 기준선인 SUIT Variable은 유지한다.
- 작은 control은 4–6px, content card는 12px, 큰 media surface는 20px radius를 사용한다. pill은 짧은 상태와 avatar에만 제한한다.
- 밀리의 서재 로고, 일러스트, 마케팅 banner, 서비스 고유 명칭과 콘텐츠 모듈은 복제하지 않는다.
- 이 결정은 visual system만 변경하며 토론 flow, 권한, AI 개입 정책과 정보 architecture는 변경하지 않는다.

### Alternatives

1. 기존 Warm Editorial palette 유지
2. 모든 primary action과 넓은 surface를 brand yellow로 채움
3. 밀리의 서재 화면 구성과 marketing asset까지 그대로 복제

### Rationale

강한 흑백 대비와 넓은 neutral surface는 책 표지와 대화를 전면에 두면서 복잡도를 낮춘다. 노랑을 작은 navigation signal로 제한하면 독서 서비스의 친숙함을 가져오면서 토론 중 긴 텍스트의 피로와 접근성 문제를 줄일 수 있다.

### Trade-offs

- 기존 warm tone보다 감성적인 독립서점 인상은 줄어든다.
- accent가 primary button과 분리되어 token과 component variant가 조금 늘어난다.
- reference와 동일한 Pretendard 대신 SUIT를 유지하므로 글자 형태는 완전히 같지 않다.

### Consequences

- `packages/design-system/src/tokens.css`, foundation component와 showcase를 v0.2 token으로 갱신한다.
- 이후 wireframe은 구조를 유지한 채 v0.2 palette와 component hierarchy를 적용한다.
- yellow text/icon의 contrast와 black primary action의 focus state를 component test에서 검증한다.

### Revisit Trigger

- 실제 사용자 검증에서 노랑의 사용량이나 neutral tone이 토론 상태 인지를 방해할 때
- 브랜드 identity가 확정되어 별도 고유 palette와 typeface가 필요해질 때
- dark theme가 제품 요구로 확정될 때

## [TECH-026] Pretendard Variable 기반 typography revision

- Date: 2026-09-02
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `docs/DESIGN_SYSTEM.md`
  - `TECH-001`, `TECH-025`

### Context

Design System v0.2는 밀리의 서재를 최우선 시각 reference로 삼았지만 기존 구현 비용을 줄이기 위해 SUIT Variable을 유지했다. High-fidelity 탐색·참가 흐름에서 SUIT의 글자 형태와 과도한 굵기·음수 자간이 reference보다 각지고 조밀하게 느껴진다는 제품 소유자 피드백이 확인되었다.

### Decision

- 기본 UI 서체를 self-hosted `Pretendard Variable`로 변경한다.
- fallback은 `Pretendard`, platform sans, `Segoe UI`, `Noto Sans KR`, `sans-serif` 순으로 둔다.
- display와 page title은 700, section·topic·label은 600, metadata와 navigation은 500, 본문은 400을 기본으로 한다.
- body와 chat의 letter spacing은 `0`으로 되돌리고 제목의 음수 자간은 `-0.018em` 이내에서 제한한다.
- 로고 wordmark는 같은 family의 700을 사용하되 브랜드 식별을 위해 `-0.05em` 자간을 유지한다.

### Alternatives

1. SUIT Variable 유지 후 weight와 tracking만 조정
2. 외부 CDN에서 Pretendard를 런타임 로드
3. 제목과 본문에 서로 다른 sans-serif 사용

### Rationale

실제 reference와 같은 글자 형태를 사용하면 시안과 구현의 시각 차이를 제거할 수 있다. npm package에 포함된 variable dynamic subset을 자체 번들하면 외부 font CDN 장애와 개인정보 노출 없이 필요한 한글 glyph만 내려받을 수 있다.

### Trade-offs

- font package와 subset asset이 번들에 추가된다.
- 기존 SUIT 기준 screenshot과 시각 회귀 baseline을 갱신해야 한다.
- 같은 크기에서도 글자 폭이 달라 일부 줄바꿈이 바뀔 수 있다.

### Consequences

- `packages/design-system/src/tokens.css`와 app entry font import를 함께 변경한다.
- High-fidelity 시안과 logo wordmark typography를 동일한 기준으로 갱신한다.
- mobile 320px과 desktop layout에서 줄바꿈·overflow를 다시 검증한다.

### Revisit Trigger

- 실제 사용자 테스트에서 장문 토론 가독성이 여전히 낮게 평가될 때
- font asset 비용이 초기 로딩 목표를 반복적으로 초과할 때
- 독자적인 브랜드 typeface가 별도 Product Decision으로 확정될 때

# Product Changes

제품 요구사항 변경이 필요할 때만 기록한다.

제품 변경은 사용자와 명시적으로 합의하기 전에는 `ACCEPTED`로 만들지 않는다.

## [PRODUCT-001] 전 사용자 계정 로그인과 검색 가능한 패스워드 토론방

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.1
  - `docs/MVP_FUNCTIONAL_SPEC.md` §3, §5

### Context

여러 토론이 존재할 때 사용자가 자신이 만든 토론, 참여한 토론, 종료된 토론 결과를 지속적으로 확인하고 관리하려면 세션별 게스트 식별보다 계정 기반 식별이 필요하다. 동시에 토론방을 발견하고 접근하는 기본 방식을 정해야 한다.

### Decision

- 방장과 일반 참가자 모두 계정 로그인을 필수로 한다.
- 게스트 참가는 MVP에서 제공하지 않는다.
- 참가자는 세션별 닉네임이 아니라 계정 프로필에 설정한 이름을 모든 토론에서 사용한다.
- 사용자는 자신이 생성했거나 참여한 여러 토론과 결과를 계정을 통해 관리한다.
- 도서관 회원 여부는 MVP에서 확인하지 않는다.
- 로그인한 사용자는 토론방을 검색할 수 있다.
- 토론방에 참가하려면 계정 비밀번호와 별개인 해당 방의 참가 패스워드를 입력해야 한다.

### Alternatives

1. 방장만 계정을 사용하고 일반 참가자는 초대 링크와 닉네임으로 참여
2. 모든 참가자가 도서관 회원 인증 후 참여
3. 검색 없이 초대 링크 또는 코드로만 비공개 참여

### Rationale

계정 기반 식별은 여러 토론과 결과를 한 사용자의 이력으로 관리하고 재접속·재열람 경험을 안정적으로 제공한다. 도서관 회원 인증은 핵심 AI 호스팅 가설 검증과 직접 관련이 적어 MVP에서 제외한다. 검색과 방별 참가 패스워드를 결합해 발견 가능성과 접근 제어를 함께 제공한다.

### Trade-offs

- 게스트 참여보다 초기 가입 장벽이 높아진다.
- 계정 복구와 프로필 관리 기능이 필요하다.
- 토론방 참가 패스워드의 설정·변경·공유·오입력 처리가 필요하다.
- 검색 결과에 노출할 토론방 정보와 개인정보 범위를 별도로 정해야 한다.

### Consequences

- 최소 프로필과 내 토론 목록이 MVP 범위에 포함된다.
- 세션 메시지, 사전 입력, 마지막 한 줄, 결과 접근권은 계정 사용자와 연결된다. 인앱 설문은 `[PRODUCT-008]`에서 MVP 제외로 변경되었다.
- 토론방 참가 패스워드는 계정 인증 정보와 분리해 취급한다.
- 구체 인증 공급자와 자격 증명 방식은 Technical Decision으로 남긴다.

### Revisit Trigger

- 파일럿에서 회원가입이 참여율을 크게 낮출 때
- 도서관 시스템과의 회원 연동이 필수 운영 요구로 확인될 때
- 검색 가능한 토론방이 운영·프라이버시 문제를 만들 때

## [PRODUCT-002] 이메일·비밀번호 로그인과 이메일 인증 생략

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.1
  - `docs/MVP_FUNCTIONAL_SPEC.md` §3

### Context

전 사용자 계정 로그인을 전제로 MVP의 구체적인 가입·로그인 수단과 가입 완료 조건을 정해야 한다. 파일럿 단계에서는 이메일 소유 확인이 핵심 AI 토론 가설 검증에 직접 필요하지 않고 추가적인 참여 단계를 만든다.

### Decision

- MVP는 이메일과 비밀번호로 회원가입·로그인한다.
- 가입 이메일 확인을 요구하지 않는다.
- 이메일 인증을 완료하지 않아도 토론을 생성하고 참가할 수 있다.
- 비밀번호 재설정은 가입 시 입력한 이메일을 통해 제공한다.
- 소셜 로그인은 MVP에서 제공하지 않는다.

### Alternatives

1. 가입 이메일 확인 완료 후에만 토론 생성·참가 허용
2. 이메일 인증 링크만 사용하는 passwordless 로그인
3. 소셜 로그인 제공

### Rationale

MVP의 가입 단계를 줄이고 계정 기반 토론 관리에 필요한 최소 기능만 제공한다. 비밀번호 재설정은 기본적인 계정 복구를 위해 유지한다.

### Trade-offs

- 실제 소유하지 않은 이메일이나 오타가 있는 이메일로 계정이 생성될 수 있다.
- 잘못 입력한 이메일은 정상적인 비밀번호 복구가 어려울 수 있다.
- 공개 운영 시 계정 도용, 사칭, 중복 계정, 스팸 대응이 부족할 수 있다.

### Consequences

- 가입 화면은 이메일, 비밀번호, 프로필 이름을 필수로 받는다.
- 이메일은 계정 식별자로 중복될 수 없다.
- 미확인 이메일 상태 때문에 토론 기능을 차단하지 않는다.
- 인증 공급자는 이메일 확인을 필수로 강제하지 않도록 구성해야 한다.

### Revisit Trigger

- 제한된 파일럿을 넘어 불특정 사용자가 가입하는 공개 서비스로 전환할 때
- 사칭, 스팸, 계정 복구 실패가 운영 문제로 확인될 때
- 이메일 발송 신뢰도나 개인정보 관련 운영 요구가 변경될 때

## [PRODUCT-003] 계정 이메일 고유성과 프로필 표시 정책

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.1, §3.2
  - `docs/MVP_FUNCTIONAL_SPEC.md` §3

### Context

계정 기반 토론 관리에서 로그인 식별자의 중복을 방지해야 하며, 참가자에게 표시되는 이름과 아바타가 세션별 값인지 계정 프로필 값인지 구체화해야 한다. 이름 변경이 이미 확정된 공동 기록까지 소급 변경하면 과거 화면과 원본 근거의 안정성이 약해질 수 있다.

### Decision

- 이메일은 계정 식별자로 사용하며 중복 가입을 허용하지 않는다.
- 회원가입 시 프로필 이름을 필수로 입력한다.
- 프로필 이름은 사용자 사이에 중복될 수 있다.
- 실제 사용자는 프로필 이름이 아니라 계정 ID로 구분한다.
- MVP에서는 프로필 이미지 업로드 없이 이름의 첫 글자를 기본 아바타로 사용한다.
- 사용자는 프로필 이름을 변경할 수 있다.
- 이름 변경은 과거 메시지와 마지막 한 줄의 표시 이름에 소급 적용하지 않는다.
- 변경된 이름은 이후 새로 작성하는 메시지와 새 토론 참여에 적용한다.

### Alternatives

1. 프로필 이름을 서비스 전체에서 고유하게 강제
2. 세션별 닉네임 사용
3. 이름 변경 시 모든 과거 기록도 현재 이름으로 표시
4. MVP부터 프로필 이미지 업로드 제공

### Rationale

이메일 고유성으로 계정 로그인을 안정적으로 유지하면서, 사람 이름이나 자연스러운 닉네임의 중복을 불필요하게 제한하지 않는다. 당시 표시 이름을 원본 메시지와 함께 보존해 과거 토론 기록의 안정성을 유지한다.

### Trade-offs

- 같은 세션에 동일한 프로필 이름을 쓰는 참가자가 있으면 화면에서 혼동될 수 있다.
- 이름 변경 후 과거 기록과 현재 프로필에 서로 다른 이름이 보일 수 있다.
- 업로드 아바타가 없어 참가자 구분을 이름과 이니셜에 더 의존한다.

### Consequences

- 메시지와 마지막 한 줄에는 작성 시점의 표시 이름 snapshot을 보존한다.
- 권한, 귀속, 참여 이력은 변경 가능한 이름이 아니라 불변 계정 ID로 판정한다.
- 동일 이름 참가자 구분을 돕는 UI는 접근성·기술 설계에서 보완한다.

### Revisit Trigger

- 동일 이름 참가자로 인한 실제 토론 혼동이 반복될 때
- 사용자 식별을 위한 고유 handle이 필요해질 때
- 프로필 이미지가 참여 경험에 중요한 요구로 확인될 때

## [PRODUCT-004] 회원 토론방 생성과 필수 설정값

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.3
  - `docs/MVP_FUNCTIONAL_SPEC.md` §4, §5

### Context

검색 가능한 여러 토론방을 회원이 직접 관리하려면 누가 방을 생성할 수 있는지, 생성자가 어떤 권한을 얻는지, 실제 토론에 사용할 수 있는 책과 필수 설정값을 정해야 한다.

### Decision

- 로그인한 모든 회원은 토론방을 생성할 수 있다.
- 생성자가 자동으로 해당 방의 방장이 된다.
- 운영자가 Publish한 Book Context Pack이 있는 책만 선택할 수 있다.
- Publish된 Pack이 없는 책으로는 토론방을 생성할 수 없다.
- 방 제목, 책, 시작 예정 시각, 참가 패스워드, 최소 참가 인원, 최대 참가 인원은 모두 필수 입력값이다.
- 생성 후 방장은 별도의 방 설정 화면에서 토론방 정보를 관리한다.

### Alternatives

1. 운영자만 토론방 생성
2. 승인된 일부 회원만 토론방 생성
3. Publish된 Pack이 없는 책도 먼저 방을 만들고 나중에 Pack 연결
4. 참가 인원 범위를 고정값으로 두어 생성 시 입력하지 않음

### Rationale

회원이 여러 토론을 직접 만들고 관리할 수 있게 하면서, AI Host가 사용할 수 있는 검수된 책 지식과 참가 규모를 방 생성 시점에 명확히 확보한다.

### Trade-offs

- Publish된 책이 부족하면 회원이 원하는 책으로 즉시 방을 만들 수 없다.
- 최소·최대 인원과 시작 가능 조건을 일관되게 검증해야 한다.
- 방 설정 변경이 이미 참가한 회원에게 미치는 영향을 별도로 정의해야 한다.

### Consequences

- 회원용 방 생성·설정 화면과 운영자용 Published 책 목록이 연결된다.
- 방장은 자신의 방을 내 토론 목록에서 관리할 수 있어야 한다.
- 최소·최대 인원의 허용 범위와 실제 시작·참가 차단 규칙은 후속 제품 결정으로 정한다.

### Revisit Trigger

- Publish 대기 때문에 방 생성 실패가 반복될 때
- 사용자 테스트에서 생성 입력 항목이 과도한 장벽으로 확인될 때
- 특정 규모의 토론만 지원해야 하는 운영 요구가 생길 때

## [PRODUCT-005] 토론방 참가 인원 범위와 적용 규칙

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.3
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5, §7

### Context

방장이 최소·최대 참가 인원을 필수로 입력하므로 허용 가능한 범위와 실제 세션 시작·참가 제한에 어떻게 적용되는지 정해야 한다.

### Decision

- 방별 설정은 `2 ≤ 최소 참가 인원 ≤ 최대 참가 인원 ≤ 15`를 만족해야 한다.
- 방장은 참가 인원 계산에 포함한다.
- 최소 시작 인원과 최대 참가 인원의 구체 계산 기준은 후속 `[PRODUCT-011]`을 따른다.
- `[PRODUCT-011]` 기준의 최소 시작 인원이 충족되지 않으면 세션을 시작할 수 없고, 최대 참가 인원에 도달하면 추가 참가를 차단한다.

### Alternatives

1. 최소 2명, 최대 8명
2. 모든 방의 참가 정원을 고정
3. 최소 인원 미달이어도 방장 확인 후 시작 허용
4. 최대 인원 초과 시 대기 목록 제공

### Rationale

최소 두 명의 인간 참가자를 보장하면서 소규모부터 최대 15명의 도서관 독서모임까지 방장이 토론 규모를 정할 수 있게 한다. 설정값이 실제 시작과 참가 제한에 직접 반영되어 참가자 기대와 운영 상태를 일치시킨다.

### Trade-offs

- 15명 규모에서는 의미 있는 참여 균형과 실시간 메시지 흐름 관리가 어려워질 수 있다.
- 최소 인원 미달 시 예정된 세션을 시작하지 못하는 상황에 대한 안내가 필요하다.
- 최대 인원 도달 후 참가 희망자를 위한 대기 목록은 별도 기능이 없으면 제공되지 않는다.

### Consequences

- 생성·수정 폼은 인원 범위와 상호 관계를 검증해야 한다.
- 대기실과 시작 버튼은 현재 인원 대비 최소 인원 상태를 보여줘야 한다.
- 검색 결과와 방 상세는 현재 인원과 최대 인원을 보여줄 수 있어야 한다.
- 15명 규모의 AI 평가 trigger와 Participation Balance 품질을 파일럿에서 확인해야 한다.

### Revisit Trigger

- 대규모 방에서 메시지 흐름 또는 AI 평가 품질이 반복적으로 저하될 때
- 최소 인원 미달 취소가 자주 발생할 때
- 대기 목록이나 추가 정원 정책이 필요해질 때

## [PRODUCT-006] 패스워드 즉시 참가와 세션 종료 전 신규 참가 허용

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5, §7, §8

### Context

검색한 토론방의 패스워드를 입력한 뒤 방장 승인이 추가로 필요한지, 시작 예정 시각과 실제 시작을 어떻게 연결할지, 토론 진행 중 신규 참가와 기존 참가자의 재접속을 어디까지 허용할지 정해야 한다.

### Decision

- 올바른 참가 패스워드를 입력한 로그인 사용자는 방장 승인 없이 즉시 참가한다.
- 세션 시작 전 참가자는 대기실로 이동한다.
- 방장은 시작 예정 시각 이후이고 최소 참가 인원이 충족된 경우 수동으로 세션을 시작한다.
- 공식 종료 전에는 Core Discussion, Synthesis, Closing을 포함한 모든 단계에서 신규 참가를 허용한다.
- 신규 참가에는 올바른 패스워드와 최대 인원 미도달 조건이 적용된다.
- 기존 참가자는 공식 종료 전까지 동일 계정으로 재접속할 수 있다.
- 공식 종료 후에는 신규 참가와 대화 재접속을 허용하지 않는다.

### Alternatives

1. 패스워드 입력 후 방장 승인 필요
2. Core Discussion 시작 후 신규 참가 차단
3. Synthesis 시작 후 신규 참가 차단
4. 예정 시각 이전에도 최소 인원만 충족하면 방장이 조기 시작

### Rationale

패스워드 자체를 참가 권한으로 사용해 방장의 승인 부담을 줄이고, 지각한 회원도 토론이 공식 종료되기 전에는 참여할 수 있게 한다. 실제 시작은 예정 시각과 최소 인원을 충족한 뒤 방장이 명시적으로 결정한다.

### Trade-offs

- Synthesis나 Closing 중 들어온 신규 참가자는 충분한 대화 맥락 없이 마지막 단계에 참여할 수 있다.
- 늦은 참가자의 등장으로 Participation Balance와 활성 참가자 계산이 변할 수 있다.
- 공식 종료 직전의 참가가 결과 접근권과 내부 토론 분석에 미치는 영향을 명확히 기록해야 한다.

### Consequences

- 세션 상태가 열려 있는 동안 참가 엔드포인트와 대기·토론 화면 진입을 허용한다.
- 늦은 참가자에게 현재 단계, 현재 의제 또는 정리 상태, 남은 시간을 즉시 보여줘야 한다.
- AI 평가에서 늦은 참가자를 기존 침묵 참가자로 오인하지 않도록 참가 시점을 보존한다.
- 세션 종료 확정은 참가 가능 여부를 닫는 명시적 경계가 된다.

### Revisit Trigger

- Synthesis·Closing 중 신규 참가가 실제 토론 마무리를 반복적으로 방해할 때
- 지각 참가자의 결과 접근 또는 내부 토론 분석이 제품 학습을 왜곡할 때
- 방장 승인이나 참가 마감 기능에 대한 운영 요구가 생길 때

## [PRODUCT-007] 토론방 검색 범위와 사용자용 진행 상태

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.5
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5

### Context

검색 가능한 패스워드 토론방에서 사용자가 어떤 기준으로 방을 찾고, 참가 전에 어떤 정보를 보며, 진행 단계와 참가 가능 여부를 어떻게 구분할지 정해야 한다. AI 내부 상태가 사용자용 상태로 오인되어 노출되지 않도록 경계도 필요하다.

### Decision

- 전체 검색에는 시작 전이거나 진행 중인 토론방을 포함한다.
- 방 제목, 책 제목, 저자로 검색할 수 있다.
- 검색 결과에는 방 제목, 책 표지·제목·저자, 방장 프로필 이름, 시작 예정 시각, 진행 상태, 현재/최대 참가 인원을 표시한다.
- 참가자 명단과 참가 패스워드는 검색 결과에 표시하지 않는다.
- 진행 상태는 `시작 예정 / 시작 대기 / 토론 중 / 연장 중 / 마무리 중 / 종료`로 표시한다.
- 참가 가능 여부는 진행 상태와 분리해 `참여 가능 / 정원 마감`으로 표시한다.
- 진행 중인 방도 공식 종료 전이고 정원이 남아 있으면 검색과 신규 참가가 가능하다.
- 종료된 토론은 전체 검색에서 제외하고 실제 참여자의 `내 토론`에만 표시한다.
- Discussion Metrics와 AI 내부 판단 상태는 사용자용 진행 상태로 노출하지 않는다.

### Alternatives

1. 시작 전 방만 검색 가능
2. 종료된 토론도 전체 검색 가능
3. 참가자 명단까지 검색 결과에 공개
4. 세션 진행 상태와 참가 가능 상태를 하나의 label로 통합

### Rationale

사용자가 책과 방을 쉽게 발견하면서도 참가 전에 필요한 운영 정보만 확인하게 한다. 진행 단계와 정원 상태를 분리해 `마무리 중이지만 참여 가능`처럼 앞서 합의한 정책을 정확히 표현한다.

### Trade-offs

- 진행 중이거나 마무리 중인 방이 계속 검색되어 늦은 참가가 늘 수 있다.
- 방장 이름과 현재 인원이 전체 로그인 사용자에게 노출된다.
- 세션 상태 전환이 사용자 화면과 검색 색인에 빠르게 반영되어야 한다.

### Consequences

- 검색 결과와 방 상세는 동일한 상태 정의를 사용해야 한다.
- 종료 전 검색 가능성과 최대 인원 제한을 함께 검사해야 한다.
- 종료 이벤트가 발생하면 전체 검색에서 방을 제거하고 참여자의 내 토론에는 유지해야 한다.

### Revisit Trigger

- 진행 중 방의 검색 노출이 토론 흐름을 반복적으로 방해할 때
- 방장 이름이나 인원 정보의 노출 범위를 줄여야 할 때
- 종료된 토론의 공개 아카이브 요구가 생길 때

## [PRODUCT-008] 인앱 종료 설문 MVP 제외

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §21
  - `docs/MVP_FUNCTIONAL_SPEC.md` §13, §17, §18

### Context

기존 제품 기준선에는 세션 종료 후 6문항 설문과 사고 확장 점수 수집이 포함되어 있었다. MVP 구현 범위를 줄이고 핵심 토론 경험에 집중하기 위해 인앱 설문 기능의 포함 여부를 다시 결정했다.

### Decision

- MVP 제품에서 인앱 종료 설문 기능을 전체 제외한다.
- 설문 문항, 응답 저장, 응답 상태, 결과 공개 기능을 구현하지 않는다.
- 사고 확장은 계속 제품이 지향하는 Outcome으로 유지한다.
- 사용자 Outcome 확인이 필요하면 제품 기능과 분리된 파일럿 인터뷰나 운영 리서치로 진행한다.
- 제품 내부에서는 Discussion Metrics, Policy Action, AI 개입, 이후 대화 변화를 Diagnostic으로 연결한다.

### Alternatives

1. 기존 6문항 설문 유지
2. 최상위 사고 확장 문항 1개만 유지
3. 설문을 선택적으로 제공

### Rationale

MVP에서 핵심 AI 독서토론 흐름과 직접 관련된 기능에 우선 집중하고, 세션 종료 경험에 추가 입력을 요구하지 않는다.

### Trade-offs

- 앱 데이터만으로 사용자의 사고 확장, 만족도, AI 과잉 개입 체감을 정량 측정할 수 없다.
- 내부 Discussion Metrics가 실제 사용자 Outcome과 일치하는지 자동으로 비교하기 어렵다.
- 사용자 검증에는 별도 인터뷰나 운영 리서치가 필요할 수 있다.

### Consequences

- Closing 이후 설문 화면이나 설문 상태를 두지 않는다.
- 내 토론과 종료된 방에는 설문 응답 상태를 표시하지 않는다.
- observability의 인앱 연결 범위는 이후 대화 변화까지로 제한된다.

### Revisit Trigger

- 파일럿에서 정량적 사용자 Outcome 측정이 필요해질 때
- AI 개입 품질을 내부 지표만으로 판단하기 어렵다고 확인될 때

## [PRODUCT-009] 내 토론 분류와 종료된 토론방 읽기 전용 재열람

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.4, §3.5, §10.5, §11
  - `docs/MVP_FUNCTIONAL_SPEC.md` §3, §5, §12

### Context

계정 사용자가 여러 토론을 관리하려면 내 토론의 분류·정렬·역할 표시가 필요하다. 종료된 토론의 결과뿐 아니라 실제 토론방과 전체 대화를 다시 열람할 수 있는지도 정해야 한다.

### Decision

- `내 토론`은 `진행 중 / 예정 / 종료`로 나눈다.
- 사용자가 만든 방과 참가한 방을 함께 표시하고 `방장 / 참가자` 역할을 표시한다.
- 진행 중 방을 최상단, 예정 방을 가까운 시작 시각 순, 종료 방을 최근 종료 순으로 정렬한다.
- 항목에는 방 제목, 책, 진행 상태, 시작 예정 시각, 현재/최대 인원을 표시한다.
- 실제 참여자는 종료된 토론방에 읽기 전용으로 다시 들어가 전체 대화, 책·세션 정보, 「오늘의 토론 기록」을 열람할 수 있다.
- 종료된 방에서는 새 메시지, AI 개입, 사전 입력 변경을 허용하지 않는다.
- 참여하지 않은 사용자는 종료된 토론방을 검색하거나 열람할 수 없다.

### Alternatives

1. 종료 후 「오늘의 토론 기록」만 제공하고 원본 토론방은 닫음
2. 종료된 토론도 전체 검색과 공개 열람 허용
3. 만든 방과 참가한 방을 별도 메뉴로 분리

### Rationale

회원 계정으로 여러 토론을 관리한다는 목표를 충족하고, 참가자가 최종 기록의 근거가 된 실제 대화를 나중에 다시 읽을 수 있게 한다. 공식 종료 이후에는 읽기 전용으로 유지해 결과와 원본 기록의 안정성을 보존한다.

### Trade-offs

- 원본 대화의 장기 보관과 참여자 전용 접근 제어가 필요하다.
- 이름 변경·탈퇴·삭제 요청과 과거 대화 보존 정책을 함께 설계해야 한다.
- 종료된 방 UI를 별도로 유지해야 한다.

### Consequences

- 종료된 방의 composer와 실시간 상호작용은 비활성화한다.
- 참여자 membership은 종료 이후 열람 권한 판정에 보존한다.
- 내 토론에서 종료된 방과 최종 기록으로 이동할 수 있어야 한다.

### Revisit Trigger

- 원본 대화 보관 비용이나 개인정보 요청이 운영 부담이 될 때
- 종료된 토론의 공유·공개 기능 요구가 생길 때

## [PRODUCT-010] 참가 등록과 실제 참여의 구분

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5, §7, §8, §12

### Context

패스워드를 한 번 통과한 모든 사용자를 영구적인 실제 참여자로 볼 경우, 단순 대기 후 취소하거나 실제 세션에 나타나지 않은 사용자까지 종료된 대화와 결과에 접근할 수 있다. `내 토론`, 정원, 사전 입력, 종료 후 열람권을 일관되게 관리하려면 참가 등록과 실제 참여의 경계를 나눌 필요가 있다.

### Decision

- 검색 결과나 방 상세 열람은 참가로 보지 않는다.
- 세션 시작 전 패스워드를 통과해 대기실에 들어가면 `참가 등록` 상태가 된다.
- 참가 등록은 지속되는 방 membership이며 최대 인원에 포함된다.
- 참가 등록 시 `내 토론 > 예정`에 추가되고 사전 입력을 작성할 수 있다.
- 일반 참가자는 시작 전에 참가를 취소할 수 있으며 membership, 내 토론 항목, 정원 점유가 제거된다.
- 세션 시작 후 실시간 토론방에 한 번 이상 접속하면 메시지 작성 여부와 관계없이 `실제 참여`로 확정한다.
- 세션 진행 중 처음 참가하면 참가 등록과 실제 참여가 동시에 확정된다.
- 실제 참여자는 중간에 나가도 종료된 토론방과 결과를 열람할 수 있다.
- 시작 전에 등록했지만 진행 중 한 번도 접속하지 않은 일반 참가자는 종료 후 내 토론에서 제거하고 대화·결과 열람권을 부여하지 않는다.
- 방장은 자신이 만든 방이므로 접속 여부와 관계없이 내 토론에 유지된다.

### Alternatives

1. 패스워드를 통과한 모든 사용자를 즉시 영구 참여자로 확정
2. 메시지를 한 번 이상 작성한 사용자만 실제 참여자로 인정
3. 참가 등록과 실제 참여를 구분하지 않음

### Rationale

대기실 등록과 실제 토론 참여를 분리해 정원과 사전 준비는 미리 관리하면서, 종료된 원본 대화와 결과 접근권은 실제로 세션에 들어온 사용자에게만 제공한다. 말하지 않고 듣기만 한 참가자도 독서토론의 참가자로 인정한다.

### Trade-offs

- membership, 현재 연결 상태, 실제 참여 이력을 별도로 관리해야 한다.
- 등록했지만 불참한 사용자의 종료 후 항목 제거가 예상과 다르게 느껴질 수 있다.
- 방장은 실제 불참하더라도 방 관리와 결과 접근권을 유지한다.

### Consequences

- `registered_at`, 참가 취소, 최초 live 접속 시점 같은 사실을 보존해야 한다.
- 종료 시 실제 참여 여부에 따라 내 토론 보존과 열람 권한을 확정해야 한다.
- 메시지 작성 여부는 실제 참여 판정 기준으로 사용하지 않는다.

### Revisit Trigger

- 등록 후 불참자의 방·결과 접근 요구가 반복될 때
- 읽기만 한 접속과 실제 참여를 더 세분해야 할 때
- 참가 등록 취소가 운영상 악용될 때

## [PRODUCT-011] 정원과 최소 시작 인원의 서로 다른 계산 기준

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.3, §3.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5, §7

### Context

참가 등록은 대기실에 들어온 지속 membership이므로 브라우저를 닫아도 정원 예약은 유지된다. 그러나 현재 접속하지 않은 등록자를 최소 시작 인원에 포함하면 실제 토론방에 충분한 사람이 없는 상태로 세션을 시작할 수 있다.

### Decision

- 최대 참가 인원은 현재 접속 여부와 관계없이 참가 등록 membership 수로 계산한다.
- 최소 시작 인원은 방장이 시작을 시도하는 시점에 대기실에 실제 접속 중인 참가 등록 회원 수로 계산한다.
- 방장은 두 계산에 모두 포함한다.
- 등록 후 대기실 접속을 종료한 일반 참가자는 정원을 계속 점유하지만 재접속 전까지 최소 시작 인원에는 포함되지 않는다.

### Alternatives

1. 최소·최대 인원을 모두 참가 등록 수로 계산
2. 최소·최대 인원을 모두 현재 접속자 수로 계산
3. 방장이 최소 인원 미달을 무시하고 시작 가능

### Rationale

참가 등록자의 자리는 보존하면서도 실제로 토론을 시작할 때는 최소한 설정된 수의 사람이 현재 함께 대기하고 있음을 보장한다.

### Trade-offs

- 등록자가 자리를 점유한 채 접속하지 않으면 신규 참가가 막힐 수 있다.
- 대기실 presence를 신뢰성 있게 추적해야 한다.
- 시작 직전 참가자의 연결이 끊기면 시작 버튼 상태가 바뀔 수 있다.

### Consequences

- 대기실은 참가 등록 수와 현재 접속 수를 구분해 관리해야 한다.
- 방장에게 `현재 접속 n명 / 시작 최소 m명`을 보여줘야 한다.
- 최대 인원 도달 상태는 presence가 아니라 membership으로 판정한다.

### Revisit Trigger

- 자리만 점유한 장기 미접속 등록자가 반복적으로 참가를 막을 때
- 불안정한 네트워크 때문에 최소 시작 인원 판정이 자주 흔들릴 때
- 등록 만료나 대기 목록 기능이 필요해질 때

## [PRODUCT-012] 세션 시작 전후 방 설정 변경 범위

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.3, §3.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5

### Context

방 생성 후 일정이나 참가 조건을 조정할 수 있어야 하지만, 참가자가 책을 기준으로 사전 입력을 작성한 뒤 책이 바뀌거나 진행 중인 세션의 핵심 정보가 바뀌면 사용자 기대와 AI 컨텍스트가 깨질 수 있다.

### Decision

- 세션 시작 전에는 방장이 방 제목, 시작 예정 시각, 참가 패스워드, 최소·최대 참가 인원을 수정할 수 있다.
- 책은 방장 외 다른 참가자가 한 명도 참가 등록하지 않은 경우에만 변경할 수 있다.
- 세션 시작 후에는 방 제목, 책, 시작 예정 시각, 최소 참가 인원을 변경할 수 없다.
- 세션 시작 후에도 참가 패스워드는 변경할 수 있다.
- 패스워드 변경은 기존 참가 등록자의 membership과 접속에 영향을 주지 않고 신규 참가자에게만 적용한다.
- 진행 중 최대 참가 인원은 15명까지 늘릴 수 있다.
- 최대 참가 인원을 줄일 때는 현재 참가 등록 membership 수보다 작게 설정할 수 없다.

### Alternatives

1. 세션 생성 후 모든 설정 변경 금지
2. 시작 전이면 참가 등록 여부와 관계없이 책 변경 허용
3. 시작 후에도 모든 설정 변경 허용
4. 진행 중 최대 인원 감소 금지

### Rationale

시작 전 운영 유연성을 제공하면서 책과 진행 상태의 정합성을 보호한다. 진행 중 패스워드 변경은 새 참가 접근을 관리하되 이미 들어온 참가자의 흐름을 끊지 않는다.

### Trade-offs

- 다른 참가자가 등록하면 방장은 책 선택 실수를 수정할 수 없다.
- 시작 시점에 UI와 API가 변경 가능한 필드를 즉시 잠가야 한다.
- 진행 중 정원 변경과 동시에 신규 참가가 발생하는 race condition을 처리해야 한다.

### Consequences

- 방 설정 화면은 세션 상태와 참가 등록 수에 따라 필드를 비활성화하고 이유를 표시해야 한다.
- 책 변경 가능 여부는 방장 외 참가 등록자가 있는지로 판정한다.
- 기존 참가자는 패스워드 변경 후 재접속할 때도 membership으로 복구되어 새 패스워드를 다시 입력하지 않는다.

### Revisit Trigger

- 책 오선택으로 방을 새로 만들어야 하는 사례가 반복될 때
- 진행 중 보안 문제로 기존 membership까지 재인증해야 할 때
- 정원 변경 요구가 운영을 복잡하게 만들 때

## [PRODUCT-013] 시작 전 토론방 취소와 취소 이력 보존

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.4, §3.5
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5

### Context

방장이 예정된 토론을 진행할 수 없을 때 방을 없애는 방법이 필요하다. 즉시 삭제하면 참가 등록 회원이 방이 사라진 이유를 알 수 없고 운영 이력도 잃게 되므로 취소와 삭제를 구분해야 한다.

### Decision

- 방장은 세션 시작 전에만 토론방을 취소할 수 있다.
- 취소는 삭제가 아니라 `취소됨` 상태 전환이다.
- 취소된 방은 전체 검색에서 즉시 제외한다.
- 모든 참가 등록 membership과 정원 점유를 해제한다.
- 취소 시점에 등록되어 있던 회원의 `내 토론 > 종료`에는 `취소됨` 상태의 항목을 남긴다.
- 취소된 방에서는 사전 입력, 대화, 「오늘의 토론 기록」을 열람하거나 변경할 수 없다.
- 세션 시작 후에는 취소할 수 없고 방장의 강제 종료를 사용한다.

### Alternatives

1. 취소 시 방과 관련 데이터를 즉시 삭제
2. 취소된 방을 내 토론에서도 제거
3. 세션 시작 후에도 취소 허용
4. 방 취소 없이 시작 시각 변경만 제공

### Rationale

참가자에게 예정된 토론이 취소되었다는 사실을 남기면서 검색과 정원에서는 즉시 제거한다. 시작된 세션은 공식 기록과 Raw Data가 발생하므로 취소가 아니라 강제 종료 흐름으로 처리한다.

### Trade-offs

- 취소된 방 카드와 최소한의 이력을 보관해야 한다.
- 별도 알림 기능이 없으면 회원이 내 토론을 열기 전까지 취소 사실을 알지 못할 수 있다.
- 참가 등록 해제와 내 토론 이력 보존을 서로 다른 상태로 처리해야 한다.

### Consequences

- 세션 상태 모델에 `CANCELED` terminal state가 필요하다.
- 취소된 방 카드는 열 수 없고 취소 상태만 확인할 수 있어야 한다.
- 취소 처리와 동시에 검색 제외·membership 해제가 원자적으로 반영되어야 한다.

### Revisit Trigger

- 취소 알림 요구가 반복될 때
- 취소 이력의 보관 기간을 제한해야 할 때
- 운영자 복구 또는 취소 철회 기능이 필요해질 때

## [PRODUCT-014] 사전 입력 잠금과 시작 후 신규 참가 흐름

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §4.3, §4.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5, §6, §7

### Context

사전 입력을 언제 작성·수정하고 다른 참가자에게 언제 보여줄지 정해야 한다. 공식 시작 이후에도 신규 참가를 허용하므로, 지각 참가자에게 사전 입력을 다시 요구할지와 현재 토론 맥락을 어떻게 전달할지도 필요하다.

### Decision

- 참가 등록된 회원은 대기실에서 선택적으로 사전 입력을 작성한다.
- 세션 시작 전까지 작성·수정·삭제와 항목별 공개 범위 변경을 허용한다.
- 세션 시작과 동시에 사전 입력과 공개 범위를 잠근다.
- `PUBLIC` 항목은 시작 전 대기실에서 참가 등록 회원에게 작성자 이름과 함께 보인다.
- 실시간 토론 중에는 사전 입력 전용 패널을 노출하지 않는다.
- 종료된 토론방에서 실제 참여자는 당시 `PUBLIC` 항목을 읽기 전용으로 볼 수 있다.
- `AI_PRIVATE`는 작성자 본인과 허용된 AI 내부 처리 경로 외에는 어떤 단계에서도 표시하지 않는다.
- 시작 후 신규 참가자는 사전 입력을 작성하지 않는다.
- 시작 후 참가자는 현재 진행 상태, 현재 의제 또는 정리 단계, 남은 시간, 현재/최대 인원을 확인한 뒤 `토론에 참여하기`를 선택해 입장한다.
- 입장 시 실제 참여자로 확정하고 참가 시점을 AI 평가에 제공한다.
- 마무리 중이면 해당 사실을 명확히 안내하지만 참가를 차단하지 않는다.

### Alternatives

1. 시작 후 신규 참가자도 간단한 사전 입력 작성
2. `PUBLIC` 사전 입력을 실시간 토론 중에도 별도 패널로 노출
3. 사전 입력을 세션 진행 중에도 수정 가능
4. 사전 입력을 다른 참가자에게 전혀 보여주지 않고 AI만 사용

### Rationale

사전 입력을 의제 준비 데이터로 명확히 한정하고 세션 시작 후 컨텍스트 변경을 막는다. 늦은 참가자는 이미 진행 중인 대화를 지연 없이 이해하고 합류하며, AI는 참가 시점을 고려해 참여 상태를 공정하게 판단한다.

### Trade-offs

- 늦은 참가자는 자신의 사전 관심사나 질문을 구조화해 제출할 기회가 없다.
- 시작 전에 공개된 참가자 생각이 다른 사람의 초기 관점에 영향을 줄 수 있다.
- 종료된 방에서 PUBLIC 사전 입력을 보관·열람하므로 데이터 보관 정책이 필요하다.

### Consequences

- 세션 시작 이벤트는 사전 입력 수정 권한을 원자적으로 잠가야 한다.
- 대기실과 종료된 방에 PUBLIC 전용 열람 UI가 필요하다.
- 시작 후 참가 진입 화면과 `joined_live_at` 같은 참가 시점 근거가 필요하다.
- Host Context Builder는 PUBLIC과 AI_PRIVATE 경계를 세션 전체에서 유지해야 한다.

### Revisit Trigger

- 늦은 참가자의 토론 적응이 반복적으로 어렵다고 확인될 때
- PUBLIC 사전 입력의 사전 노출이 토론 다양성을 낮출 때
- 진행 중 사전 입력 추가 요구가 커질 때

## [PRODUCT-015] 방장의 참가자 관리와 권한 이전

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §12
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5

### Context

방장의 최소 참가자 관리 권한을 실제 행동으로 정의하고, 방장이 세션을 계속 운영할 수 없을 때 권한을 넘기는 방법을 정해야 한다. 내보낸 참가자의 원본 발언과 종료 후 접근권도 명확히 구분할 필요가 있다.

### Decision

- 방장은 시작 전 대기실과 진행 중 토론에서 참가자를 내보낼 수 있다.
- 내보내진 참가자는 해당 방에 다시 참가할 수 없다.
- 내보내기 전 대상 이름과 영향을 확인하는 절차를 둔다.
- 내보낸 참가자의 기존 메시지와 Raw Data는 보존한다.
- 내보낸 참가자는 해당 방, 종료된 대화, 「오늘의 토론 기록」 열람권을 잃는다.
- membership과 정원 점유를 해제해 새 참가자가 들어올 수 있게 한다.
- 시작 전에는 참가 등록 회원에게, 시작 후에는 실제 참여자에게 방장 권한을 이전할 수 있다.
- 권한 이전 후 기존 방장은 일반 참가자가 된다.
- 공동 방장과 일반 참가자 신고·차단 기능은 MVP에서 제외한다.

### Alternatives

1. 참가자 내보내기만 제공하고 재참가 허용
2. 내보낸 실제 참여자에게 종료 후 열람권 유지
3. 방장 권한 이전 없이 최초 생성자가 항상 방장
4. 공동 방장과 신고 기능까지 MVP에 포함

### Rationale

심각한 상황에서 방장이 세션을 보호할 수 있게 하면서 원본 발언을 임의로 지우지 않는다. 단일 방장 모델을 유지하되 명시적인 권한 이전으로 운영 연속성을 확보한다.

### Trade-offs

- 내보내진 참가자가 이미 기여했더라도 대화와 결과를 열람할 수 없다.
- 방장에게 강한 접근 제어 권한이 생긴다.
- 권한 이전과 동시에 연장·종료 같은 운영 명령이 발생하는 race condition을 처리해야 한다.

### Consequences

- 방 membership에 내보내기와 재참가 차단 상태를 보존해야 한다.
- 내보내기와 권한 이전은 감사 가능한 운영 이벤트로 기록해야 한다.
- 메시지와 결과 생성은 내보낸 사용자의 기존 기여를 사실 원본으로 유지한다.
- 모든 방에는 정확히 한 명의 현재 방장이 존재해야 한다.

### Revisit Trigger

- 공동 진행 요구가 반복될 때
- 참가자 신고나 운영자 중재가 필요해질 때
- 내보내진 참가자의 결과 접근 정책이 분쟁을 만들 때

## [PRODUCT-016] 불변 텍스트 메시지와 inline reply 범위

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.6, §15, §16
  - `docs/MVP_FUNCTIONAL_SPEC.md` §8

### Context

실시간 텍스트 토론에서 지원할 메시지 형식, 길이, 수정·삭제, 답장, 반응, 첨부 범위를 정해야 한다. 특히 Raw Data를 변경되지 않는 사실 원본으로 유지한다는 제품 원칙과 사용자 메시지 수정·삭제 기능의 관계를 명확히 해야 한다.

### Decision

- MVP는 여러 줄을 지원하는 텍스트 메시지만 제공한다.
- 메시지 한 개의 최대 길이는 2,000자다.
- 서버에서 전송이 확정된 메시지는 참가자가 수정하거나 삭제할 수 없다.
- 작성자와 작성 시각을 표시한다.
- 원본 메시지를 참조하는 inline reply를 지원하고 짧은 인용을 표시한다.
- 전송 중, 실패, 재시도 상태를 표시한다.
- 재시도 시 동일 메시지가 중복 확정되지 않아야 한다.
- emoji reaction과 이미지·파일·음성 첨부는 MVP에서 제외한다.

### Alternatives

1. 짧은 시간 동안 메시지 수정·삭제 허용
2. 삭제 표시를 남기는 soft delete 제공
3. emoji reaction 포함
4. 이미지와 파일 첨부 포함

### Rationale

토론 원본과 AI 판단 근거의 정합성을 유지하고 텍스트 토론이라는 MVP 핵심 범위에 집중한다. Inline reply는 별도 thread 없이 관점 간 연결을 명확히 하는 데 직접 도움이 된다.

### Trade-offs

- 오타나 잘못 보낸 메시지를 사용자가 고칠 수 없다.
- 부적절한 메시지도 원본 기록에는 남으며 방장 내보내기만으로 메시지가 제거되지 않는다.
- reaction을 통한 가벼운 공감 표현을 제공하지 않는다.

### Consequences

- 전송 전 확인과 명확한 전송 상태가 중요하다.
- 메시지 API는 idempotency를 보장해야 한다.
- inline reply는 원본 message id와 인용 snapshot을 보존해야 한다.
- UI에 존재하는 reaction action은 실제 MVP 화면에서 제거한다.

### Revisit Trigger

- 오발송·개인정보 입력에 대한 삭제 요구가 반복될 때
- 운영자 법적 삭제나 moderation 요구가 생길 때
- reaction이 참여 경험에 중요하다고 확인될 때

## [PRODUCT-017] 참가자 목록과 presence·typing 노출 범위

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.7
  - `docs/MVP_FUNCTIONAL_SPEC.md` §8

### Context

대기실과 실시간 토론방에서 누가 참여 중인지 어느 수준까지 보여줄지, 그리고 AI가 침묵을 판단할 때 접속·입력 상태를 어떻게 활용할지 정해야 한다. 과도한 활동 정보는 참가자를 평가받는 느낌이 들게 할 수 있다.

### Decision

- 대기실에는 등록 참가자의 프로필 이름, 방장 여부, `접속 중 / 오프라인` 상태를 표시한다.
- 실시간 토론방 상단에는 현재 접속 인원을 표시하고 전체 참가자 목록은 펼쳐서 확인할 수 있게 한다.
- 실시간 참가자 목록에는 프로필 이름, 방장 여부, 단순 접속 상태만 표시한다.
- 메시지 작성 중에는 `프로필 이름 + 입력 중` 상태를 표시한다.
- 마지막 접속 시각, 발언량, 침묵 여부, 활동 점수와 Discussion Metrics는 참가자에게 공개하지 않는다.
- 화면 이탈이나 일시적인 연결 끊김은 참가 등록 또는 실제 참여 기록을 취소하지 않는다.
- AI는 presence, typing, 참가 시각을 내부 판단 신호로 사용할 수 있지만 이를 참가자 평가값으로 노출하지 않는다.

### Alternatives

1. 참가자 목록을 항상 고정 표시
2. 접속 상태를 참가자에게 전혀 표시하지 않음
3. 마지막 접속 시각과 발언량까지 공개
4. typing 상태를 AI만 사용하고 참가자에게는 숨김

### Rationale

같이 있는 사람과 입력 중인 사람은 알 수 있게 해 실시간 대화 감각을 제공하되, 참가자를 수치나 활동도로 평가하는 인상을 피한다. AI는 짧은 침묵이나 작성 중인 응답을 불필요한 개입 사유로 오인하지 않도록 최소한의 실시간 신호를 활용한다.

### Trade-offs

- 오프라인 표시는 실제 연결 상태와 짧게 어긋날 수 있다.
- 펼침형 목록이라 모든 참가자가 항상 보이지는 않는다.
- 참가자는 다른 사람의 구체적인 활동 이력을 확인할 수 없다.

### Consequences

- presence와 typing의 만료 시간, heartbeat, 재연결 방식은 기술 설계에서 정한다.
- 참가자 화면의 단순 상태와 AI·관측 로그용 내부 신호를 분리해야 한다.
- 일시적 연결 해제를 membership 취소나 퇴장으로 처리하면 안 된다.

### Revisit Trigger

- presence 오표시가 토론 경험에 반복적으로 혼란을 줄 때
- typing 표시가 심리적 부담이나 프라이버시 문제를 만들 때
- 참가자 목록의 고정 노출 요구가 반복될 때

## [PRODUCT-018] 중도 이탈과 재접속의 의미

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.8
  - `docs/MVP_FUNCTIONAL_SPEC.md` §8

### Context

진행 중 화면 이탈, 명시적인 나가기, 네트워크 단절을 참가 철회로 볼지 일시 접속 종료로 볼지 정해야 한다. 재접속 시 메시지와 세션 상태가 어긋나지 않도록 사용자 경험도 정의할 필요가 있다.

### Decision

- 브라우저 종료나 화면 이동은 일시 접속 종료이며 참가 등록과 실제 참여 기록을 유지한다.
- `나가기`는 재입장 가능성을 안내한 뒤 현재 화면에서만 나가는 동작이다.
- 세션 시작 후 참가자는 자신의 참여 기록을 완전히 철회하거나 정원 점유를 해제할 수 없다.
- 공식 종료 전까지 동일 계정으로 언제든 재입장할 수 있다.
- 재접속 시 놓친 메시지, 현재 의제와 단계, 남은 시간, 참가자 상태를 동기화한 뒤 입력을 허용한다.
- 동기화 중에는 연결 복구 상태를 표시하고 입력을 비활성화한다.
- AI는 오프라인 참가자를 침묵 중인 사람으로 평가하거나 발언 대상으로 지목하지 않는다.
- 종료 시 오프라인이어도 실제 참여자는 종료 후 기록과 결과 열람권을 유지한다.
- 이탈 횟수와 접속 시간은 다른 참가자에게 공개하지 않는다.

### Alternatives

1. 명시적인 나가기를 영구 참가 철회로 처리
2. 중도 이탈 시 정원 점유 즉시 해제
3. 재접속 직후 동기화와 무관하게 입력 허용
4. 장시간 오프라인이면 자동 참가 철회

### Rationale

모바일·브라우저 환경의 일시적인 연결 단절을 사용자 의사로 오해하지 않고 토론 기록과 결과 접근을 일관되게 유지한다. 완전 철회 기능을 두지 않아 기존 기여와 참가자 수의 의미가 중간에 바뀌는 문제도 피한다.

### Trade-offs

- 실제로 돌아오지 않는 참가자도 공식 종료 전까지 정원을 점유한다.
- 사용자는 진행 중 자신의 참여 이력을 완전히 삭제할 수 없다.
- 재접속 동기화가 끝날 때까지 잠시 메시지를 보낼 수 없다.

### Consequences

- 재접속 cursor, missed message 복구, 상태 snapshot의 일관성 전략이 필요하다.
- 명시적 나가기와 네트워크 단절은 동일하게 접속 상태만 변경한다.
- 연결이 끊긴 참가자를 AI Activity 평가 대상에서 제외해야 한다.

### Revisit Trigger

- 장시간 이탈자의 정원 점유가 실제 참가를 반복적으로 막을 때
- 사용자의 영구 참가 철회 요구가 반복될 때
- 재접속 동기화 지연이 사용성을 크게 해칠 때

## [PRODUCT-019] 방장의 AI 도움 요청

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §12
  - `docs/MVP_FUNCTIONAL_SPEC.md` §9

### Context

방장에게 허용된 `심각한 상황에서 AI 개입 요청`이 AI를 직접 지시하는 기능인지, 단순 재평가 요청인지, 실제 발언을 보장하는지 명확히 해야 한다. 이 기능은 AI의 최소 필요 개입 철학과 방장의 운영 권한 범위를 함께 지켜야 한다.

### Decision

- 방장에게만 `AI 도움 요청` 버튼을 제공한다.
- Opening, Core Discussion, 연장 토론 중에만 사용할 수 있고 Synthesis와 Closing에서는 사용할 수 없다.
- 요청 사유는 `대화가 멈춤 / 논의가 반복되거나 막힘 / 주제에서 너무 벗어남 / 갈등으로 흐름 정리가 필요함` 중 하나를 선택한다.
- 자유 입력은 제공하지 않는다.
- 요청 시 AI는 최근 대화와 선택 사유를 확인하고 한 번의 사용자-facing 개입 메시지를 반드시 작성한다.
- 방장은 구체적인 질문이나 결론을 지정하지 못하며 개입 목표와 내용은 AI가 결정한다.
- 해당 메시지에는 `방장 요청으로 개입` 표시를 붙인다.
- 처리 중 중복 요청을 막고 추가 요청 제한 시간은 기술 설계 또는 실험값으로 정한다.
- AI 실패가 인간 대화와 세션 진행을 막아서는 안 된다.
- 참가자에 대한 심각한 운영 문제는 방장의 내보내기 권한으로 처리한다.

### Alternatives

1. 요청이 AI 평가만 즉시 실행하고 `WAIT`도 허용
2. 방장이 자유롭게 AI 지시문 입력
3. 일반 참가자에게도 AI 요청 권한 제공
4. 모든 세션 단계에서 요청 허용

### Rationale

버튼을 눌렀는데 아무 반응이 없는 혼란을 피하면서도 방장이 토론 내용이나 결론을 통제하지 않도록 한다. 제한된 사유 선택은 AI가 필요한 개입 목표를 정하는 신호만 제공하고, 자동 개입과의 차이도 참가자에게 투명하게 알린다.

### Trade-offs

- 좋은 흐름에서도 방장 요청으로 AI가 한 번 개입할 수 있다.
- 자유 입력이 없어 방장이 세부 상황을 직접 설명할 수 없다.
- 반복 요청 제한 때문에 연속적인 문제에 즉시 다시 요청하지 못할 수 있다.

### Consequences

- 방장 요청은 일반 Policy trigger와 구분해 기록하되 같은 프라이버시 규칙을 적용해야 한다.
- 요청 출처가 사용자-facing AI 메시지에 표시되어야 한다.
- 요청 처리 상태와 중복 방지 상태가 필요하다.

### Revisit Trigger

- 방장 요청이 AI 과잉 개입의 주요 원인이 될 때
- 제한된 사유만으로 상황 전달이 부족하다는 피드백이 반복될 때
- 일반 참가자의 도움 요청 수요가 확인될 때

## [PRODUCT-020] AI 지연·실패 시 세션 지속과 단계별 대체 동작

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §12
  - `docs/MVP_FUNCTIONAL_SPEC.md` §9

### Context

AI 평가, 개입, Opening, 연장 판단, Synthesis, 최종 기록 생성은 지연되거나 실패할 수 있다. 이때 인간의 실시간 대화와 세션 종료를 막지 않으면서도, 사용자가 응답을 기다리는 단계에는 이해 가능한 상태를 제공해야 한다.

### Decision

- 자동 평가와 자동 개입은 로딩 상태를 노출하지 않으며 실패해도 인간 대화를 계속한다.
- 방장 요청 처리 상태는 방장에게만 표시하고, 실패 시 방장에게만 재시도를 안내한다.
- Opening과 Synthesis의 AI 발언이 지연되면 모든 참가자에게 간단한 준비 상태를 보여주되 채팅은 계속 허용한다.
- Opening 생성이 최종 실패하면 미리 준비된 기본 시작 질문을 사용한다.
- Synthesis 생성이 최종 실패하면 실패를 안내하고 Closing으로 진행한다.
- 연장에 대한 AI 의견 생성이 최종 실패해도 방장의 연장·마무리 선택은 그대로 제공한다. 이 항목은 `PRODUCT-021`에서 기존 동작을 변경했다.
- 최종 토론 기록의 지연이나 실패는 공식 종료를 막지 않으며 결과 화면에 생성 상태를 표시한다.
- 원본 오류, 모델명, 내부 점수는 노출하지 않는다.
- 자동 재시도 횟수와 지연 표시 기준은 기술 설계에서 정한다.
- 재시도로 AI 메시지나 결과물이 중복 생성되어서는 안 된다.

### Alternatives

1. 모든 AI 평가마다 공통 로딩 표시
2. AI 실패 시 세션 진행 일시 중단
3. Synthesis 성공 전 Closing 진입 금지
4. 최종 기록 성공 전 공식 종료 금지

### Rationale

AI는 토론을 돕는 역할이며 장애 시 인간 대화를 잠그는 핵심 의존성이 되어서는 안 된다. 다만 AI 출력이 명시적으로 예정된 단계에서는 사용자가 현재 상태를 이해할 수 있도록 최소한의 안내와 결정적인 fallback을 제공한다.

### Trade-offs

- 자동 개입 실패를 참가자가 직접 인지하지 못한다.
- 기본 Opening이나 Synthesis 생략 시 정상 AI 흐름보다 품질이 낮아질 수 있다.
- 공식 종료 직후 최종 기록이 아직 준비되지 않을 수 있다.

### Consequences

- 단계별 fallback 문구와 기본 Opening 질문이 필요하다.
- AI 작업은 session state 전환과 분리되고 idempotent해야 한다.
- 최종 기록은 공식 종료 후에도 비동기로 생성·재시도할 수 있어야 한다.
- 실패 원인과 재시도 결과는 운영 로그에 남겨야 한다.

### Revisit Trigger

- AI 실패 빈도가 세션 품질을 유의미하게 떨어뜨릴 때
- 결과 생성 대기가 사용자 이탈의 주요 원인이 될 때
- fallback Synthesis가 필요하다는 요구가 확인될 때

## [PRODUCT-021] 횟수 제한 없는 방장 주도 15분 연장

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §10.3, §12
  - `docs/MVP_FUNCTIONAL_SPEC.md` §10
  - Supersedes the extension-gating behavior implied before this decision

### Context

기존 명세는 AI가 연장을 추천한 경우에만 방장이 15분 연장을 승인하거나 거절하는 흐름이었다. 그러나 실제 모임에서는 방장이 참가자 상황과 현장 분위기를 고려해 직접 연장을 선택할 필요가 있고, 한 번의 고정 연장 제한도 불필요하다.

### Decision

- 각 기본·연장 토론 구간이 끝나기 전에 방장에게 `15분 연장 / 마무리하기`를 묻는다.
- 방장은 AI 의견과 관계없이 15분 연장을 선택할 수 있다.
- 연장 횟수에는 제한을 두지 않는다.
- 자동 연장은 없으며 매 15분 구간마다 방장의 명시적인 재승인이 필요하다.
- AI는 `연장 추천 / 마무리 추천` 의견을 제공할 수 있지만 방장의 선택을 제한하지 않는다.
- AI 의견 생성이 실패해도 방장의 선택은 가능하다.
- 방장이 마무리를 선택하거나 응답 기한 안에 응답하지 않으면 현재 구간 종료 후 Synthesis로 들어간다.
- 방장이 오프라인이고 권한 이전도 없다면 응답 없음으로 처리한다.
- 결정과 변경된 종료 시각은 모든 참가자에게 알린다.
- 연장 중에도 신규 참가와 기존 참가자의 재접속을 허용한다.
- 일반 참가자 투표와 자동 다수결은 제공하지 않는다.
- 방장은 연장 중에도 강제 종료할 수 있다.

### Alternatives

1. 세션당 한 번만 연장
2. AI 추천이 있을 때만 연장 허용
3. 참가자 다수결로 연장 결정
4. 한 번 승인하면 이후 자동 연장

### Rationale

방장은 세션 운영 책임자로서 실제 참가자 상황에 맞게 시간을 결정할 수 있어야 한다. 동시에 15분 단위와 매회 재승인을 유지해 무기한 자동 진행을 막고 모든 참가자가 종료 시점을 예측할 수 있게 한다.

### Trade-offs

- 세션 총길이에 상한이 없어 운영 시간과 AI 비용이 증가할 수 있다.
- 방장 의사와 일반 참가자의 선호가 다를 수 있다.
- 반복 승인과 타이머 갱신에 대한 동시성 처리가 필요하다.

### Consequences

- 연장 API와 상태 전환은 매 구간에서 반복 가능하고 idempotent해야 한다.
- AI 의견 생성과 방장 결정 UI를 분리해야 한다.
- 종료 예정 시각과 현재 연장 횟수를 일관되게 갱신·기록해야 한다.
- 관측 로그에서 각 연장 결정, AI 의견, 실제 추가 대화 가치를 연결할 수 있어야 한다.

### Revisit Trigger

- 지나치게 긴 세션이 운영 비용이나 사용자 피로를 크게 만들 때
- 일반 참가자의 연장 의사 표현 요구가 반복될 때
- 반복 연장이 결과 품질을 오히려 저하시킬 때

## [PRODUCT-022] 방장의 되돌릴 수 없는 토론 종료와 결과 처리

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §10.6
  - `docs/MVP_FUNCTIONAL_SPEC.md` §10

### Context

세션 시작 후 방장이 토론을 조기에 끝낼 때 Synthesis와 Closing을 수행할지, 처리 중인 메시지와 결과물을 어떻게 다룰지 정해야 한다. 사용자-facing 명칭도 위협적인 `강제 종료`보다 운영 동작을 명확히 설명해야 한다.

### Decision

- 세션 시작 후 방장에게만 `토론 종료` 기능을 제공하고, 시작 전에는 토론방 취소를 사용한다.
- 실행 전 입력 종료와 재시작 불가 영향을 확인한다.
- 종료 사유 입력과 참가자 투표는 제공하지 않는다.
- 확정 즉시 신규 참가, 재접속, 메시지 전송, 연장 결정을 차단한다.
- 종료 전에 확정된 메시지는 보존하고 미확정 메시지는 전송 실패로 처리한다.
- 모든 참가자에게 방장에 의한 종료를 알리고 세션을 `종료` 상태로 전환한다.
- 종료는 취소하거나 다시 열 수 없다.
- Core Discussion 또는 연장 중 종료하면 실시간 Synthesis와 Closing을 생략한다.
- Synthesis 또는 Closing 중 종료하면 그 시점까지 확정된 입력만 사용한다.
- 종료 시점까지의 Raw Data로 최종 토론 기록을 비동기로 생성한다.
- 대화가 부족하면 내용을 꾸며내지 않고 기록 부족 상태를 표시한다.
- 이미 확정된 마지막 한 줄만 결과에 포함한다.
- 실제 참여자는 일반 종료와 같은 종료 후 열람권을 가진다.
- 결과 생성 실패는 세션 종료를 되돌리지 않는다.

### Alternatives

1. 강제 종료 시 결과물을 생성하지 않음
2. 강제 종료 전 반드시 축약 Synthesis 수행
3. 참가자 과반수 동의 후 종료
4. 종료 후 일정 시간 동안 재개 허용

### Rationale

방장이 긴급하게 세션을 닫을 수 있게 하면서도 그 전까지 확정된 토론 사실과 실제 참여자의 기록 접근을 보존한다. 실시간 정리 단계를 강제하지 않아 종료 목적을 훼손하지 않고, 비동기 결과 생성에서도 근거가 부족한 내용을 만들지 않도록 한다.

### Trade-offs

- 참가자는 Synthesis와 마지막 한 줄 기회를 잃을 수 있다.
- 처리 중이던 메시지는 전송되지 않을 수 있다.
- 대화가 짧으면 결과물이 매우 제한적일 수 있다.

### Consequences

- 세션 종료와 메시지 확정 사이의 원자적 순서가 필요하다.
- 종료된 세션에 대한 쓰기와 재접속을 일관되게 거절해야 한다.
- 정상 종료와 방장 종료를 운영 이벤트에서 구분해 기록해야 한다.
- 최종 기록 생성은 부족한 근거를 명시적으로 처리해야 한다.

### Revisit Trigger

- 오발동으로 인한 복구 요구가 반복될 때
- 방장 종료 권한 남용 문제가 확인될 때
- 종료 전 참가자 의견 확인 요구가 반복될 때

## [PRODUCT-023] 5분 Closing과 마지막 한 줄 마감

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §10.5
  - `docs/MVP_FUNCTIONAL_SPEC.md` §11

### Context

선택적인 마지막 한 줄을 무제한으로 받으면 세션의 공식 종료와 결과 확정 시점을 정할 수 없다. Closing에서 시스템과 AI가 무엇을 하는지, 입력이 언제 잠기는지, 결과에 어떤 이름을 남길지도 명확히 해야 한다.

### Decision

- Closing은 최대 5분 동안 진행한다.
- 일반 채팅 입력을 닫고 기존 대화는 계속 열람할 수 있게 한다.
- 실제 참여자는 마지막 한 줄 하나를 최대 300자로 제출하거나 건너뛸 수 있다.
- 자신의 입력은 Closing 종료 전까지 수정·삭제할 수 있다.
- 다른 참가자의 마지막 한 줄은 Closing 중 공개하지 않는다.
- 현재 접속 중인 실제 참여자 전원이 제출 또는 건너뛰기를 선택하면 5분 전에도 종료할 수 있다.
- 응답하지 않거나 오프라인인 참가자가 있어도 5분 후 자동 종료한다.
- 방장은 일반 Closing만 임의로 조기 마감할 수 없고 긴급할 때는 `토론 종료`를 사용한다.
- Closing 중 재접속하거나 신규 참가한 사람도 남은 시간 안에는 제출할 수 있지만 시간을 연장하지 않는다.
- 마감 전에 서버에서 확정된 입력만 결과에 포함한다.
- 공식 종료 후 마지막 한 줄은 수정·삭제할 수 없다.
- 제출 당시 프로필 이름을 결과에 표시하고 이후 이름 변경으로 과거 기록을 바꾸지 않는다.
- 미제출 참가자는 결과에 표시하지 않는다.
- Closing에서는 AI 평가·자동 개입·새 질문 생성을 중지한다.

### Alternatives

1. 마지막 한 줄을 무기한 제출·수정 가능
2. 모든 실제 참여자가 응답할 때까지 대기
3. 방장이 임의로 Closing 조기 마감
4. 공식 종료 후에도 마지막 한 줄을 공식 결과에 추가

### Rationale

참가자의 독립적인 마지막 생각을 받을 시간을 제공하면서도 공식 종료와 불변 결과의 경계를 명확히 한다. 미응답과 오프라인 사용자가 종료를 막지 않게 하고, 전원이 완료한 경우에는 불필요하게 기다리지 않는다.

### Trade-offs

- 오프라인 참가자는 5분 안에 돌아오지 못하면 마지막 한 줄을 제출할 수 없다.
- Closing 중에는 일반 대화를 더 이어갈 수 없다.
- 늦게 참가한 사용자는 짧은 시간 안에 마지막 생각을 작성해야 할 수 있다.

### Consequences

- Closing countdown과 서버 기준 마감 시각이 필요하다.
- 마지막 한 줄은 채팅 Raw Data와 구분된 수정 가능한 임시 입력으로 저장한 뒤 종료 시 확정해야 한다.
- 제출·건너뛰기·재접속·신규 참가에 따른 조기 종료 조건을 원자적으로 판정해야 한다.
- 종료 후 결과에는 제출 시점의 profile name snapshot을 사용해야 한다.

### Revisit Trigger

- 5분이 지나치게 짧거나 길다는 피드백이 반복될 때
- Closing 중 대화를 계속하고 싶다는 요구가 확인될 때
- 공식 종료 후 개인 회고 작성 기능이 필요해질 때

## [PRODUCT-024] 실제 참여자 전용 종료 기록과 외부 공유 제외

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §11.6
  - `docs/MVP_FUNCTIONAL_SPEC.md` §12

### Context

종료된 토론방의 전체 대화와 결과를 누가, 어떤 범위로 다시 볼 수 있는지 정해야 한다. 토론 기록의 주요 섹션은 익명화되지만 원본 채팅, 참가자 목록, 마지막 한 줄에는 계정 프로필 이름이 포함되므로 외부 공유는 별도 개인정보·동의 문제를 만든다.

### Decision

- 방장과 실제 참여자만 종료된 방에 다시 들어갈 수 있다.
- 등록만 한 no-show와 방장이 내보낸 참가자는 열람할 수 없다.
- 종료된 방에서 방·책 정보, 실제 참여자 목록, 전체 채팅과 AI 발언, PUBLIC 사전 입력, 공식 기록, 마지막 한 줄을 읽기 전용으로 제공한다.
- AI_PRIVATE 사전 입력은 작성자 본인에게만 다시 보여준다.
- 내부 AI 평가, Discussion Metrics, 운영 로그는 공개하지 않는다.
- 종료 후 참가자와 방장은 공식 데이터를 수정하거나 삭제할 수 없다.
- 방장도 새로운 사람을 추가하거나 열람 권한을 부여할 수 없다.
- 공개 링크, 비회원 공개, SNS 공유, 파일 다운로드·내보내기는 MVP에서 제외한다.
- 종료된 방은 전체 검색에서 제외하고 `내 토론 > 종료`에서만 접근한다.
- 결과 생성 중에도 채팅은 열람할 수 있고 결과 영역에 생성 상태를 표시한다.
- 자동 만료 기간은 두지 않고 이후 데이터 보관·탈퇴·삭제 정책을 따른다.

### Alternatives

1. 익명화된 결과만 공개 링크로 공유
2. 방장이 종료 후 열람자를 추가
3. PDF 또는 텍스트 내보내기 제공
4. 일정 기간 후 종료 기록 자동 삭제

### Rationale

실제 토론에 참여한 사람의 회고 가치는 보존하면서, 원본 대화와 프로필 이름이 참가자의 동의 없이 외부로 확산되는 범위를 최소화한다. 공유·내보내기 기능을 제외해 MVP의 권한과 프라이버시 모델도 단순하게 유지한다.

### Trade-offs

- 좋은 토론 결과를 외부에 공유하거나 재활용하기 어렵다.
- 내보내진 사용자는 자신의 기존 발언도 다시 볼 수 없다.
- 사용자에게 별도 백업 수단을 제공하지 않는다.

### Consequences

- 종료된 방의 모든 조회 API에 실제 참여 membership 권한 검사가 필요하다.
- AI_PRIVATE는 동일 화면에서도 작성자 단위 필터링이 필요하다.
- 최종 결과 생성 상태와 원본 채팅 접근 상태를 분리해야 한다.
- 보관 기간은 이후 데이터 정책 결정에서 구체화해야 한다.

### Revisit Trigger

- 참가자들이 익명 결과 공유를 반복적으로 요청할 때
- 교육·독서모임 운영자가 내보내기를 필요로 할 때
- 법적 데이터 제공·삭제 요구가 구체화될 때

## [PRODUCT-025] Published Book Context Pack 카탈로그에서 책 선택

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.3
  - `docs/MVP_FUNCTIONAL_SPEC.md` §4

### Context

토론방 생성 시 사용할 책을 어떤 목록에서 찾고, 동명 도서나 판본을 어떻게 구분하며, 준비되지 않은 책을 사용자가 추가할 수 있는지 정해야 한다. 실제 토론은 검수된 Book Context Pack에만 연결되어야 한다.

### Decision

- 운영자가 Publish한 Book Context Pack만 책 선택 목록에 노출한다.
- 책 제목과 저자로 검색한다.
- 기본 정렬은 최근 추가된 순이며 최근 추가된 순, 제목 가나다순, 저자 가나다순을 제공한다.
- 검색 결과에는 표지, 제목, 저자, 출판사, 출간 연도를 표시한다.
- 하나의 Published Pack을 하나의 선택 항목으로 표시한다.
- 선택 후 책 기본 정보와 짧은 소개를 확인할 수 있게 한다.
- 빈 결과에는 `아직 토론이 준비된 책이 없습니다`라고 안내한다.
- 사용자 직접 책 등록과 Pack 생성 요청 기능은 MVP에서 제외한다.
- Draft, 검수 중, Publish 취소 상태의 Pack은 일반 사용자에게 숨긴다.
- 다른 참가자가 등록하기 전까지만 기존 규칙에 따라 방의 책을 변경할 수 있다.

### Alternatives

1. 외부 도서 검색 결과에서 아무 책이나 선택
2. Published Pack이 없는 책도 먼저 방 생성 허용
3. 사용자에게 Pack 생성 요청 기능 제공
4. 검색 없이 전체 목록만 표시

### Rationale

검수된 책 지식이 없는 세션이 생성되는 것을 막고, 운영자가 품질을 통제할 수 있는 MVP 범위를 유지한다. 판본 식별 정보와 기본 검색·정렬은 작은 카탈로그에서도 잘못된 책을 고르는 문제를 줄인다.

### Trade-offs

- 준비된 책이 적으면 사용자가 원하는 토론방을 만들 수 없다.
- 사용자 요청을 제품 안에서 바로 수집하지 못한다.
- 운영자가 Pack을 준비하고 Publish해야만 카탈로그가 확장된다.

### Consequences

- 카탈로그 조회는 Published 상태만 반환해야 한다.
- Pack 상태가 바뀌면 일반 사용자 검색 노출도 즉시 일관되게 바뀌어야 한다.
- 정렬 가능한 한글 제목·저자 필드와 Published 시각이 필요하다.

### Revisit Trigger

- 준비되지 않은 책 요청이 MVP 검증의 주요 병목이 될 때
- 외부 도서 API 연동 필요성이 확인될 때
- 여러 판본을 하나의 작품 단위로 묶어야 할 때

## [PRODUCT-026] 참가 패스워드와 정원 경합 UX

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.4
  - `docs/MVP_FUNCTIONAL_SPEC.md` §5

### Context

검색 가능한 토론방에 패스워드로 참가할 때 오입력, 반복 시도, 정원 마감, 기존 membership 재입장, 내보내기 차단을 서로 구분해야 한다. 패스워드 확인과 정원 확보 사이에 발생하는 동시성도 사용자에게 이해 가능한 결과로 보여줘야 한다.

### Decision

- 방 참가 패스워드는 4~20자이고 영문 대소문자를 구분하며 숫자·기호를 허용한다.
- 오입력에는 명확한 오류를 표시하고 입력값을 비운다.
- 반복 오입력은 계정·방 단위로 제한하고 정확한 기준은 보안 설계에서 정한다.
- membership 생성 시점에 정원이 차면 `방금 정원이 마감되었습니다`를 표시한다.
- 정원 마감 시 신규 입력을 비활성화하고 대기자 명단은 제공하지 않는다.
- 정원이 다시 생기면 검색·상세 상태를 갱신한다.
- 기존 참가 등록자와 실제 참여자는 정원 마감이나 패스워드 변경과 관계없이 다시 들어갈 수 있다.
- 방장은 자신의 방에 패스워드를 입력하지 않는다.
- 반복 참가 요청은 membership과 정원 점유를 중복 생성하지 않는다.
- 내보내진 사용자는 별도의 재참가 차단 안내를 받는다.
- 취소·종료된 방에는 참가 입력을 제공하지 않는다.
- 참가 패스워드 찾기, 참가 요청, 대기자 명단은 MVP에서 제외한다.

### Alternatives

1. 정원 마감 상태에서도 패스워드 입력 허용
2. 대기자 명단 제공
3. 기존 참가자도 변경된 패스워드 재입력
4. 패스워드 오입력 제한 없음

### Rationale

신규 참가와 기존 membership의 권리를 명확히 분리하고, 동시 참가 시도에도 최대 정원을 보장한다. 검색 가능한 방의 무차별 패스워드 시도를 제한하면서 MVP 범위에는 대기열이나 복구 흐름을 추가하지 않는다.

### Trade-offs

- 방 참가 패스워드를 잊으면 서비스 안에서 복구할 수 없다.
- 정원 마감 직전에 패스워드를 맞힌 사용자도 참가하지 못할 수 있다.
- 대기자 명단이 없어 빈자리가 생겨도 자동 알림을 받지 못한다.

### Consequences

- 패스워드 검증과 정원 membership 생성은 원자적으로 처리해야 한다.
- 참가 요청은 사용자·방 단위 idempotency를 보장해야 한다.
- rate limit 상태와 차단 membership을 일반 오입력과 구분해야 한다.
- 패스워드는 안전한 단방향 방식으로 저장해야 한다.

### Revisit Trigger

- 대기자 기능 요구가 반복될 때
- 방 패스워드 공유·분실이 주요 진입 실패 원인이 될 때
- 공격 시도가 실제 운영 문제로 확인될 때

## [PRODUCT-027] Book Context 관리에 한정된 단일 ADMIN 역할

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §19
  - `docs/MVP_FUNCTIONAL_SPEC.md` §14

### Context

Book Context Builder와 Publish Gate를 누가 사용할 수 있는지, 운영자 권한이 일반 회원의 토론 데이터까지 확장되는지 정해야 한다. MVP에서 과도한 역할 관리 기능을 만들지 않으면서 최소 권한 원칙을 지킬 필요가 있다.

### Decision

- 지정된 일반 계정에만 `ADMIN` 역할을 수동 부여한다.
- 운영자 가입·초대·역할 관리 UI는 제공하지 않는다.
- 운영자는 일반 로그인 후 서버 권한 검사를 거쳐 Builder에 접근한다.
- 운영 권한은 Pack 생성, 조사·재시도, 검수, 항목 편집·재생성, 상태 변경, Publish 취소와 버전 관리로 제한한다.
- 편집자·검수자·게시자 역할은 분리하지 않는다.
- ADMIN 계정도 토론에 일반 회원으로 참가할 수 있으며 관리자 표시나 추가 토론 권한을 갖지 않는다.
- 운영자 권한만으로 참가하지 않은 방의 채팅·사전 입력·결과에 접근할 수 없다.
- 다른 사용자의 AI_PRIVATE 입력은 운영자에게도 기본적으로 공개하지 않는다.
- 비밀번호 열람, 사용자 사칭, 회원 관리, 신고 처리, 메시지 삭제, 세션 개입 기능은 제외한다.
- Pack 관련 운영 동작은 감사 로그로 남긴다.

### Alternatives

1. 운영자 전용 별도 계정 체계
2. 편집자·검수자·게시자 역할 분리
3. ADMIN에게 모든 토론 데이터 조회 권한 부여
4. 제품 UI에서 운영자 초대와 역할 관리

### Rationale

내부 MVP 운영에 필요한 Pack 준비 기능만 제공하면서 참가자 데이터에 대한 불필요한 관리자 접근을 막는다. 기존 계정 체계를 재사용하고 수동 역할 부여를 선택해 권한 관리 UI의 범위도 줄인다.

### Trade-offs

- 운영자가 늘어나면 수동 역할 관리가 번거롭다.
- 검수와 Publish를 같은 사람이 수행할 수 있어 이중 승인 통제가 없다.
- 장애 조사 시에도 운영자가 임의로 사용자 대화를 조회할 수 없다.

### Consequences

- 일반 membership 권한과 ADMIN 권한을 별도 경로에서 검사해야 한다.
- 운영자 감사 로그는 Builder 변경 이력과 연결되어야 한다.
- 운영자용 장애 진단이 필요하면 사용자 내용이 아닌 메타데이터 중심으로 설계해야 한다.

### Revisit Trigger

- 여러 운영자가 동시에 Pack을 편집하게 될 때
- 검수와 Publish의 역할 분리가 필요해질 때
- 사용자 지원·moderation 기능이 별도 요구사항으로 확정될 때

## [PRODUCT-028] 불변 Published Pack 버전과 방 생성 시점 고정

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §19.5
  - `docs/MVP_FUNCTIONAL_SPEC.md` §14

### Context

Published Pack을 수정하거나 Publish 취소할 때 이미 생성된 방과 진행·종료된 세션의 AI 지식이 바뀌면 토론 결과와 근거를 재현할 수 없다. 신규 방에는 개선된 버전을 제공하면서 기존 세션은 안정적으로 유지해야 한다.

### Decision

- 상태는 Draft, Review, Published, Retired로 관리한다.
- Draft만 수정할 수 있고 Published는 불변으로 유지한다.
- 수정은 기존 버전을 복제한 새 Draft에서 수행하고 책별 버전을 순차 증가시킨다.
- 책마다 신규 방용 활성 Published 버전을 하나만 둔다.
- 새 버전 Publish 시 기존 활성 버전을 Retired로 전환한다.
- 토론방은 생성 시점의 정확한 Pack 버전을 고정한다.
- 새 버전과 Publish 취소는 기존 방·세션·종료 결과의 참조를 자동 변경하지 않는다.
- Publish 취소는 Retired 전환이며 신규 방 카탈로그에서 숨긴다.
- Retired 버전을 쓰는 기존 방은 계속 사용할 수 있다.
- 기존 방까지 중단하는 긴급 폐기 기능은 MVP에서 제외한다.
- 활성 Published 버전이 없으면 책을 신규 방 목록에서 숨긴다.
- Draft는 자동 저장하고 저장 상태를 표시한다.
- 재생성, Publish, Publish 취소에는 영향 확인을 제공하고 취소 사유를 필수로 받는다.
- 버전을 물리 삭제하지 않고 상태와 변경 이력을 감사 로그에 보존한다.

### Alternatives

1. Published Pack 직접 수정
2. 모든 기존 방을 자동으로 최신 버전으로 이동
3. Publish 취소 시 기존 방도 즉시 사용 불가
4. 이전 버전 물리 삭제

### Rationale

세션의 AI 판단 근거를 재현할 수 있게 하고 이미 예약·진행된 토론 경험이 운영자 편집으로 갑자기 바뀌는 것을 막는다. 신규 방에는 최신 검수본을 제공하면서 버전 이력과 감사 가능성을 유지한다.

### Trade-offs

- 심각한 오류가 있는 구버전을 참조하는 기존 방도 자동 중단되지 않는다.
- 버전이 누적되어 저장·관리 대상이 늘어난다.
- 작은 오탈자 수정도 새 버전 Publish가 필요하다.

### Consequences

- 세션·방 데이터에 immutable pack version id를 저장해야 한다.
- 책의 active Published version 전환은 원자적으로 처리해야 한다.
- Draft 자동 저장과 동시 편집 충돌 처리가 필요하다.
- 긴급 폐기는 별도 운영 사고 절차가 필요하다.

### Revisit Trigger

- 중대한 오류 Pack이 기존 예정 방에 사용되는 사고가 발생할 때
- 여러 운영자의 동시 편집 요구가 커질 때
- 버전 누적으로 운영 복잡도가 크게 증가할 때

## [PRODUCT-029] 탈퇴자 식별정보 삭제와 공동 기록 보존

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §17.1
  - `docs/MVP_FUNCTIONAL_SPEC.md` §15

### Context

계정 탈퇴와 데이터 삭제 권리를 제공하면서 여러 사람이 함께 만든 토론 원본과 결과의 정합성을 유지해야 한다. 특히 다른 참가자에게 공유되지 않는 AI_PRIVATE와 작성자가 드러나는 공동 기여를 다르게 처리할 필요가 있다.

### Decision

- 사용자는 비밀번호와 영향을 확인한 뒤 직접 탈퇴할 수 있다.
- 진행 중 실제 참여자는 종료 후, 예정 방의 방장은 권한 이전 또는 취소 후 탈퇴할 수 있다.
- 일반 참가자의 시작 전 membership은 자동 취소하고 ADMIN은 역할 해제 후 탈퇴한다.
- 탈퇴는 복구할 수 없으며 같은 이메일로 재가입할 수 있다.
- 계정 식별정보·설정과 모든 AI_PRIVATE를 삭제한다.
- 공동 채팅, PUBLIC 사전 입력, 마지막 한 줄 내용은 유지하되 작성자 이름을 `탈퇴한 사용자`로 익명화한다.
- 내부에는 계정과 분리된 비식별 연결자만 남기고 익명 공동 결과는 유지한다.
- 탈퇴 익명화는 공식 기록 불변 원칙의 개인정보 예외다.
- 개별 메시지 직접 삭제는 제공하지 않으며 별도 운영 삭제 시 삭제 표식을 남긴다.
- 계정은 탈퇴 시까지, 공동 원본·결과는 자동 만료 없이 보관한다.
- AI_PRIVATE는 탈퇴·운영 삭제 시까지 보관한다.
- AI 진단 로그는 세션 종료 후 90일 뒤 삭제하거나 비식별 집계만 남긴다.
- Book Context 자료·버전·감사 로그는 자동 만료 없이 보관한다.
- 백업 삭제 절차는 기술·보안 설계에서 정하고 공개 전 법적 검토를 수행한다.

### Alternatives

1. 탈퇴 시 사용자의 모든 공동 메시지 물리 삭제
2. 탈퇴 후에도 과거 프로필 이름 유지
3. 일정 유예기간 뒤 계정 삭제
4. 모든 토론 데이터에 동일한 자동 만료 적용

### Rationale

AI_PRIVATE와 직접 식별정보는 제거하면서 공동 토론의 문맥과 다른 참가자의 회고 경험은 보존한다. 내부 진단 로그에는 제한된 보관 기간을 두어 제품 학습과 민감정보 최소화 사이의 균형을 맞춘다.

### Trade-offs

- 탈퇴자의 메시지 내용 자체는 공동 기록에 남는다.
- 작성자 익명화로 과거 대화의 인물 구분이 일부 어려워질 수 있다.
- 자동 만료가 없는 공동 기록과 Pack 자료의 저장량이 계속 증가한다.

### Consequences

- 계정 삭제와 shared contribution 익명화를 원자적·재시도 가능하게 처리해야 한다.
- AI_PRIVATE 파생 캐시와 검색 인덱스도 삭제 범위에 포함해야 한다.
- 90일 로그 만료 작업과 비식별 집계 절차가 필요하다.
- 개인정보 운영 삭제는 일반 메시지 삭제와 구분된 감사 가능한 절차가 필요하다.

### Revisit Trigger

- 탈퇴자가 메시지 내용 자체의 삭제를 반복적으로 요구할 때
- 적용 지역의 법적 의무가 다른 보관·삭제 방식을 요구할 때
- 데이터 내보내기 요구가 확인될 때

## [PRODUCT-030] 서버 확정 상태 기반의 비차단 장애 복구

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §17.2
  - `docs/MVP_FUNCTIONAL_SPEC.md` §16

### Context

실시간 연결, 메시지, 운영 명령, AI 작업, 결과 생성, Builder 중 일부가 실패해도 사실 원본과 세션 상태가 어긋나지 않아야 한다. AI와 비동기 작업 장애가 인간 대화나 공식 종료를 막아서도 안 된다.

### Decision

- 연결 상태를 구분하고 단절 중에는 읽기만 허용하며 작성 중 입력을 보존한다.
- 재연결 후 서버 snapshot과 누락 메시지를 동기화한 뒤 입력을 다시 연다.
- 서버 상태를 최종 기준으로 사용하고 장애 중에도 세션 타이머는 계속 흐른다.
- 미확정 메시지는 확정처럼 표시하지 않고 실패 내용을 재시도할 수 있게 한다.
- 운영 명령은 서버 성공 후만 반영하고 실패·중복 시 기존 상태를 안전하게 유지한다.
- 자동 AI 실패는 인간 대화를 막지 않으며 단계별 fallback을 사용한다.
- 오래된 AI 판단은 최신 대화 재확인 후 불필요하면 게시하지 않는다.
- 세션 종료와 결과 생성을 분리하고 결과 작업을 자동 재시도한다.
- 재시도 소진 시 실패 상태를 표시하고 방장에게 최초 결과 생성 재시도 권한을 제공한다.
- 성공한 공식 결과는 다시 생성하지 않는다.
- Builder 실패는 Draft를 보존하고 자동 Review·Publish하지 않는다.
- 원본 오류와 내부 정보를 사용자에게 노출하지 않는다.
- 장애 로그는 작업 상태 중심으로 기록하고 전체 재해복구는 기술 설계로 넘긴다.

### Alternatives

1. 연결 단절 중 optimistic 메시지 확정 표시
2. 서버 장애 시간만큼 세션 타이머 자동 일시정지
3. AI 복구 전 세션 진행 중단
4. 모든 실제 참여자에게 결과 재생성 권한 제공

### Rationale

서버가 확인한 사실만 원본으로 인정해 중복·유실·권한 충돌을 줄인다. 동시에 AI와 결과 생성은 인간 대화 및 세션 종료에서 분리해 부분 장애에도 MVP 핵심 경험이 가능한 범위에서 계속되게 한다.

### Trade-offs

- 장애가 길어도 타이머가 계속 흘러 실제 대화 시간이 줄 수 있다.
- 단절 중에는 새 메시지를 보낼 수 없다.
- 방장이 돌아오지 않으면 자동 재시도 소진 후 결과 재생성을 수동 실행하기 어렵다.

### Consequences

- 메시지 cursor 복구, authoritative snapshot, idempotency key가 필요하다.
- 운영 명령에는 서버 승인과 충돌 오류 UX가 필요하다.
- AI 작업에는 최신 대화 freshness check와 중복 확정 방지가 필요하다.
- 결과·Builder 작업에는 durable job 상태와 재시도 이력이 필요하다.

### Revisit Trigger

- 서버 장애로 실제 토론 시간이 반복적으로 크게 손실될 때
- 방장만 가능한 결과 재시도가 운영 병목이 될 때
- 오프라인 메시지 작성·전송 요구가 확인될 때

## [PRODUCT-031] 30분 토론 타이머와 종료 7분 전 반복 연장 결정

- Date: 2026-08-30
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §10
  - `docs/MVP_FUNCTIONAL_SPEC.md` §10

### Context

기본 세션 30분, Synthesis 5~7분, Closing 5분, 반복 연장 정책을 하나의 명확한 시간표로 연결해야 한다. 연장 여부를 너무 늦게 물으면 Synthesis 시간이 부족하고, Closing을 30분 안에 포함하면 기존 단계별 가이드가 충돌한다.

### Decision

- 기본 토론 타이머 30분에 Opening, Core Discussion, Synthesis를 포함한다.
- 토론 타이머가 끝난 뒤 Closing을 최대 5분 별도로 진행한다.
- 연장이 없으면 공식 종료까지 최대 약 35분이다.
- 남은 시간이 7분이면 모든 참가자에게 종료 임박과 AI 의견을 표시한다.
- 방장에게 2분간 `15분 연장 / 마무리하기`를 제공한다.
- 마무리를 선택하면 즉시 Synthesis로 전환한다.
- 남은 시간 5분까지 응답이 없으면 자동으로 Synthesis에 들어간다.
- 연장을 선택하면 즉시 타이머에 15분을 더하고 연장 중으로 전환한다.
- 연장 타이머가 다시 7분 남으면 같은 절차를 반복한다.
- 타이머는 서버 시각을 기준으로 모든 참가자에게 계속 표시한다.

### Alternatives

1. Closing 5분을 기본 30분 안에 포함
2. 토론 타이머가 0이 된 뒤 연장 여부 질문
3. 종료 5분 전에 연장 질문과 Synthesis 동시 시작
4. 연장 결정 시간을 별도로 두어 타이머 일시정지

### Rationale

방장이 연장을 판단할 시간을 확보하면서 연장하지 않을 경우 Synthesis에 최소 5분을 남긴다. Closing은 별도의 개인 입력 단계로 분리해 토론 시간과 공식 종료 시점을 사용자가 예측할 수 있게 한다.

### Trade-offs

- `30분 세션`으로 기대한 사용자에게 실제 공식 종료는 최대 약 35분이 될 수 있다.
- 방장이 일찍 마무리를 선택하면 Synthesis가 7분 가까이 진행될 수 있다.
- 반복 연장마다 동일한 결정 UI가 나타난다.

### Consequences

- 서버 기준 end_at과 extension decision deadline이 필요하다.
- Synthesis 전환과 연장 승인이 동시에 도착하는 경합을 처리해야 한다.
- UI는 토론 타이머와 Closing 타이머를 구분해 표시해야 한다.

### Revisit Trigger

- 사용자가 30분을 공식 종료까지의 총시간으로 기대해 혼란이 생길 때
- Synthesis 5~7분이 실제 대화에서 과하거나 부족할 때
- Closing이 별도 5분인 구조가 참여 이탈을 만들 때

---

## [TECH-027] Durable Book Context Builder와 명시적 regeneration proposal

- Date: 2026-09-02
- Status: ACCEPTED
- Owner: Engineering
- Related:
  - `PRODUCT_SPEC.md` §18~§20
  - `docs/BOOK_CONTEXT_SPEC.md`

### Context

공개 자료 조사, claim 분류, 7개 section 구성과 검수는 긴 작업이며 provider 실패나 운영자 편집과 경합할 수 있다. 자동 생성 결과가 기존 Draft 수정이나 Published Pack을 덮으면 검수 책임과 exact version 재현성이 깨진다.

### Decision

- Builder를 `IDENTIFY_BOOK → DISCOVER_SOURCES → CAPTURE_SOURCE_METADATA → EXTRACT_CLAIMS → CROSS_VALIDATE → BUILD_SECTIONS → VALIDATE_DRAFT`의 7개 durable stage로 실행한다.
- PGMQ message에는 job/run/pack/stage/revision만 넣고 조사·책·운영자 content는 DB의 worker-only input/artifact에 둔다.
- `DISCOVER_SOURCES`만 OpenAI Responses web search를 사용하고, `BUILD_SECTIONS`는 검증된 research artifact를 구조화 Draft로 변환한다.
- OpenAI가 지원하지 않는 JSON Schema `format: uri`는 provider schema에서 string으로 받되, artifact 저장 전에 canonical `z.url()` contract로 다시 검증한다.
- 전체·항목 재생성은 기존 Draft를 수정하지 않고 proposal을 만든다. 운영자가 diff를 확인해 apply/discard해야 하며 항목 재생성은 target 밖 byte-equivalent 보존을 검증한다.
- Review/Publish/Retire는 명시적 Admin command이며 Builder 성공으로 자동 Publish하지 않는다.

### Rationale

재시도 단위를 작게 유지하고 자동 결과와 사람의 검수본을 분리하면 provider 장애·stale write가 Published 지식으로 승격되는 것을 막을 수 있다. live Evaluator/Host가 web search를 호출하지 않는 기존 Provider 경계도 유지된다.

### Consequences

- stage lease, attempt fencing, poison archive와 수동 retry API가 필요하다.
- source·claim·Draft artifact와 provider run metadata가 증가한다.
- 실제 모델 schema 변경은 `pnpm eval:builder:live` release gate를 통과해야 한다.

### Revisit Trigger

- stage 중간 결과 재사용보다 호출 비용·운영 복잡성이 더 커질 때
- 여러 Admin의 동시 편집과 proposal merge 요구가 생길 때
- 공개 web search만으로 Pack 품질 목표를 반복해서 충족하지 못할 때

## [TECH-028] 재시도 가능한 계정 삭제와 복원 전 tombstone 재적용

- Date: 2026-09-02
- Status: ACCEPTED
- Owner: Engineering
- Related:
  - `PRODUCT_SPEC.md` §17.1
  - `docs/DECISIONS.md` PRODUCT-029, TECH-019

### Context

Supabase Auth hard delete는 DB 익명화 transaction과 하나의 원자 transaction으로 묶을 수 없다. 중간 장애가 있어도 private data 삭제와 공동 기록 익명화가 되돌아가거나, 과거 backup 복원으로 탈퇴 계정과 AI_PRIVATE가 부활해서는 안 된다.

### Decision

- API는 current password를 격리된 non-persistent Auth client로 확인한 뒤 DB `prepare_account_deletion`을 먼저 확정한다.
- prepare transaction은 AI_PRIVATE를 삭제하고 공동 기여·reply·event·Closing을 익명화하며 connection을 회수하고 durable deletion request와 37일 tombstone을 만든다.
- API가 Auth user를 hard delete하고 완료하되 실패하면 worker가 lease와 최대 attempt로 회복한다.
- 공동 기여에는 Auth FK와 분리된 participant identity UUID를 보존한다. email digest나 영구 block은 저장하지 않는다.
- 탈퇴 이메일은 새 Auth UUID로 재가입할 수 있으며 과거 participant identity와 연결하지 않는다.
- tombstone snapshot은 DB backup과 다른 S3 prefix에 SSE-KMS로 보관하고 restore 후 서비스 재개 전에 멱등 재적용한다.
- AI diagnostic 원문·근거·provider metadata는 세션 종료 90일 뒤 삭제하고 익명 일일 집계만 유지한다.

### Rationale

사용자 요청 경로에서 민감 데이터 제거를 먼저 확정하고 외부 Auth 삭제를 recoverable step으로 만들면 부분 실패에서도 privacy 상태가 후퇴하지 않는다. participant identity를 유지하면 공동 기록 문맥은 보존하면서 새 계정과 과거 계정 연결을 끊을 수 있다.

### Consequences

- 계정 삭제 worker와 pending/failed 운영 alert가 필요하다.
- backup restore에는 current migration과 최신 tombstone을 적용하는 별도 release gate가 필요하다.
- 익명화는 공식 결과 불변성의 제한된 privacy 예외로 감사한다.

### Revisit Trigger

- 법적 검토가 더 짧은 backup/tombstone 보관이나 공동 본문 삭제를 요구할 때
- Auth provider가 transactional deletion hook이나 workload identity 기반 외부 tombstone 저장을 제공할 때
- 삭제 backlog나 recovery attempt가 운영 기준을 반복해서 넘을 때

## [PRODUCT-032] 인증 전 흐름에 Managed Turnstile 적용

- Date: 2026-09-02
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §3.1
  - `TECH-016`, `TECH-017`

### Context

기존 기준은 회원가입과 비밀번호 재설정에만 Turnstile을 적용하고 로그인은 abuse가 관찰될 때 추가하는 것이었다. Hosted Supabase Auth의 CAPTCHA 보호는 인증 endpoint별 선택이 아니라 가입·로그인·비밀번호 재설정에 전역 적용된다. 선택 적용을 유지하려면 별도 Auth proxy와 server-side Turnstile 검증 경계를 추가해야 한다.

### Decision

- staging과 production의 회원가입·로그인·비밀번호 재설정 요청에 Cloudflare Managed Turnstile을 공통 적용한다.
- 정상 요청은 가능한 한 자동 통과시키고 Cloudflare가 추가 확인을 요구할 때만 form 안에서 상호작용을 요청한다.
- deterministic local 개발에서는 Turnstile site key와 Supabase CAPTCHA를 비활성화할 수 있다.
- 브라우저에는 site key만 두고 secret key는 Supabase Auth 설정에만 저장한다.

### Rationale

Supabase가 제공하는 검증 경계를 그대로 사용하면 별도 인증 프록시, password 전달 경로와 부분 실패 상태를 만들지 않고도 세 인증 endpoint를 같은 방식으로 보호할 수 있다. Managed mode는 정상 사용자의 상호작용을 최소화하면서 이메일 인증을 생략한 MVP의 자동화 abuse를 줄인다.

### Consequences

- 가입·로그인·재설정 form은 Turnstile token이 준비된 뒤 submit한다.
- 실패하거나 만료된 token은 재사용하지 않고 widget을 reset한다.
- CSP는 Cloudflare challenge script·frame·connect endpoint를 허용한다.
- staging CAPTCHA 활성화는 해당 site key가 포함된 web artifact가 배포된 뒤 수행한다.

### Revisit Trigger

- 정상 사용자의 인증 실패나 추가 상호작용 비율이 제품 사용성을 유의미하게 해칠 때
- Supabase가 인증 endpoint별 CAPTCHA 설정을 제공할 때
- 자체 Auth proxy 또는 edge WAF를 도입해 선택 적용이 더 단순해질 때

## [PRODUCT-033] 외부 도서 선택과 Pack 단위 전체 검수

- Date: 2026-09-03
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §19
  - `docs/BOOK_CONTEXT_SPEC.md`
  - `docs/BOOK_CONTEXT_BUILDER_UX.md`

### Context

운영자가 제목과 저자를 직접 입력하면 동명 도서와 번역·출판 판본을 잘못 등록할 수 있다. 기존 UI는 item과 section마다 검수 상태를 바꾸고 Tier A~E 규칙을 이해하도록 요구해, 실제 업무인 전체 내용 읽기·수정·삭제보다 상태 관리가 앞섰다.

### Decision

- 운영자는 제목, 저자 또는 ISBN으로 외부 도서 카탈로그를 검색하고 표지·번역자·출판사·출간일·ISBN을 확인해 정확한 판본을 선택한다.
- MVP는 검색 결과가 없을 때 수동 등록을 제공하지 않는다.
- 동일 ISBN 또는 동일 Provider 외부 ID의 기존 Pack은 중복 생성하지 않고 기존 Pack으로 이동한다.
- 운영자는 7개 section을 연속해서 읽고 내용을 수정·삭제하며 item·section별 검수 상태를 직접 지정하지 않는다.
- 자동 검사 결과는 `수정 필요`와 `확인 필요`로 구분하고 `근거 부족`, `검수 필요`, `출처 확인 불가` 등 직관적인 문구로 표시한다.
- Tier A~E와 evidence 검증은 내부 품질 규칙으로 유지하되 기본 운영자 화면에서 숨긴다.
- `수정 필요`가 없고 `확인 필요`를 Pack 단위로 한 번 확인하면 `전체 검수 완료`할 수 있다. 검수 완료와 Publish는 별도 결정으로 유지한다.

### Rationale

외부 판본 선택은 생성 입력의 정확도를 높이고 중복을 줄인다. 검수 단위를 Pack 전체로 맞추면 운영자가 기술 분류를 학습하거나 의미 없는 체크를 반복하지 않고 실제 내용 품질에 집중할 수 있다.

### Consequences

- 검색 Provider 장애 시 Pack 생성은 닫힌 상태로 실패하며 빈 책을 만들지 않는다.
- Pack-level 검수자·시각·revision과 확인한 warning 목록을 감사한다.
- 검수 완료 뒤 수정하려면 Draft로 돌아가 새 revision을 다시 검수한다.
- 일반 사용자 카탈로그와 Published exact-version pin 규칙은 바뀌지 않는다.

### Revisit Trigger

- 카카오 검색 누락률 때문에 운영 가능한 도서 범위를 반복해서 충족하지 못할 때
- 운영자가 검색되지 않는 책을 준비해야 해 승인된 수동 등록 흐름이 필요할 때
- 편집자와 검수자 역할 분리가 필요해질 때

## [PRODUCT-034] 빈 Pack 항목 저장 제외와 부분 입력 보류

- Date: 2026-09-03
- Status: ACCEPTED
- Owner: Product owner
- Related:
  - `PRODUCT_SPEC.md` §19.4
  - `docs/BOOK_CONTEXT_BUILDER_UX.md` §5.3

### Context

운영자가 실수로 `항목 추가`를 누른 뒤 내용을 작성하지 않아도 기본 안내 문구가 실제 Pack item처럼 자동 저장되고 있었다. 완전히 빈 항목과 작성 중인 항목을 구분하지 않으면 의미 없는 데이터가 남거나 입력 중인 내용을 조용히 버릴 수 있다.

### Decision

- 새 item의 제목과 내용은 빈 입력으로 시작하고 두 필드를 필수로 표시한다.
- 제목과 내용이 모두 비어 있고 위치·근거·관계도 없는 item은 저장 payload에서 제외한다.
- 제목 또는 내용 중 일부를 작성한 item은 두 필드가 모두 완성될 때까지 자동 저장과 전체 검수 완료를 보류한다.
- 두 필드가 완성되면 기존 Draft 자동 저장 흐름으로 저장한다.

### Rationale

완전히 빈 항목은 운영자의 실수로 보고 무시하되, 작성 중인 항목은 명시적인 필수값 안내를 통해 데이터 유실 없이 완성하도록 한다.

### Consequences

- 안내용 placeholder는 Pack 데이터로 저장되지 않는다.
- 미완성 item이 있으면 화면에 저장 보류 상태가 표시된다.
- API의 기존 strict Draft contract는 유지되어 빈 제목이나 내용이 서버 데이터에 들어가지 않는다.

### Revisit Trigger

- inline 자동 저장보다 별도 item 생성 dialog가 운영 효율에 더 적합하다고 확인될 때
- 임시 작성 상태를 기기 간 유지해야 할 요구가 생길 때

## [TECH-029] Kakao 도서 검색 Provider와 서명된 선택 증명값

- Date: 2026-09-03
- Status: ACCEPTED
- Owner: Engineering
- Related:
  - `PRODUCT-033`
  - `docs/API_REFERENCE.md` §7

### Context

외부 검색 응답의 제목·저자·ISBN을 클라이언트가 임의로 바꿔 Pack 생성 요청에 넣지 못하게 하면서, Provider별 응답 형태와 Pack domain을 분리해야 한다. Amazon 상품 API는 MVP의 단순 도서 검색에 비해 제휴 자격과 운영 전제가 크다.

### Decision

- 서버 전용 `BookCatalogSearchProvider` 경계를 두고 MVP 구현은 Kakao 책 검색 API를 사용한다.
- 서버가 Kakao 응답을 공통 selection contract로 정규화하고 10분 만료 HMAC `selectionProof`로 서명한다.
- Pack 생성 command는 제목·저자 대신 `selectionProof`만 받고 서명과 만료를 검증한다.
- `provider + externalBookId`와 ISBN-13 mapping을 별도 private table에 저장해 중복 판본을 식별한다.
- 카카오 credential과 원본 응답은 브라우저나 공개 catalog contract에 노출하지 않는다.

### Rationale

짧은 수명의 서명 토큰은 생성 시 외부 API를 다시 호출하지 않아도 사용자가 실제 검색한 정규화 결과를 신뢰할 수 있게 한다. Provider boundary와 별도 식별 mapping은 후속 Provider 추가 시 Pack schema를 Kakao에 결합하지 않는다.

### Consequences

- API runtime에 `KAKAO_REST_API_KEY`가 필요하다.
- 검색 제한과 Provider 장애는 `429/503`으로 명시하고 Pack을 생성하지 않는다.
- 후속 Provider 추가 시 공통 contract, dedupe 우선순위와 cross-provider identity 규칙을 함께 확장해야 한다.

### Revisit Trigger

- 카카오 검색 품질·쿼터·약관이 MVP 운영 요구를 충족하지 못할 때
- Google Books나 Naver를 fallback으로 추가할 때
- 외부 선택 증명값 대신 서버 저장형 selection session이 필요한 보안·감사 요구가 생길 때

## [TECH-030] 업무 충돌과 transaction serialization failure의 SQLSTATE 분리

- Date: 2026-09-03
- Status: ACCEPTED
- Owner: Engineering
- Related:
  - `TECH-027`
  - `docs/BOOK_CONTEXT_BUILDER_UX.md` §5.1

### Context

optimistic revision 충돌과 command payload 불일치에 PostgreSQL `40001`을 사용했다. `40001`은 실제 transaction serialization failure를 뜻하며 PostgREST가 자동 재시도하는 대상이어서, 한 번의 Pack 검수 충돌이 같은 RPC의 대량 반복 실행과 오류 로그 폭주로 확대될 수 있다.

### Decision

- 애플리케이션이 의도적으로 발생시키는 revision, aggregate version, idempotency payload와 room 상태 충돌은 non-retryable `P0001`과 안정적인 domain message를 사용한다.
- `40001`은 데이터베이스가 실제 transaction serialization failure로 발생시킨 경우에만 허용한다.
- Builder 실행 중에는 Pack 입력과 lifecycle action을 잠가 생성 revision과 운영자 저장이 경쟁하지 않게 한다.
- stale revision 자동 저장은 반복하지 않는다. 로컬 입력을 유지하고 최신본을 명시적으로 다시 불러오게 한다.

### Rationale

재시도 가능 여부를 SQLSTATE의 표준 의미와 일치시키면 API gateway의 숨은 자동 재시도를 막을 수 있다. UI의 실행 중 잠금과 충돌 후 정지는 정상적인 optimistic concurrency 경계도 보존한다.

### Consequences

- 기존 public/private 함수는 forward migration에서 `40001`의 의도적 raise를 `P0001`로 교체한다.
- 서버의 기존 stable message 기반 오류 mapping과 HTTP `409` contract는 유지된다.
- 실제 serialization failure는 인프라·worker 경계에서만 bounded retry 대상으로 취급한다.

### Revisit Trigger

- PostgREST upgrade 후 SQLSTATE별 retry 정책을 애플리케이션이 명시적으로 제어할 수 있게 될 때
- domain별 custom SQLSTATE 체계가 운영 관측과 client contract에 실질적인 이점을 줄 때

# Experiment Values

Discussion Metrics threshold, Activity 시간 기준, 실제 weight 계산 방식 등은 현재 제품 확정값이 아니라 실험 대상이다.

## [EXPERIMENT-001] 자동 AI 개입 cooldown 초기값

- Date: 2026-09-02
- Status: ACTIVE HYPOTHESIS

### Hypothesis

자동 개입 또는 아직 Host 처리를 기다리는 non-WAIT Policy action 뒤 90초 동안 추가 자동 개입을 `WAIT`로 억제하면 인간 대화를 다시 이어갈 시간을 주면서도 30분 텍스트 세션에서 회복 개입이 지나치게 늦어지지 않는다.

### Initial Value

- 자동 개입 cooldown: 90초
- 기준 시점: 마지막 committed intervention과 최근 non-WAIT Policy action 중 더 최근 시점
- 예외: 방장의 명시적 `AI 도움 요청`, 종료 7분 전 연장 의견

### Measurement

- cooldown 때문에 억제된 cycle 뒤 인간 대화가 자연스럽게 회복되는 비율
- 같은 의제에서 AI가 연속으로 끼어드는 체감과 개입 간격
- cooldown 중 실제로 필요했던 회복 개입이 늦어지는 사례
- 30분/연장 세션별 `WAIT → 다음 Evaluation → action` 변화

### Result

파일럿 전 초기값이다. 사용자 세션과 로그 기반 평가 후 유지·조정한다.

## [EXPERIMENT-002] AI 평가 candidate trigger 초기값

- Date: 2026-09-02
- Status: ACTIVE HYPOTHESIS

### Hypothesis

마지막 committed Wiki cursor 이후 공개 발언량·발언자 폭·침묵·의제 지속 시간을 함께 사용하면 메시지 수 하나만으로 평가할 때보다 자연스러운 대화 단위에서 Evaluator를 실행하면서도 중요한 정체 신호를 놓치지 않는다.

### Initial Value

- message batch: participant message 4개
- participation candidate: participant message 2개 이상이고 고유 발언자가 실제 참가자의 60% 이상, 최소 2명
- silence: 마지막 participant message 뒤 60초
- topic duration: committed Wiki가 있고 마지막 topic-duration candidate 또는 세션 시작 뒤 8분
- time reconciler: 10초 주기
- silence 재평가 bucket/cooldown: 90초
- 우선순위: message batch → participation → silence → topic duration

### Measurement

- trigger별 Evaluation 수, `WAIT` 비율과 실제 Host 개입 비율
- 같은 Wiki cursor에서 중복 억제·stale refresh가 발생한 비율
- 침묵/의제 신호가 인간 대화 재개 직전에 불필요한 호출을 만든 비율
- 평가 간격, provider 비용·latency와 이후 공개 발언 변화
- 세션 인원별 participation candidate의 과민·둔감 사례

### Result

파일럿 전 초기값이다. threshold는 제품 규칙으로 승격하지 않고 관측 결과에 따라 조정한다.

## [EXPERIMENT-003] 방장 AI 도움 재요청 cooldown 초기값

- Date: 2026-09-02
- Status: ACTIVE HYPOTHESIS

### Hypothesis

한 요청이 끝난 뒤 90초 동안 새 방장 도움 요청을 막으면 같은 문제에 대한 연속 AI 개입과 중복 비용을 줄이면서도 30분 세션에서 방장이 다시 도움을 요청할 수 있는 여지를 유지한다.

### Initial Value

- session당 진행 중 요청: 최대 1개
- terminal 요청 뒤 재요청 cooldown: 90초
- 허용 단계: `OPENING | CORE | EXTENDED`
- reason: 제품에 정의된 네 가지 고정 선택지만 허용하고 자유 텍스트를 받지 않음

### Measurement

- cooldown 거절 횟수와 cooldown 종료 직후 재요청 비율
- 요청당 공개 AI Host 메시지 확정률·실패율·stale refresh 횟수
- 방장이 90초를 길거나 짧다고 느끼는 사례
- 자동 intervention과 방장 요청이 근접한 경우의 중복 provider 호출·공개 효과

### Result

파일럿 전 초기값이다. 방장 요청의 실패/재시도 경험과 실제 연속 개입 빈도를 보고 조정한다.

실험값을 정할 때는 다음처럼 기록할 수 있다.

```md
## [EXPERIMENT-NNN] Activity LOW 초기 시간값

- Date:
- Status: PROPOSED

### Hypothesis
왜 이 값을 시험하는가?

### Initial Value
예: 60~90초

### Measurement
무엇을 보고 적절성을 판단할 것인가?

### Result
실험 후 기록.
```
