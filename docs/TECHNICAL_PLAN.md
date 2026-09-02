# 책은양념 MVP 기술 계획

> Status: Accepted technical baseline — ready for vertical-slice implementation  
> Product source of truth: `PRODUCT_SPEC.md`  
> Functional reference: `docs/MVP_FUNCTIONAL_SPEC.md`  
> Decision log: `docs/DECISIONS.md`  
> Frontend implementation: `docs/FRONTEND_PLAN.md`  
> Frontend/server handoff: `docs/FRONTEND_INTEGRATION_GUIDE.md`  
> Backend implementation: `docs/BACKEND_PLAN.md`  
> AI engine detail: `docs/AI_ENGINE_SPEC.md`  
> Book Context detail: `docs/BOOK_CONTEXT_SPEC.md`  
> Last updated: 2026-09-01

## 0. 문서 목적과 결정 상태

이 문서는 확정된 제품 요구사항을 실제로 구현하기 위한 애플리케이션 구조, 데이터 모델, 실시간 동기화, AI 실행, 보안, 테스트와 배포 기준을 정의한다.

- 제품 행동은 `PRODUCT_SPEC.md`가 최종 기준이다.
- 이 문서의 기술 선택은 `docs/DECISIONS.md`의 `TECH-002`~`TECH-024`에서 승인된 기준을 따른다.
- 기술 기준선은 승인되었으며 구현은 §16의 vertical slice 순서와 각 완료 기준을 따른다.
- 구현 중 제품 경험을 바꿔야 하는 문제가 발견되면 기술 편의로 우회하지 않고 Product Decision으로 되돌린다.
- 정확한 threshold, 재시도 간격, AI 모델 alias처럼 운영 중 조정할 값은 코드에 흩뿌리지 않고 설정과 실험값으로 관리한다.

### 0.1 문서 분리와 작업 규칙

이 문서는 frontend와 backend가 함께 따라야 하는 시스템 전체의 기준선이다. 세부 실행 계획은 다음 문서로 분리한다.

| 문서 | 소유 범위 |
| --- | --- |
| `docs/FRONTEND_PLAN.md` | `apps/web`, `packages/design-system`, 화면·상태·Realtime 소비·접근성·Amplify |
| `docs/FRONTEND_INTEGRATION_GUIDE.md` | 구현된 API·Auth·기능 흐름을 frontend adapter와 연결하는 handoff 시작점 |
| `docs/API_REFERENCE.md` | HTTP route와 public/admin Zod contract·오류·멱등성 연결표 |
| `docs/REALTIME_INTEGRATION.md` | session snapshot·private topic·cursor·reconnect의 frontend protocol |
| `docs/FRONTEND_LOCAL_SETUP.md` | local Supabase·API·worker·web 실행과 통합 smoke 절차 |
| `docs/BACKEND_PLAN.md` | `apps/server`, `packages/domain`, Supabase migration/RLS, worker·AI·Lightsail |
| `docs/AI_ENGINE_SPEC.md` | Evaluator·Policy·Host·Living Wiki·Raw Data retrieval의 canonical AI 계약 |
| `docs/BOOK_CONTEXT_SPEC.md` | Pack 콘텐츠·출처·Provider·Builder·Publish의 canonical 상세 계약 |
| 이 문서 | 런타임 경계, 공통 contract, 상태 머신, privacy·보안 불변조건, 전체 slice와 통합 완료 기준 |

작업은 frontend와 backend를 별도로 진행할 수 있지만 다음 규칙을 지킨다.

1. API, snapshot, Realtime event, job/public error의 canonical schema는 `packages/contracts`에서 먼저 변경한다.
2. 제품 단계·권한·deadline과 AI privacy 행동은 하위 문서에서 중복 정의하거나 다르게 해석하지 않는다.
3. frontend는 contract 기반 fake adapter로 선행할 수 있고 backend는 같은 fixture를 controller/event contract test에서 검증한다.
4. `apps/web`과 `apps/server`는 서로 source를 import하지 않고 shared package만 사용한다.
5. 각 vertical slice는 frontend 또는 backend 한쪽 완료가 아니라 공통 E2E 완료 기준을 통과할 때 끝난다.

## 1. 기술 목표와 비목표

### 1.1 목표

1. 서버가 메시지, 권한, 세션 단계, 타이머와 공식 결과의 유일한 확정 주체가 된다.
2. 2~15명이 같은 토론방에서 지연이 낮은 텍스트 토론을 하고, 재접속 후 정확히 복구할 수 있다.
3. AI가 실패하거나 느려도 인간의 채팅, 방장의 운영 명령, 세션 공식 종료는 가능한 범위에서 계속된다.
4. `AI_PRIVATE` 원문·작성자·추론 가능한 출처가 참가자-facing 출력과 일반 운영 로그로 넘어갈 수 없는 구조적 경계를 만든다.
5. 상태 평가 → Policy Action → AI 개입 → 이후 대화 → 사용자 Outcome의 관계를 나중에 분석할 수 있게 남긴다.
6. 한 명의 작은 팀이 MVP를 운영할 수 있도록 관리형 서비스를 우선하고, 복구 가능한 비동기 작업과 자동화된 회귀 테스트를 둔다.

### 1.2 비목표

- 음성, Full-text RAG, 세션 간 AI 장기 기억
- 다중 리전 active-active, 대규모 microservice 분리
- 범용 워크플로 엔진 또는 자체 WebSocket 서버 구축
- 메시지 reaction, 첨부, 별도 thread, 설문
- 참가자별 성향 분석이나 내부 점수 공개
- 미래 기능을 위한 선제적 데이터 모델 확장

## 2. 반드시 보존할 제품 불변조건

구현과 리뷰에서 아래 항목을 일반 기능 요구보다 먼저 확인한다.

### 2.1 계정·권한

- 모든 방장과 참가자는 이메일/비밀번호 계정으로 로그인한다.
- 이메일은 중복될 수 없고 프로필 이름은 가입 시 필수다.
- 이메일 인증은 MVP에서 사용하지 않되 비밀번호 재설정 메일은 동작해야 한다.
- 방장도 인원수에 포함하며 방장 권한과 실제 참여 여부는 구분한다.
- 시작 최소 인원은 현재 연결된 참가 등록 회원을 기준으로 하고, 최대 15명은 참가 등록 회원 수를 기준으로 한다.
- 방장 전용 명령은 클라이언트 표시 여부와 무관하게 서버에서 다시 권한을 검증한다.

### 2.2 세션·메시지

- 메시지는 서버 확정 후에만 공식 메시지가 되며 수정·사용자 삭제를 제공하지 않는다.
- 동일한 전송 재시도는 한 번만 반영한다.
- 방 생성 시 고정한 Published Book Context Pack 버전은 세션 종료까지 바뀌지 않는다.
- 공식 종료 전 모든 단계에서 신규 참가와 재접속을 허용한다.
- 공식 종료는 되돌릴 수 없고 성공한 공식 결과는 재생성하지 않는다.
- 타이머는 서버 시각이 기준이며 클라이언트 탭의 생명주기에 의존하지 않는다.

### 2.3 AI·프라이버시

- 좋은 대화에서는 `WAIT`가 정상이며, 한 판단 주기에는 원칙적으로 하나의 개입 목표만 선택한다.
- Discussion Metrics를 하나의 총점으로 합치지 않는다.
- Book Grounding이 낮다는 이유만으로 책으로 강제 복귀시키지 않는다.
- AI는 단일한 작품 정답이나 참가자의 내적 변화를 단정하지 않는다.
- `AI_PRIVATE` 원문은 Host 입력, 참가자-facing 결과, 일반 로그, 운영자 기본 조회 경로에 존재할 수 없다.
- Raw Data는 변경되지 않는 사실 원본이고 Living Wiki는 교체 가능한 해석이다.
- PUBLIC-lane Living Wiki의 주요 해석은 원본 reference로 재검증할 수 있어야 하며 오래된 patch가 최신 version을 덮어쓸 수 없다.
- Topic Checkpoint와 Final Wiki는 관련 Raw Data를 다시 확인해 만들고, Final Wiki는 공식 기록과 분리된 session-scoped 확정본으로 유지한다.
- Evaluator와 Host는 room에 고정된 exact Pack version을 `BookContextProvider`로 읽으며 Pack 저장 구조에 직접 결합하지 않는다.
- Closing에서는 Evaluator와 자동 개입을 중지한다.

## 3. 권장 시스템 구조

### 3.1 기술 스택

| 영역 | 권장 선택 | 역할 |
| --- | --- | --- |
| Web | React + Vite + TypeScript SPA | 로그인 이후 제품 화면과 실시간 UI |
| Frontend state | React Router Data Mode + TanStack Query + scoped Zustand | URL, authoritative server cache와 ephemeral session 상태 분리 |
| Runtime contract | Zod 4 + Nest schema pipe + React Hook Form | HTTP, Realtime, job, form과 AI schema의 단일 원본 |
| Workspace | pnpm workspace + TypeScript project references | web/server/shared package의 단일 lockfile과 build graph |
| UI | 기존 semantic CSS token + Tailwind CSS + Radix + CVA | 디자인 시스템과 접근성 |
| Frontend 배포 | AWS Amplify Hosting | Git 기반 배포와 CloudFront 정적 CDN |
| Backend | NestJS + FastifyAdapter API, Nest application-context worker | 중요 명령, AI 실행, 관리자 작업 |
| Backend 배포 | AWS Lightsail Container, Seoul | always-on API/worker와 예측 가능한 비용 |
| 데이터 | Supabase Free Postgres, Seoul | 폐쇄 MVP의 권한·원본·상태·결과 authoritative store; quota·pause·자체 backup 감시 |
| DB schema/access | Supabase CLI SQL migration + `supabase-js` RPC + 내부 Kysely/`pg` | 단일 schema 원본과 역할별 최소 권한 접근 |
| 인증 | Supabase Auth | 이메일/비밀번호, 세션, 비밀번호 재설정 |
| 실시간 | Supabase Realtime | private Broadcast, Presence, typing |
| 비동기 | Supabase Queues + Cron + Lightsail Nest worker | AI 호출, 결과 생성, 만료·재시도 |
| AI | OpenAI Responses API + Structured Outputs | 평가, Host, Wiki, 결과, Builder |
| 메일 | Supabase Auth custom SMTP + Resend | PKCE 비밀번호 재설정 전용 transport |
| 테스트 | Vitest + React Testing Library + pgTAP + Playwright | 도메인, UI, DB/RLS, 다중 사용자 E2E |
| Observability | Nest JSON safe logger + Sentry + Postgres facts | 오류, privacy-safe 기술 진단과 durable 제품 학습 분리 |
| Analytics | first-party product events + 제한된 GA4 funnel | authoritative 행동·AI 효과와 유입 퍼널 분리 |

정확한 패키지 버전은 첫 구현 커밋에서 당시 stable 버전으로 pin하고 lockfile로 고정한다.

### 3.2 런타임 경계

```text
Browser
  ├─ Amplify/CloudFront static SPA
  ├─ Supabase Auth, authorized reads, private Realtime, Presence/typing
  └─ authenticated domain command
          │
AWS Lightsail Seoul — NestJS/Fastify API / Nest application-context worker
  ├─ authenticate, validate, rate-limit and map commands
  ├─ room password, domain, admin, AI and deletion workflows
  └─ invoke transactional Postgres commands
          │
Supabase Postgres
  ├─ raw facts and state machine
  ├─ RLS and transactional constraints
  ├─ committed-event broadcast
  └─ durable queue
          ▲
Lightsail worker
  ├─ consume queue with bounded concurrency
  ├─ context builder + OpenAI structured call
  ├─ freshness / privacy validation
  └─ idempotent result commit
```

브라우저는 Supabase Auth, RLS로 보호된 읽기, private Realtime, Presence와 typing에 직접 연결한다. 인증 SDK 작업을 제외한 모든 중요한 domain mutation은 NestJS Command API를 통과하며 browser에서 table write나 domain RPC를 직접 호출하지 않는다. 메시지 전송, 참가, 시작, 연장, 종료, 방장 이전, 내보내기, Closing 제출과 결과 확정은 versioned Postgres transaction에서 최종 확정한다.

NestJS는 인증, 입력 validation, rate limit, password hash 검증, 외부 workflow와 response mapping을 담당한다. Postgres는 constraint, 최종 권한·현재 상태 검사, row lock, idempotency, mutation과 event/job 기록을 한 transaction에서 처리한다. 일반 사용자 command는 사용자 JWT 범위 또는 제한된 DB 권한으로 실행하고 elevated Supabase secret client는 worker·관리자·계정 삭제 전용 module로 격리한다.

### 3.3 모듈 경계

프론트와 백엔드는 같은 저장소에서 contract를 공유하되 독립적으로 빌드·배포한다. 초기 권장 구조는 다음과 같다.

```text
apps/
  web/                   Vite SPA, routes, features, components
  server/                NestJS API and application-context worker entry points
    src/api/             FastifyAdapter bootstrap and HTTP-only modules
    src/worker/          queue consumer bootstrap and worker-only modules
    src/modules/         feature-local application/domain/infrastructure modules
packages/
  contracts/             command, snapshot, event and AI schemas
  domain/
    session-machine/     pure transitions and invariants
    policy/              deterministic action selection
    privacy/             context allow-list and leak guards
  design-system/         reusable tokens and components
supabase/
  migrations/
  functions/
  tests/                pgTAP and RLS tests
tests/
  fixtures/
  evals/
  e2e/
```

Evaluator, Policy, Host, Living Wiki를 각각 별도 contract와 저장 타입으로 유지한다. PUBLIC Evaluator와 PUBLIC-lane Wiki patch는 비용을 줄이기 위해 한 번의 모델 호출로 받을 수 있어도 입력 builder·출력 schema·검증·저장 책임은 논리적으로 분리한다. AI_PRIVATE가 입력된 호출은 PUBLIC-lane Wiki patch나 사용자-facing 출력을 함께 생성할 수 없다.

backend는 기능별로 `controller → application → domain → infrastructure` 경계를 사용하되 모든 endpoint에 같은 파일 조합을 강제하지 않는다. 단순 조회는 query service로 두고, 상태 전이·권한·트랜잭션이 있는 변경만 명시적 command/application service로 구성한다. provider token은 feature-local `Symbol` 또는 class를 사용하며 전역 문자열 token registry와 모든 기능 관계를 가진 거대 entity graph를 만들지 않는다.

HTTP API는 NestJS `FastifyAdapter`로 실행하고 worker는 HTTP listener가 없는 Nest application context로 실행한다. 두 entry point는 contract와 순수 domain module을 공유하지만 HTTP adapter object를 application/domain 계층으로 넘기지 않으며, worker-only private repository가 일반 Host·record module에 노출되지 않도록 import boundary를 검사한다.

### 3.4 재사용성과 공급자 경계

재사용의 대상은 제품 규칙과 contract이며 모든 infrastructure를 최저 공통분모로 추상화하지 않는다.

- `packages/domain`은 NestJS, Supabase, AWS, OpenAI SDK를 import하지 않는다.
- command, snapshot, realtime event와 job envelope은 framework-neutral schema로 정의한다.
- frontend component에서 Supabase client를 직접 호출하지 않고 feature data-access와 realtime adapter를 통과한다.
- Supabase Auth, Realtime, Queues와 Postgres query는 각 infrastructure adapter에 한정한다.
- `JobQueue`와 realtime client adapter는 provider-neutral port를 제공하지만 Postgres transaction·RLS를 감추는 범용 database abstraction은 만들지 않는다.
- `BookContextProvider`는 Pack 저장·Builder 구조에서 Evaluator/Host를 분리하고, `SessionRawDataRetriever`는 exact/metadata/semantic retrieval 구현에서 AI context builder를 분리한다.
- live AI consumer는 Builder artifact repository나 web search tool을 import하지 않고 room에 고정된 검수 완료 Pack과 session Raw Data만 사용한다.
- 배포 대상은 환경별 container/static artifact로 만들고 application code가 Amplify·Lightsail API를 직접 사용하지 않는다.
- 공급자를 바꿀 때 domain/state machine/Policy/job handler를 유지하고 auth adapter, realtime adapter, queue adapter, migration과 배포 설정을 교체하는 것을 목표로 한다. Postgres 밖의 queue로 이동할 때는 atomic `pgmq.send` 대신 transactional outbox relay가 추가로 필요하다.

Postgres constraint, row lock, RLS와 transaction function은 의도적인 결합이다. 이를 DB 중립 추상화로 약화시키지 않고, SQL migration과 database test를 독립 자산으로 관리한다.

### 3.5 Database access와 schema ownership

- schema, RLS, function, trigger, grant와 extension의 유일한 원본은 `supabase/migrations`의 versioned SQL이다.
- browser는 generated database type을 적용한 `supabase-js`를 feature data-access adapter 안에서만 사용하며 Auth, 허용된 읽기와 Realtime 외의 domain mutation을 직접 실행하지 않는다.
- NestJS의 사용자 command는 사용자 JWT가 적용된 Supabase client로 좁은 Postgres command function을 RPC 호출한다.
- worker·관리자·계정 삭제용 repository만 Kysely + `pg`를 사용하며 기능별 최소 권한 DB role로 연결한다. Kysely와 DB row type은 infrastructure 밖으로 노출하지 않는다.
- TypeORM, Prisma와 Drizzle의 schema DSL이나 migration generator를 병행하지 않는다.
- production의 장기 실행 API·worker는 direct connection을 우선하고 IPv6 reachability가 없으면 Supavisor session pooler를 사용한다. migration credential과 runtime credential은 분리한다.

### 3.6 Frontend state ownership

- React Router Data Mode는 route tree, auth guard, URL/search parameter와 route error boundary를 담당한다. loader는 auth 확인과 TanStack Query prefetch만 수행한다.
- TanStack Query는 프로필, 방, membership, 공식 메시지, session phase, 검증된 current-topic/AI-intervention projection과 결과처럼 서버가 참가자에게 공개한 확정 상태를 소유한다. Living Wiki 전체 document는 browser cache 대상이 아니다.
- session route마다 scoped Zustand store를 만들어 Presence, typing, connection state, reply target와 pending outbox만 보관하고 퇴장 시 폐기한다.
- Supabase Auth session은 전용 provider가 소유하고 token을 다른 store에 복제하지 않는다. 컴포넌트 하나에만 필요한 입력·dialog 상태는 React local state에 둔다.
- 공식 데이터를 Zustand에 복제하거나 Query cache와 대화 본문을 localStorage에 영구 저장하지 않는다.

### 3.7 Shared runtime contracts

- `packages/contracts`의 Zod 4 schema를 command, public response, snapshot, Realtime event, job envelope과 canonical AI contract의 Source of Truth로 사용하고 TypeScript type은 `z.infer`로 만든다.
- browser는 API response와 event를, NestJS는 body/query/param을, worker는 queue payload를, provider adapter는 LLM response를 각 경계에서 parse한다.
- 공개 response/event schema와 private/internal schema의 export를 분리하며 public payload는 publish 직전에 allow-list schema를 항상 검증한다.
- DB/Kysely row를 public contract로 직접 반환하지 않고 repository와 response mapper를 거친다.
- React의 비단순 form은 React Hook Form과 같은 Zod schema를 사용하되 권한·상태·동시성은 client validation 결과와 무관하게 server/domain/DB가 다시 검사한다.
- OpenAPI와 provider JSON Schema는 Zod에서 생성하는 파생 산출물이며 `class-validator` DTO나 provider SDK type을 별도 contract 원본으로 만들지 않는다.

### 3.8 Workspace와 build graph

- root pnpm workspace의 초기 project는 `apps/web`, `apps/server`, `packages/contracts`, `packages/domain`, `packages/design-system`이다. `supabase/`와 root `tests/`는 배포 package가 아닌 versioned 자산이다.
- 내부 package는 `workspace:*`로만 연결하고 모두 `private: true`로 둔다. 하나의 lockfile, pinned Node/pnpm version과 TypeScript project references를 사용한다.
- 의존 방향은 `contracts/domain → web, server`, `design-system → web`이며 web과 server는 서로 직접 import하지 않는다. source deep import, 상대 경로 package 횡단과 dependency cycle은 CI에서 거절한다.
- root script는 pnpm filter로 app별 build·test·deploy를 실행한다. Turborepo/Nx와 package publishing은 MVP에서 사용하지 않는다.

### 3.9 Browser·responsive·accessibility baseline

- Vite major의 `Baseline Widely Available`을 production target으로 삼고 Chrome·Edge·Firefox·Safari 최신·직전, iOS Safari 최신·직전 major와 Android Chrome 최신·직전을 지원한다. Samsung Internet 최신 stable은 핵심 flow를 수동 smoke한다.
- legacy/IE bundle·PWA·완전 offline·background push를 제외하고, in-app browser와 필수 API 미지원 시 기본 browser/update 안내를 표시한다.
- responsive web은 360 CSS px부터 `100dvh`, safe area, orientation·virtual keyboard를 처리하고 hover-only action과 focus를 가리는 sticky UI를 금지한다.
- WCAG 2.2 AA를 구현 목표로 하고 semantic HTML, keyboard/focus, 4.5:1 text contrast, non-color state, 200% zoom/reflow, reduced motion, 권장 44×44 touch target을 적용한다. 공식 인증을 주장하지 않는다.
- Realtime message는 최신 위치에서만 polite announcement하고 과거 탐색 중에는 새 message count를 알린다. typing은 음성 반복하지 않고 timer는 7/5/1분·Closing 경계만 알린다.
- `lang="ko"`, UTF-8을 기본으로 하고 UTC server timestamp를 client local timezone으로 표시한다.

## 4. 인증과 사용자

### 4.1 가입과 로그인

- Supabase Auth의 email/password를 사용한다.
- Hosted Auth 설정에서 email confirmation을 끈다.
- `auth.users.email`의 canonical uniqueness를 계정 이메일 중복 기준으로 삼고, UI의 사전 중복 확인은 편의 기능일 뿐 최종 판정은 가입 트랜잭션 결과가 한다.
- 가입 성공 시 `public.profiles`를 생성하는 DB trigger를 두고, 공백만 있는 프로필 이름이면 가입을 확정하지 않는다.
- 프로필 이름은 다른 사용자와 중복될 수 있으며 권한과 데이터 귀속에는 사용하지 않는다.
- 가입 시 이메일 중복은 `이미 사용 중인 이메일입니다`로 안내한다. 로그인 오류는 이메일 존재 여부를 구분하지 않는 일반 문구로 반환한다.

### 4.2 비밀번호 재설정

- Supabase PKCE reset flow를 사용한다.
- 배포 환경에서는 Supabase 기본 메일 발송에 의존하지 않고 Resend custom SMTP를 연결한다. Supabase Auth가 token·만료·template을 소유하고 별도 NestJS mail service는 만들지 않는다.
- reset 요청은 이메일 존재 여부와 무관하게 같은 사용자-facing 응답을 준다.
- reset callback의 redirect allow-list는 배포 도메인과 로컬 개발 주소로 제한한다.
- 인증 전용 sending subdomain에 SPF/DKIM/DMARC를 설정하고 open/click tracking을 끈다. 메일에는 profile·방·책·토론 정보 없이 하나의 reset CTA만 둔다.
- local Mailpit, staging과 production Resend credential/domain을 분리하고 recipient와 reset link는 log·Sentry·analytics에 남기지 않는다.

### 4.3 역할

- 전역 역할은 `USER | ADMIN`만 둔다.
- 방장 여부는 전역 역할이 아니라 `rooms.host_user_id`로 관리한다.
- 운영자 기능은 별도 route group과 서버 권한 검사로 보호한다.
- elevated Supabase secret API key는 worker와 안전한 서버 런타임에만 두고 브라우저 bundle에는 포함하지 않는다.

### 4.4 인증·browser·방 password 보안

- Supabase Auth client만 access/refresh token을 소유하고 다른 client store, log, Sentry와 analytics에 복제하지 않는다.
- Nest API는 Supabase JWKS로 bearer JWT의 signature, issuer, audience, expiry와 subject를 검증한다. production은 HTTPS/HSTS, Helmet, exact-origin CORS, body 한도와 strict CSP를 사용한다.
- user-generated text는 plaintext로만 rendering하고 MVP에 HTML/Markdown/rich text·자동 linkify를 넣지 않는다.
- 가입·로그인·reset은 Supabase Auth의 전역 Cloudflare Turnstile managed challenge와 Auth rate limit을 사용한다.
- 방 password는 Argon2id PHC string으로 저장하고 `m=19 MiB, t=2, p=1`에서 시작해 운영 환경에서 벤치마크한다. 변경 시 hash와 `password_version`을 한 transaction에서 갱신한다.
- 방·actor별 실패를 기본 1분 5회, 1시간 20회로 제한하고 private Postgres bucket으로 instance/restart 간 상태를 유지한다. 방 전체 lockout과 Redis는 사용하지 않는다.
- raw IP, 제출 password와 token을 저장하지 않고 필요한 IP 식별자는 HMAC 단기 값으로만 관리한다.
- API는 secret-only RPC로 Argon2 hash와 password version을 읽고 검증 성공 시 30초짜리 일회성 join authorization hash만 DB에 저장한다. membership 확정 RPC는 사용자 access token의 `auth.uid()`와 authorization actor/version을 다시 비교한다.
- idempotency payload fingerprint는 별도 server-only HMAC key로 만들며 password 원문이나 빠른 무키 hash를 receipt에 남기지 않는다.

### 4.5 Supabase key와 secret lifecycle

- web은 Supabase `sb_publishable_...` key만 사용하고 API·worker/admin은 가능하면 서비스별 `sb_secret_...` key를 분리한다. legacy `anon`/`service_role` JWT key에 새 구현을 결합하지 않는다.
- Supabase Auth는 managed asymmetric signing key를 사용하고 Nest API는 JWKS로 검증한다.
- local secret은 gitignored `.env.local`/`.env.test`, deploy/workflow secret은 환경별 GitHub Environment, API·worker runtime secret은 Lightsail deployment environment에 두되 repository·image·web artifact·release manifest·backup·log에 복제하지 않는다.
- bootstrap은 Zod로 secret의 존재·형식·환경 조합만 검증하고 값은 error에 포함하지 않는다.
- CI secret scan과 web/Docker artifact 금지 pattern 검사를 적용하고 `.env*`, dump·private key 파일을 build context에서 제외한다.
- inventory에 secret 값 대신 owner·environment·service·생성/교체 시각·revoke 절차만 남긴다. 관리 provider 계정은 MFA와 개인 account를 사용한다.
- rotation은 new 생성·staging 검증·production 교체·old 미사용 확인·revoke 순서를 사용하고 6개월마다 staging 훈련, 최소 연 1회 관리 key review를 실시한다. 사고 시에는 즉시 revoke·비용/data/account-recovery 차단을 우선한다.

## 5. 핵심 데이터 모델

아래는 논리 모델이다. 실제 DDL 이름과 index는 migration 작성 시 확정한다.

### 5.1 계정과 책

| 테이블 | 핵심 필드와 규칙 |
| --- | --- |
| `profiles` | `user_id`, `profile_name`, timestamps; Auth 삭제와 분리된 공개 프로필 |
| `admin_roles` | 명시적으로 부여된 관리자만 존재 |
| `books` | 제목·저자·출판사·출간연도·장르·판본·번역자·ISBN·표지 등 책/판본 식별 정보 |
| `book_context_pack_versions` | `book_id`, version, `DRAFT/REVIEW/PUBLISHED/RETIRED`, schema version, checksum, Pack-level 검수 revision·생성·게시·Retire metadata |
| `book_context_sections` | Pack version별 7개 section, coverage와 review 상태 |
| `book_context_items` | stable item id, section, `FACT/AUTHOR_STATEMENT/INTERPRETATION/DISCUSSION_SIGNAL`, 내용·위치·evidence state |
| `book_context_item_links` | theme·entity·issue 등 item 사이의 typed relation |
| `book_context_sources` | Tier A~E, URL/서지 locator, 제목, 발행 주체, 조사 시각과 권리 metadata |
| `book_context_item_sources` | item-source의 `SUPPORTS/CONTRADICTS/CONTEXT_ONLY` 관계와 근거 위치 |
| `private.book_catalog_external_identifiers` | Provider 외부 ID·ISBN과 정규화 selection snapshot; 동일 판본 중복 방지 |
| `private.book_builder_runs/artifacts` | durable stage, 시도·오류·현재 Draft와 live consumer에서 격리된 중간 산출물 |
| `book_context_admin_audit` | 운영자 actor, action, target, 시각, 변경 metadata와 사유 |

Published와 Retired Pack은 내용 수정 대신 새 버전을 만든다. 방은 생성 시 정확한 `book_context_pack_version_id`를 저장한다. 신규 catalog에는 활성 Published만 보이지만 기존 방의 AI Provider는 고정된 Retired version도 계속 읽을 수 있다. 상세 schema와 상태 전이는 `docs/BOOK_CONTEXT_SPEC.md`를 따른다.

### 5.2 방·참여·세션

| 테이블 | 핵심 필드와 규칙 |
| --- | --- |
| `rooms` | 제목, 일정, password hash, min/max, host, pinned Pack, canceled_at; `2 ≤ min ≤ max ≤ 15` DB check |
| `room_memberships` | room/user unique, `REGISTERED/PARTICIPATED/CANCELED/REMOVED/NO_SHOW`, joined_at; host row는 방 생성과 함께 생성 |
| `prep_entries` | author, visibility `PUBLIC/AI_PRIVATE`, PUBLIC body 또는 private body reference, timestamps |
| `private.ai_private_prep_bodies` | 전용 비노출 schema의 AI_PRIVATE 원문; author 본인 관리 command와 Evaluator worker만 접근 |
| `session_runs` | room unique, internal phase, `phase_version`, started/ended times, discussion end, closing end, extension count; 방 생성 시 `SCHEDULED` row 생성 |
| `session_connections` | session/user/device, last heartbeat, disconnected time; 서버 시작 인원 판정용 |
| `session_events` | 전환과 운영 명령의 append-only 감사 이벤트 |

방 비밀번호는 unique salt의 Argon2id PHC string으로 hash하고 평문을 저장·로그하지 않는다. 계정 비밀번호 hash와 방 비밀번호 hash를 섞어 사용하지 않는다.

### 5.3 대화·AI·결과

| 테이블 | 핵심 필드와 규칙 |
| --- | --- |
| `messages` | session, monotonic `seq_no`, author 또는 익명 contributor, body, reply target/quote snapshot, confirmed_at |
| `final_reflections` | session/user unique, body 또는 skipped, profile-name snapshot, revision, finalized_at |
| `living_wiki_versions` | session, version, `INCREMENTAL/TOPIC_CHECKPOINT/FINAL`, base version, based-through-seq, 공개 원본만으로 설명 가능한 구조화 문서 |
| `session_search_chunks` | PUBLIC 메시지의 재생성 가능한 retrieval index; first/last seq, message ids, participant/topic/time metadata |
| `private.living_wiki_private_state` | AI_PRIVATE에서 파생된 세션 내부 상태; Host·결과 query에서 접근 불가 |
| `private.ai_evaluations` | metric별 값·근거 reference·confidence·input cursor·prompt/model version; participant-facing schema에서 제외 |
| `policy_actions` | evaluation, action enum, reason codes, chosen target, suppression reason |
| `ai_interventions` | action, generated body, committed message, freshness cursor |
| `discussion_records` | session unique, immutable structured result, state `GENERATING/RETRYING/READY/FAILED` |
| `job_runs` | job type/key, status, attempt, next attempt, payload reference, error class |

메시지 제약:

- `(session_id, author_user_id, client_message_id)` unique
- `(session_id, seq_no)` unique
- body 1~2000자, reflection 1~300자
- reply 대상은 같은 session의 이미 확정된 메시지만 허용
- reply quote는 확정 당시 snapshot으로 보존하되 화면의 이름 표시 정책은 원본 author와 탈퇴 익명화 규칙을 따른다.
- 참가자 메시지의 표시 이름은 작성 시점의 현재 profile에서 snapshot하고 이후 profile 변경을 소급 반영하지 않는다.
- 같은 `client_message_id` 재시도는 최초 message와 최초 `MESSAGE_APPENDED` event 위치를 반환하며 새 cursor를 발급하지 않는다.
- 개인정보 운영 삭제는 행 삭제 대신 redaction marker와 감사 이벤트를 남김
- 일반 사용자의 message update/delete 권한은 DB에서 거절

`private` schema는 Supabase Data API exposed schema 목록에 넣지 않는다. elevated secret key를 가진 일반 server module이 임의 조회하지 않도록 전용 worker function과 repository만 private schema에 접근하고, 코드 import boundary test로 Host·record module의 접근을 차단한다.

Living Wiki document/patch, evidence reference, version commit, Topic Checkpoint, Final Wiki와 Search Chunk의 상세 계약은 `docs/AI_ENGINE_SPEC.md`를 따른다. `session_search_chunks`는 Raw Message를 대체하지 않는 파생 데이터이며 PUBLIC과 AI_PRIVATE를 하나의 chunk에 섞지 않는다.

### 5.4 탈퇴 후 익명화

공동 기록은 사용자 계정 FK가 삭제되어도 유지되어야 하므로 참가자-facing snapshot과 내부 비식별 contributor key를 분리한다.

- 계정 탈퇴 command가 Auth 식별정보, 프로필, AI_PRIVATE와 파생 private cache를 삭제한다.
- 공동 메시지, PUBLIC 사전 입력, reflection의 표시 이름을 `탈퇴한 사용자`로 원자적으로 바꾼다.
- 원래 user id와 직접 연결되지 않는 random contributor id만 공동 기록 연결에 남긴다.
- 같은 이메일 재가입은 Supabase Auth에서 새 계정으로 취급하며 과거 기록과 연결하지 않는다.
- 진행 중 실제 참여자, 예정 방장, ADMIN의 탈퇴 금지 조건을 트랜잭션 안에서 검사한다.

## 6. 세션 상태 머신과 시간

### 6.1 내부 상태와 사용자 표시

| 내부 상태 | 사용자 표시 | 채팅 | AI 자동 평가 |
| --- | --- | --- | --- |
| `SCHEDULED` | 시작 예정 | 닫힘 | 중지 |
| `WAITING_START` | 시작 대기 | 닫힘 | 중지 |
| `OPENING` | 토론 중 | 열림 | 허용 |
| `CORE` + extension 0 | 토론 중 | 열림 | 허용 |
| `CORE` + extension > 0 | 연장 중 | 열림 | 허용 |
| `SYNTHESIS` | 마무리 중 | 열림 | Synthesis 작업만 |
| `CLOSING` | 마무리 중 | 일반 채팅 닫힘 | 중지 |
| `ENDED` | 종료 | 닫힘 | 결과 작업만 |
| `CANCELED` | 취소됨 | 닫힘 | 중지 |

Opening에서 Core로 넘어가는 시간은 강제 5분 timer가 아니라 AI transition 또는 운영상의 현재 의제 변화로 기록한다. 사용자-facing 상태는 두 단계 모두 `토론 중`이다.

### 6.2 authoritative timestamps

- `discussion_ends_at`: 현재 기본·연장 토론 타이머의 종료 시각
- `extension_prompted_at`: 현재 구간의 7분 안내를 한 번만 확정한 시각
- `extension_decision_deadline_at`: 5분 남는 시각
- `closing_started_at`, `closing_ends_at`: 최대 5분 Closing
- 모든 화면은 서버 응답의 `server_now`와 deadline 차이로 표시하고, 브라우저 interval은 표현만 담당한다.

### 6.3 전환 규칙

1. 방장 `start` command는 membership 최대 인원, 방 상태, Published Pack 고정 여부, 현재 heartbeat가 유효한 등록 회원 2명 이상을 한 트랜잭션에서 검사한다.
2. `SCHEDULED/WAITING_START` session row를 시작 시 활성 단계로 전환하고 `discussion_ends_at = server_now + 30 minutes`로 확정한다.
3. 세션 시작 후 사용자가 실시간 토론방에 처음 들어오면 같은 transaction에서 membership을 `PARTICIPATED`로 승격한다. 진행 중 신규 사용자는 password·정원 검사를 거쳐 등록과 실제 참여를 함께 확정한다.
4. 7분 남으면 `extension_prompted_at`을 compare-and-set하고 AI 의견 job을 enqueue한다. 의견 실패와 무관하게 결정 UI는 연다.
5. 방장의 `extend`는 phase version과 deadline을 검사한 뒤 즉시 15분을 더하고 extension count를 증가시킨다.
6. `wrap`은 즉시 Synthesis로, 무응답은 5분 남는 시각에 Synthesis로 전환한다.
7. Synthesis는 기존 `discussion_ends_at`까지 진행하고 0이 되면 Closing을 시작한다.
8. Closing 중 현재 접속한 실제 참여자 전원이 제출 또는 건너뛰기를 확정하면 자동 종료할 수 있다. 그렇지 않으면 5분에 자동 종료한다.
9. 방장 강제 종료는 어느 활성 단계에서든 `ENDED`를 한 번만 확정하며 이후 명령을 거절한다.

동시에 도착한 연장·마무리·자동 전환은 `SELECT ... FOR UPDATE`, `phase_version`, 조건부 update로 한 승자만 갖게 한다. loser는 최신 snapshot을 포함한 conflict 응답을 받는다.

### 6.4 due-event reconciler

클라이언트 타이머가 서버 상태를 바꾸지 않는다. Postgres Cron이 짧은 주기로 `advance_due_sessions()`를 실행해 다음을 idempotent하게 처리한다.

- 7분 안내 확정과 AI 의견 enqueue
- 5분 무응답 Synthesis 전환
- 토론 timer 0의 Closing 전환
- Closing 5분 만료 공식 종료
- 종료 결과 job enqueue

초기 tick은 10초를 권장한다. 정확한 UI countdown은 timestamp로 표시하므로 tick 지연은 상태 전환 확정에만 영향을 준다. 운영 지표에서 지연 p95가 15초를 넘으면 주기 또는 실행 방식을 재검토한다.

reconciler는 겹친 Cron 실행에도 안전하도록 transaction-level advisory lock 또는 동등한 단일 실행 guard와 `FOR UPDATE SKIP LOCKED`를 사용한다. 상태 전환과 필요한 queue enqueue는 같은 transaction에서 commit한다. Cron은 AI 호출이나 worker process 시작을 담당하지 않는다.

## 7. 실시간 통신과 재접속

### 7.1 채널 구성

- Supabase Realtime을 MVP realtime provider로 사용한다.
- 공식 topic은 `session:{session_id}:v{channel_epoch}`, ephemeral topic은 그 뒤에 `:ephemeral`을 붙인다. 두 topic은 private이고 public channel은 비활성화한다.
- Postgres commit 후 DB trigger가 message/state/record 이벤트를 공식 topic으로 Broadcast한다. client는 이 topic을 수신만 하며 Broadcast write 권한을 갖지 않는다.
- ephemeral topic은 Presence와 typing Broadcast를 client read/write로 허용하되, 공식 `session_event`를 발행하지 않는다.
- Realtime channel authorization은 `realtime.messages` RLS에서 active session, membership, 정확한 current epoch·topic suffix를 검사한다.
- 내보내기·탈퇴처럼 현재 구독자의 권한을 즉시 폐기해야 하는 transaction은 `channel_epoch`을 증가시킨다. DB는 이후 event를 새 topic에만 보내고 남은 참가자는 최신 snapshot을 받은 뒤 재구독한다. 제거된 사용자는 새 topic의 membership RLS를 통과할 수 없다.
- application event contract와 client realtime adapter는 Supabase SDK payload type에 직접 의존하지 않는다.

### 7.2 Presence와 서버 인원 판정 분리

Realtime Presence는 UI의 빠른 온라인 표시에는 적합하지만 DB transaction에서 시작 가능 인원을 확정하는 자료로 사용할 수 없다. 따라서:

- 연결된 client는 약 15초마다 `session_connections.last_seen_at`을 갱신한다.
- 서버는 최근 약 30초 안의 heartbeat만 현재 연결로 센다.
- 브라우저 종료 이벤트는 best-effort로만 사용하고 heartbeat 만료가 최종 기준이다.
- 두 탭·두 기기는 사용자 한 명으로 deduplicate한다.
- 15초/30초는 `EXPERIMENT` 설정으로 운영하며 모바일·백그라운드 오탐을 측정한다.

### 7.3 reconnect protocol

1. client가 오프라인을 감지하면 composer와 운영 명령을 잠그고 draft는 브라우저 메모리에 유지한다.
2. 기존에 알고 있던 공식 topic이 있으면 먼저 subscribe해 새 event를 임시 buffer에 넣는다.
3. 마지막 확정 `seq_no`, event cursor, 알고 있던 `phase_version`으로 sync를 요청한다.
4. 서버는 현재 snapshot과 누락 메시지·이벤트, active session의 현재 공식/ephemeral topic을 반환한다. 종료·취소 session은 topic을 반환하지 않는다.
5. 공식 topic이 달라졌거나 최초 진입이면 반환된 공식 topic을 subscribe·buffer한 뒤 반환 cursor로 sync를 한 번 더 요청해 snapshot과 subscribe 사이 gap을 닫는다. 그 뒤 ephemeral topic을 join한다.
6. client는 DB snapshot으로 교체하고 cursor보다 새로운 buffer event만 순서대로 적용한다.
7. 동기화가 끝난 뒤에만 입력을 연다.

Broadcast는 알림 수단이고 DB snapshot이 정답이다. 이벤트를 놓치거나 순서가 바뀌어도 cursor sync로 회복해야 한다.

frontend의 committed event는 순수 `SessionEvent` reducer가 `seq_no`, aggregate version과 channel epoch를 검사한 뒤 TanStack Query cache에 반영한다. gap이면 입력을 잠그고 snapshot으로 교체한다. Presence·typing·연결 상태는 scoped Zustand에만 두며 snapshot의 공식 message·phase와 섞지 않는다.

pending message는 Zustand outbox에 `clientMessageId`로 보관한다. command 응답 또는 committed event가 같은 id를 확정하면 Query cache의 공식 메시지와 합치고 outbox에서 제거하며, 실패하면 재시도 상태로 남긴다.

## 8. 서버 command와 idempotency

Supabase Auth SDK 작업을 제외한 frontend domain mutation은 모두 NestJS API에 command로 보낸다. NestJS의 사전 검사는 빠르고 이해 가능한 오류를 만들기 위한 것이며, 권한·상태·동시성 불변조건은 DB transaction이 다시 검사하고 최종 판정한다. SQL에는 원자적 확정에 필요한 최소 규칙을 두고 외부 서비스 workflow와 표현 로직은 application 계층에 둔다.

### 8.1 command envelope

모든 중요한 변경은 다음 공통 필드를 가진다.

```ts
type CommandEnvelope<T> = {
  commandId: string;       // client-generated UUID
  expectedVersion?: number;
  payload: T;
};
```

응답은 `accepted`, `duplicate`, `conflict`, `forbidden`, `validation_error`를 구분하고 성공 시 최신 aggregate version과 server time을 돌려준다.

### 8.2 초기 command 목록

- account: `updateProfile`, `deleteAccount`
- room: `createRoom`, `joinRoom`, `cancelMembership`, `transferHost`, `removeMember`, `cancelRoom`
- session: `startSession`, `extendSession`, `startSynthesis`, `endSession`
- conversation: `sendMessage`
- closing: `upsertReflection`, `deleteReflection`, `skipReflection`
- result: `retryInitialRecord`
- admin: Pack Draft 생성·편집·Review·Publish·Retire, Builder 재시도

각 command의 DB 확정 단계는 actor, 역할, 현재 상태, 입력 불변조건과 idempotency를 동일 트랜잭션 안에서 처리한다. 화면에서 버튼을 숨기거나 NestJS에서 먼저 확인한 결과는 최종 권한 통제가 아니다. 방 password처럼 NestJS에서 검증하는 secret은 검증에 사용한 password version을 transaction이 다시 비교해 검증과 membership 확정 사이의 변경을 거절한다.

사용자 command function은 NestJS가 전달한 elevated secret 신뢰값이 아니라 사용자 JWT의 `auth.uid()`를 기준으로 actor를 다시 확인한다. worker·관리자용 Kysely repository는 이 경로와 분리하고 일반 사용자 command handler에서 import하지 않는다.

## 9. AI 실행 구조

### 9.1 공통 원칙

- application은 provider-neutral `AiGateway`와 canonical request/result만 사용하며 provider SDK와 응답 type은 infrastructure adapter에 한정한다.
- 초기 adapter는 OpenAI Responses API와 Structured Outputs를 사용한다.
- 요청은 `store: false`의 stateless 호출로 실행하고 provider conversation과 `previous_response_id`를 세션 기억으로 사용하지 않는다. 필요한 기억은 DB Raw Data, versioned Wiki와 cursor로 context builder가 구성한다.
- Evaluator, Wiki, Host, Synthesis, record와 Builder는 각자 versioned input/output schema를 가진다. Structured Output 성공 후에도 reference, semantic, privacy와 freshness를 검증한다.
- 사용자-facing AI 출력은 stream하지 않는다. 전체 출력 검증과 DB commit 이후에만 Realtime으로 게시한다.
- live Evaluator와 Host에는 web search나 외부 tool을 허용하지 않는다. Builder tool은 source capture와 운영자 Review 경계에서만 사용한다.
- 모델명, reasoning, prompt, schema와 context builder는 logical task alias로 관리하고 DB에는 실행 당시 provider와 실제 version을 기록한다.
- 모델 원문 응답 전체를 일반 로그에 남기지 않고 검증된 구조화 결과와 최소 메타데이터만 저장한다.
- 모든 작업은 `job_key`와 결과 unique constraint로 exactly-once effect를 만든다. 모델 호출 자체는 중복될 수 있어도 사용자-visible commit은 한 번만 일어난다.
- 다른 provider는 adapter, canonical contract compatibility, 고정 eval과 privacy 검토를 통과한 뒤 task alias에 연결할 수 있다. `AI_PRIVATE` 허용 task는 승인된 provider allow-list를 별도로 가지며 자동 cross-provider fallback을 금지한다.
- AI_PRIVATE task는 전용 provider project/key를 사용한다. `store: false`는 ZDR로 간주하지 않으며 조직·project의 승인된 데이터 보존 설정이 확인되지 않으면 외부 LLM 처리를 비활성화한다.

### 9.2 초기 model routing

| 작업 | 초기 provider/model | reasoning 가설 | 이유 |
| --- | --- | --- | --- |
| Public Evaluator + Wiki patch | OpenAI `gpt-5.6-luna` | `none/low` 비교 | 반복 호출, 구조화된 공개 관찰 |
| Private Evaluator | 초기 비활성화 | 추후 eval에서 결정 | 보존 조건·privacy gate 통과 후 제한된 신호만 생성 |
| Host/Opening/Synthesis | OpenAI `gpt-5.6-terra` | `low` | 사용자-facing 문장 품질과 지연 균형 |
| 최종 토론 기록 | OpenAI `gpt-5.6-terra` | `medium` | 구조와 표현의 안정성 |
| Book Context Builder | OpenAI `gpt-5.6-terra` | `medium` | 근거 정리와 단계별 구조화 출력 |

모델명은 제품 동작이 아니므로 eval과 비용 지표에 따라 logical alias mapping만 바꿀 수 있다. 상위 모델과 다른 provider는 자동 실패 fallback이 아니라 품질 실험 또는 운영자 재실행에 제한적으로 사용한다.

### 9.3 Public Evaluator

입력:

- 마지막 평가 이후 메시지 묶음과 필요한 과거 Raw Data reference
- current Living Wiki version/cursor와 room-pinned exact version을 `BookContextProvider`로 조회한 Book Context
- PUBLIC 메시지와 PUBLIC 사전 입력
- 시간, 고유 발언자 수, 현재 활성 참가자 수, 현재 단계

출력:

- 7개 metric을 독립 필드로 둔 평가
- 근거 message/source reference와 confidence
- 현재 의제·관점·열린 질문의 Wiki patch
- 사용자-facing 문장은 생성하지 않음

평가 trigger는 메시지 수 하나로 고정하지 않고 누적 메시지, 고유 발언자, 침묵, 시간 경계, 의제 장기화를 합친다. 정확한 threshold는 설정 테이블과 `EXPERIMENT` 기록으로 관리한다.

### 9.3.1 Private Evaluator

AI_PRIVATE는 Public Evaluator와 다른 전용 context builder, DB role, LLM task와 provider credential로만 처리한다. 이 호출은 PUBLIC-lane Wiki patch, Host 문장, 공식 결과 또는 공개 event를 생성할 수 없다.

출력은 자유 텍스트·요약·키워드·작성자 reference를 금지하고 다음처럼 일반적 개입 가능성만 표현하는 제한된 enum/boolean contract로 고정한다.

- `unspokenPerspectiveExists: boolean`
- `interventionOpportunity: NONE | INVITE_DIFFERENT_VIEW | INVITE_QUESTION`

이 신호도 `private` schema에 저장하며 Policy의 일반적인 개입 목표 외에는 전달하지 않는다. MVP 첫 출시에서는 Private Evaluator와 private-to-Policy 경로를 모두 off로 둔다. 조직·project의 데이터 보존 설정, provider allow-list, canary와 privacy eval을 통과한 뒤에만 별도 Decision 없이 설정으로 활성화할 수 있다.

### 9.4 Policy

Policy는 TypeScript의 결정 규칙으로 구현하고 LLM에 맡기지 않는다.

- 입력: 검증된 Evaluation, 단계, cooldown, 최근 action, host request 여부
- 출력: 하나의 action 또는 `WAIT`, reason codes, target reference
- privacy invariant, phase 제한, cooldown은 metric보다 먼저 적용
- 좋은 Activity/Depth/Expansion이면 낮은 Book Grounding만으로 개입하지 않음
- 같은 cycle에 복수 질문을 합성하지 않음

정책 로직은 pure function fixture로 전수 회귀 테스트한다.

S5-7 구현 기준:

- `DeterministicPolicyEngine`은 committed evaluation과 평가 당시 `public-context.v1`을 받는 pure TypeScript engine이다. Evaluator `suggestedAction`과 총점은 입력 권한으로 사용하지 않는다.
- 현재/직전 Wiki metric을 비교해 LOW 지속 여부를 판별하고 좋은 인간 흐름, 의미 있는 책 밖 확장, Participation Balance 단독 신호를 우선 `WAIT`로 보존한다.
- saturation escalation은 한 cycle에 하나씩 `EXPAND`, 이후에도 새 가치가 없으면 `SUMMARIZE`, 계속 포화되면 `TRANSITION`을 선택한다.
- 자동 개입 cooldown은 초기 90초 실험값이다. 최근 committed intervention 또는 최근 non-WAIT Policy action 뒤에는 `WAIT`하며 명시적 Host 도움과 연장 의견은 bypass한다.
- application은 job/context에서 trigger를 정규화한다. DB commit은 evaluation당 action 하나를 unique하게 보존하고 session row lock에서 phase version과 latest message cursor를 다시 확인해 stale non-WAIT action을 Host 경로에 남기지 않는다.
- pure Policy 오류는 참가자-facing 오류나 개입으로 바꾸지 않고 `WAIT`에 해당하는 safe suppression으로 처리한다.

### 9.5 Host와 freshness check

Host 입력에는 다음 allow-list만 제공한다.

- PUBLIC 메시지와 PUBLIC 사전 입력
- Published Book Context 일부
- 현재 PUBLIC 원본 기반 Wiki에서 Host 입력으로 허용된 section
- Policy가 선택한 한 가지 action과 공개 가능한 근거 reference
- 이름을 불필요하게 지목하지 않는 출력 규칙

Host 입력 DTO에는 AI_PRIVATE 원문·요약·topic·작성자 reference를 표현할 필드 자체를 두지 않는다. Host repository는 `private` schema client를 import할 수 없게 한다. private 신호를 활성화하더라도 Policy가 `INVITE_DIFFERENT_VIEW` 또는 `INVITE_QUESTION` 같은 일반적 action으로 변환한 뒤에만 Host에 전달하며, Host는 private signal 자체를 받지 않는다. MVP 첫 구현은 이 경로를 off로 둔다.

생성 후 commit 전에 다음을 다시 검사한다.

- session phase가 여전히 발언 가능한가
- latest message seq가 입력 cursor와 얼마나 달라졌는가
- 새 발언으로 Activity와 개입 필요가 회복됐는가
- 같은 action key가 이미 게시됐는가
- forbidden phrase와 private canary가 없는가

오래된 판단이면 결과를 `SUPPRESSED_STALE`로 남기고 게시하지 않는다.

### 9.6 Living Wiki와 공식 결과

- PUBLIC-lane Wiki는 `INCREMENTAL/TOPIC_CHECKPOINT/FINAL`, base version과 `basedThroughSeq`를 가진 versioned document다.
- Wiki는 임의 full overwrite가 아니라 stable item id와 allow-list operation을 가진 typed patch로 갱신한다.
- 관점·관계·Book Grounding·변화 주장은 가능한 한 message/PUBLIC prep/AI intervention/Pack item reference를 가진다.
- validator는 reference 존재성·session/Pack 소속·cursor 범위, relation target, schema와 private variant 부재를 검사한다.
- transaction의 current version이 patch의 base version과 다르면 오래된 결과를 덮어쓰지 않고 suppress/requeue한다.
- patch validation 실패 시 부분 적용하지 않고 이전 Wiki를 그대로 유지한다.
- 주제 전환 시 관련 Raw Data를 재검토한 Topic Checkpoint를 만들고, 세션 종료 시 checkpoint와 원본을 다시 확인해 session unique Final Wiki를 확정한다.
- Final Wiki는 다음 세션에 승계하지 않으며 공식 기록과 분리된 내부 확정본이다. 결과 retry는 같은 Final Wiki를 입력으로 사용한다.
- official record는 unique session key로 한 번만 `READY`가 될 수 있고 성공 후 update를 금지한다. 탈퇴 익명화와 운영 redaction만 별도 audited exception으로 적용한다.

document/patch schema, commit algorithm, degraded mode와 필수 eval은 `docs/AI_ENGINE_SPEC.md`를 따른다.

### 9.6.1 Raw Data retrieval

- 대상을 알면 ID/seq/participant/time/topic으로 직접 조회하고 reference 주변의 원본 message window를 함께 읽는다.
- 위치를 모르는 과거 논의는 session과 visibility metadata로 범위를 제한한 Search Chunk를 통해 찾은 뒤 원본 message로 materialize한다.
- 원본은 개별 message로 유지하며 Search Chunk는 재생성 가능한 파생 index다. PUBLIC과 AI_PRIVATE를 같은 chunk에 넣지 않는다.
- 첫 구현은 exact/metadata/context-window retrieval을 우선하고 고정 eval에서 recall이 부족할 때 `SessionRawDataRetriever` 뒤에 embedding semantic search를 활성화한다.
- BM25/Hybrid Search는 semantic retrieval의 실제 품질 문제가 확인되기 전에는 포함하지 않는다.

### 9.7 Book Context Builder

Admin은 제목·저자·ISBN으로 서버의 `BookCatalogSearchProvider`를 호출하고 Kakao 결과에서 판본을 선택한다. 서버는 정규화한 selection을 짧은 수명의 HMAC token으로 서명하며 create command는 이 token만 검증한다. `provider + externalBookId`와 ISBN-13 mapping은 private table에 보존해 같은 판본의 Pack 생성을 중복 처리한다.

Builder는 하나의 긴 작업이 아니라 다음 작은 durable stage로 나눈다.

1. 책 식별과 후보 자료 수집
2. 출처 메타데이터·본문 일부 추출
3. claim과 source 연결
4. Pack section 생성
5. 자동 validation 후 Draft 보존

Builder는 자동 Publish하지 않는다. Tier, evidence와 section coverage는 내부 검증에 유지하되 운영자 기본 UI는 7개 section을 연속 표시하고 기술 등급 대신 `수정 필요`, `확인 필요`, `근거 부족` 등으로 설명한다. 운영자는 내용을 수정·삭제한 뒤 Pack 단위로 전체 검수를 완료하고, 별도 command로 명시적으로 Publish한다. 재실행은 기존 운영자 수정을 덮어쓰지 않고 새 Draft revision을 만든다. Full-text book ingestion과 embedding index는 만들지 않는다.

Pack content model, Provider, evidence state, Publish Gate와 Slice 2A/7 경계는 `docs/BOOK_CONTEXT_SPEC.md`를 따른다.

## 10. 비동기 작업과 실패 복구

### 10.1 queue 사용 대상

- Opening, 평가/incremental Wiki/Topic Checkpoint, Host, Synthesis, 연장 의견
- 세션 종료 후 Final Wiki와 공식 record
- Book Context Builder 단계
- 계정 탈퇴 후 파생 private data 정리
- 90일 AI 진단 로그 만료와 비식별 집계

메시지 전송, 시작·연장·종료 상태 전환 자체는 queue에 맡기지 않고 동기 transaction으로 확정한다.

초기 queue topology:

| Queue | 작업 | 초기 concurrency |
| --- | --- | --- |
| `ai-session` | Opening, 평가/Wiki, Host, 연장 의견, Synthesis | 2 |
| `ai-record` | 종료 후 Final Wiki와 공식 record | 1 |
| `book-builder` | 단계별 Book Context Builder | 1 |

상태 변경 transaction은 공식 상태와 event를 기록하면서 `pgmq.send`를 함께 실행한다. Queue message에는 원문 대신 `job_id`, job type, aggregate id, input cursor와 expected version만 넣는다. pure DB 만료·집계는 짧은 Cron 함수로 처리하고 외부 호출이 필요한 작업만 queue에 넣는다.

worker는 browser에 노출되지 않은 worker 전용 권한으로 `read_with_poll`을 사용한다. 처리 시간보다 긴 visibility timeout을 설정하고 Builder처럼 긴 stage는 lease를 갱신한다. 성공하면 result를 먼저 idempotent하게 commit한 뒤 message를 archive하며, shutdown 때 새 read를 중단하고 현재 lease 안의 작업만 마무리한다.

### 10.2 job 상태와 재시도

`PENDING → RUNNING → SUCCEEDED | RETRY_WAIT | FAILED | SUPPRESSED`

- retry 가능한 timeout, rate limit, 5xx는 exponential backoff + jitter
- 외부 모델 호출은 중복될 수 있으므로 unique `job_key`와 조건부 commit으로 사용자-visible effect만 exactly-once로 만든다.
- schema·privacy validation 실패는 같은 출력의 무한 재시도 대신 새 시도 또는 fallback
- session 종료와 record 생성은 분리
- Opening 최종 실패: 기본 질문 확정
- Synthesis 최종 실패: 안내 이벤트 후 Closing 전환
- extension opinion 최종 실패: 의견 없음으로 결정 UI 유지
- incremental Wiki 최종 실패: 마지막 committed version 유지, 다음 trigger가 누락 cursor를 포함
- Final Wiki 실패: session 종료 유지, 같은 종료 cursor로 재시도
- record 최종 실패: 방장에게 최초 결과 재생성 한 번의 새 job 허용
- Builder 실패: 현재 Draft와 운영자 수정 유지

초기 자동 재시도는 최대 3회, 5초/30초/2분을 권장한다. 긴 Builder stage는 별도 timeout과 재시도 설정을 사용한다.

## 11. 보안과 개인정보 경계

### 11.1 RLS 기본 원칙

- exposed schema의 모든 사용자 데이터 테이블에 RLS를 켠다.
- AI_PRIVATE 원문과 private-derived state는 Data API에 노출하지 않는 별도 `private` schema에 저장한다.
- 방 검색 결과는 공개 가능한 room summary만 반환하고 password hash, private prep, 내부 state를 제외한다.
- 진행 중인 방은 유효한 참가 등록자에게 필요한 대기실·실시간 데이터를 허용한다.
- 공식 종료 후 전체 채팅, PUBLIC 사전 입력과 결과는 방장과 `PARTICIPATED` 회원만 읽을 수 있고 등록만 한 `NO_SHOW` 회원은 읽을 수 없다.
- AI_PRIVATE 작성·수정·삭제와 본인 재열람은 작성자 본인을 검증하는 전용 command/query로만 수행한다. 다른 사람의 원문 select는 Evaluator 전용 worker function 외에는 허용하지 않는다.
- admin도 일반 UI와 query에서 다른 사람의 AI_PRIVATE를 읽지 못한다.
- Closing 중 reflection은 작성자 본인에게만 보이고, 공식 종료 후에는 제출된 항목만 열람권이 있는 실제 참여자에게 공개한다.
- security-definer function은 고정 `search_path`, 최소 grant, 내부 재권한 검사를 갖는다.

### 11.2 로그와 오류

- request body, 메시지 본문, prep 원문, reflection을 기본 HTTP·오류 로그에서 redact한다.
- 로그에는 user/session의 직접 식별자 대신 회전 가능한 pseudonymous id를 사용한다.
- AI 작업 로그는 job id, prompt/schema version, token/latency, 상태, reason code를 남기고 원문 prompt/response는 남기지 않는다.
- 사용자 오류는 안정된 code와 일반 설명만 제공하고 stack trace, SQL, 모델명, 내부 metric은 숨긴다.
- NestJS JSON `SafeLogger`는 allow-list field만 stdout으로 내보내고 `AsyncLocalStorage`로 request/command/job correlation을 전달한다.
- Sentry는 frontend/backend exception만 수집한다. Session Replay, PII와 console/network body collection을 끄고 `beforeSend` scrub, normalized route와 비공개 source map을 적용한다.
- Lightsail container log의 짧은 보존 기간은 최근 진단용이며 audit, analytics 또는 제품 event 원본으로 간주하지 않는다.

### 11.3 보관과 삭제

- AI 진단 원시 로그에는 `expires_at = session_ended_at + 90 days`를 기록하고 일일 만료 job으로 삭제한다.
- 비식별 집계는 개인·메시지로 역추적할 수 없는 최소 단위만 남긴다.
- production 논리 backup은 30일 보관하고 탈퇴·삭제 정보는 37일 restore tombstone으로 분리해 복원 시 서비스 재개 전 재적용한다. backup 잔존 기간은 공개 전 privacy/legal review에 포함한다.
- secret은 local gitignored environment, GitHub Environment와 Lightsail deployment environment에 환경별로 분리한다. Supabase secret API key와 OpenAI key는 Amplify frontend 환경에 넣지 않는다.

## 12. API·이벤트 contract

### 12.1 snapshot

토론방 진입과 재연결 응답은 최소 다음을 한 번에 반환한다.

- room summary와 pinned book context identity
- current user의 membership·role·actual participation
- session phase/version와 authoritative deadlines/server time
- participant summary와 현재 연결 상태
- last message cursor와 현재 페이지
- 현재 공개 의제, extension decision, result state

### 12.2 realtime event envelope

```ts
type SessionEvent<T> = {
  eventId: string;
  sessionId: string;
  aggregateVersion: number;
  occurredAt: string;
  type: string;
  payload: T;
};
```

client는 모르는 event type을 무시하되 aggregate version gap을 발견하면 snapshot을 다시 가져온다. event payload에는 화면에 필요한 공개 정보만 넣고 DB row 전체를 broadcast하지 않는다.

모든 event variant는 discriminator와 schema version을 가진 Zod discriminated union으로 검증한다. public event union은 private/internal event를 import하거나 표현할 수 없다.

### 12.3 schema 관리

- TypeScript와 AI output에는 runtime schema validation을 사용한다.
- canonical runtime schema는 Zod 4로 통일하고 TypeScript type은 schema에서 파생한다.
- DB enum과 API 공개 enum의 변환 계층을 둔다.
- destructive schema change는 expand → migrate → contract 순서로 배포한다.
- Supabase CLI migration과 generated DB types를 CI에서 최신 상태로 검증한다.

## 13. 관측성과 제품 학습

### 13.1 event chain

분석 가능한 최소 연결:

```text
evaluation_id
  → policy_action_id
  → intervention_message_id 또는 WAIT/suppression
  → subsequent message seq window
  → session-level observable outcome
```

인앱 설문은 만들지 않는다. Outcome은 대화에서 관찰 가능한 변화와 운영 지표로만 탐색하며 개인의 내적 변화를 사실로 단정하지 않는다.

### 13.2 초기 운영 지표

- auth/room/session command 성공률과 conflict율
- realtime reconnect 횟수, cursor gap, 복구 시간
- message confirm latency p50/p95, duplicate suppression 수
- timer transition delay p95
- AI job latency, retry/failure/suppression, action별 WAIT 비율
- Host 개입 이후 발언자 수·관점 reference 변화 같은 진단값
- record 생성 성공 시간과 manual retry 수
- AI_PRIVATE leak guard 차단 건수는 내용 없이 severity만 기록

기술 오류 추적 서비스를 붙이더라도 대화 본문을 수집하지 않도록 before-send scrub과 sampling을 먼저 구성한다.

### 13.3 Product analytics

authoritative domain action과 AI 효과 분석은 first-party Postgres fact/event를 원본으로 사용한다. server transaction이 확정한 event를 event/command id로 deduplicate하고 다음 관계를 보존한다.

```text
사용자·세션의 coarse context
  → 확정된 domain action
  → evaluation / policy / intervention
  → 이후 공개 대화의 observable change
  → 공식 종료와 record view
```

GA4는 landing, signup/login, room search 사용 여부, room create/join, session start/complete와 record view의 coarse funnel만 수집한다. `GaAnalyticsAdapter`와 `FirstPartyAnalyticsAdapter`는 provider-neutral `Analytics` port 뒤에 분리하고 모든 event/property는 Zod allow-list를 통과한다.

GA에는 User-ID, 이메일·프로필, 내부 UUID, 방·책 제목, 검색어, 메시지·prep·reflection, AI metric/context와 AI_PRIVATE 관련 값을 보내지 않는다. Google Signals, 광고 개인화, user-provided data와 불필요한 Enhanced Measurement를 끄며 route는 식별자가 없는 template으로 정규화한다. 적용 가능한 privacy 고지·동의와 국외 이전 검토 전에는 production tag를 로드하지 않는다.

### 13.4 Performance budget

- field p75의 LCP/INP/CLS는 각각 2.5초/200ms/0.1을 목표로 하고 mobile·desktop을 분리한다.
- room snapshot p95 2초, read/command 서버 p95 400/500ms, message ack/peer display p95 500ms/1초, reconnect sync p95 3초를 초기 budget으로 한다.
- Opening/Host p95 12초, 공식 결과 p95 60초를 운영 목표로 하되 AI는 인간 대화와 종료를 차단하지 않는다.
- 초기 snapshot은 최근 message 100개, 과거/record는 cursor 50개로 제공하고 초기 user-route JS는 gzip 약 350KB를 budget으로 시작한다.
- telemetry는 route template·duration·status·release/environment와 coarse capacity만 기록하고 content·AI_PRIVATE·식별자를 포함하지 않는다.

## 14. 테스트 전략

### 14.1 필수 계층

| 계층 | 도구 | 핵심 대상 |
| --- | --- | --- |
| Domain unit | Vitest | 상태 전환, Policy, 시간 경계, idempotency |
| Component | Vitest + Testing Library | 권한별 control, 접근성, reconnect/실패 UI |
| Database | pgTAP | RLS, constraints, command functions, 익명화 |
| Integration | local Supabase + worker fixtures | queue, Broadcast payload, AI structured contract |
| E2E | Playwright multi-context | 방장/참가자 동시 흐름과 재접속 |
| AI eval | versioned fixtures | 개입 필요성, WAIT, privacy, 결과 충실성 |

component·E2E에 ESLint a11y 규칙, semantic query와 `axe-core`를 적용한다. release 전 Chromium·Firefox·WebKit, 360px mobile/device profile, keyboard-only와 macOS/iOS VoiceOver 핵심 flow를 수동 검증한다. 자동 a11y 검사는 focus 순서·live region·실제 읽기 경험을 대체하지 않는다.

### 14.2 출시 차단 회귀 시나리오

1. 이메일 중복, 프로필 이름 필수, 인증 없는 가입, password reset
2. 방 비밀번호 오류, 2명 미만 시작 거절, 15명 초과 등록 거절
3. 방장 포함 인원 계산과 두 탭 deduplication
4. 동일 `client_message_id` 재시도 시 한 메시지만 생성
5. reply 대상·길이·종료 후 전송 제약
6. 7분 안내와 5분 Synthesis 경계에서 연장/자동 전환 경쟁
7. 반복 연장과 방장 강제 종료의 불변성
8. Closing 중 reflection 숨김, 수정/삭제, 전원 응답 조기 종료, 5분 자동 종료
9. 재접속 cursor 복구와 오래된 화면 상태 폐기
10. 좋은 흐름에서 `WAIT`, 낮은 Book Grounding 단독 강제 복귀 금지
11. `AI_PRIVATE` canary가 Host prompt/output/event/log에 나타나지 않음
12. AI 실패 시 인간 채팅과 종료가 계속되고 fallback이 한 번만 적용
13. 공식 결과 성공 후 재생성·수정 거절
14. 탈퇴 시 private 삭제와 공동 기여 익명화
15. Published Pack 불변성과 방의 exact version pin
16. 위조·만료 JWT, strict CORS/CSP, XSS plaintext rendering과 token/log 유출 방지
17. Argon2id 방 password와 다중 instance·restart에서도 유지되는 시도 제한
18. Living Wiki reference 정합성, stale base patch 거절과 마지막 version 보존
19. Topic Checkpoint가 이전 관점을 소실하지 않고 Final Wiki가 Raw Data 재검증 후 한 번만 확정됨
20. Pack 7개 section/item/source/evidence 계약, 부족·충돌 보존과 Retired exact-version Provider 조회

### 14.3 AI eval 원칙

- fixture는 공개 메시지와 AI_PRIVATE에 서로 다른 synthetic canary를 심는다.
- 개입 결과뿐 아니라 `WAIT` 선택의 적절성을 같은 비중으로 평가한다.
- 단일 개입 목표, Book Grounding 오용 금지, 근거 충실성, 내적 변화 단정 금지와 공식 결과 충실성을 평가한다.
- 자동 metric은 형식·금지 규칙·reference 충실성을 보고, 진행 품질은 소규모 human review rubric으로 보완한다.
- Wiki eval은 충돌 관점 보존, 공개 발언 변화와 내적 변화 구분, 중복 perspective 억제, 잘못된 reference 생성 여부를 포함한다.
- Raw Data retrieval eval은 오래된 근거를 찾아야 하는 사례와 찾지 말아야 하는 사례를 함께 두고 exact/metadata 방식이 부족할 때만 semantic adapter를 활성화한다.
- Book Context eval은 FACT/INTERPRETATION 구분, source 없는 단정 금지, 정보 부족·conflict 유지와 단일 정답 평탄화 금지를 확인한다.
- 일반 PR은 fake AI adapter contract test만 실행한다. prompt, model, schema, context builder 또는 Policy 변경과 staging/release 후보는 작은 고정 eval set의 live-model 회귀를 통과해야 한다.
- AI_PRIVATE 누출, 무권한 기록 접근, 공식 결과 불변성 위반, command 중복 확정, 탈퇴 후 private 잔존은 허용 임계값 없이 출시를 차단한다.
- 전역 coverage 숫자보다 상태 전환·권한·privacy·Policy 불변조건의 branch와 명시적 회귀 시나리오를 관리한다.

## 15. 환경과 배포

환경별 실제 도메인, 클라우드 자원 이름과 secret 소유 위치는 `docs/runbooks/ENVIRONMENT_INVENTORY.md`를 배포 인벤토리로 사용한다.

### 15.1 환경

- local: Supabase CLI, local Postgres/Auth/Realtime, AI fake 기본
- staging: Supabase Free active project 하나, test SMTP/domain, 제한된 실제 AI key; 미사용 pause를 허용하고 배포 전 resume/preflight
- production: 별도 Supabase Free active project 하나, Amplify, Lightsail 서울, OpenAI, Resend SMTP secret과 데이터; pause·quota·독립 backup 감시

staging과 production 데이터는 공유하지 않는다. 운영자가 production 데이터를 로컬로 내려받는 기본 절차를 만들지 않는다.

Sentry와 GA도 environment를 분리한다. staging event가 production property에 들어가지 않으며 GA production adapter는 privacy 설정과 고지/동의 출시 gate를 통과하기 전에는 no-op이다.

### 15.2 CI gate

빠른 일반 PR gate는 약 10분 이내를 목표로 한다.

1. formatting/lint/typecheck
2. domain/Policy unit, component와 fake AI contract tests
3. production build
4. local Supabase migration reset과 generated DB type drift 검사
5. pgTAP RLS/constraint/command function tests
6. 핵심 Playwright multi-context smoke

live-model eval은 일반 코드 PR에서 실행하지 않고 prompt, model, schema, context builder 또는 Policy 변경과 staging/release 후보에서만 별도 gate로 실행한다.

`main`은 production 기준선으로 보호하고 `staging`은 staging 통합·배포 branch로 사용한다. 짧은 feature branch는 PR CI를 거쳐 대상 branch에 merge한다. GitHub Actions가 web static artifact와 server image를 한 번 build해 Git SHA·checksum으로 고정하고, environment별 concurrency lock으로 동시 배포를 막는다. AWS 접속은 branch·environment로 제한된 GitHub OIDC IAM role을 사용한다.

### 15.3 배포와 rollback

- `staging` branch push는 staging을 자동 배포한다. `main` push는 staging 배포를 시작하지 않으며, production은 staging에서 검증된 exact Git SHA를 `main` 기준선에 반영한 뒤 protected GitHub Environment의 수동 승인으로 동일 artifact를 승격한다.
- 환경별 Lightsail Container Service 하나에 동일 image·Git SHA의 public API와 non-public worker container를 다른 command로 함께 배포한다.
- 배포 순서는 `backward-compatible DB expand → API/worker → web → smoke`다. backfill과 destructive contract migration은 별도 release로 나눈다.
- smoke는 API readiness, migration head, worker heartbeat·queue, 로그인·기본 조회와 synthetic command를 검증한다.
- web은 직전 Amplify version, API·worker는 직전 Lightsail deployment version, AI는 직전 prompt/model alias로 되돌린다.
- production DB에 automatic down migration을 사용하지 않고 application rollback 후 새 forward-fix migration을 적용한다.
- 기능 flag는 AI 자동 개입과 Builder처럼 독립적으로 꺼도 인간 토론이 가능한 기능에만 사용한다.
- 잘못된 AI prompt는 alias를 이전 version으로 되돌리고, 이미 확정된 메시지·결과는 수정하지 않는다.
- release manifest에 Git SHA, artifact checksum, image/deployment version, migration head, contract version, AI alias와 배포 정보를 남긴다.

MVP에는 Kubernetes, ECS, ArgoCD, Terraform/CDK와 PR별 Supabase preview project를 사용하지 않는다. Dockerfile, Amplify/header 설정, deploy/rollback script와 환경 생성 runbook은 repository에서 version control한다.

### 15.4 Backup·restore와 Free quota

- production data 생성 시점부터 Supabase CLI `roles/schema/data` 논리 backup을 하루 한 번, production migration 직전에 추가로 생성한다.
- GitHub OIDC 최소 권한 role로 S3 서울 private bucket에 암호화 전송하고 30일 lifecycle로 삭제한다. dump를 repository, Actions artifact, log 또는 개인 PC에 보관하지 않는다.
- 내부 목표는 RPO 24시간, RTO 8시간이며 외부 SLA가 아니다.
- 탈퇴 restore tombstone은 backup과 분리해 37일 보관하고 restore 후 서비스를 열기 전 계정·AI_PRIVATE 삭제와 공동 기여 익명화를 재적용한다.
- restore는 maintenance/read-only와 worker/Cron 중지 후 수행하고 migration, Auth/RLS/Realtime, queue/job idempotency, worker heartbeat·smoke를 검증한 후 서비스를 재개한다.
- 공개 전 1회와 이후 분기별 restore drill을 외부 AI·SMTP·Sentry·GA가 차단된 임시 cloud 환경에서 실시한다.
- backup age·size, Supabase 540 pause, DB 350MB warning·400MB upgrade 준비와 주요 Free quota 80%를 감시한다.
- Supabase Storage object를 MVP authoritative store로 사용하지 않고, 파일 저장이 확정되면 별도 object backup을 먼저 추가한다.

### 15.5 Secret·admin access·rotation

- GitHub Actions AWS 권한은 OIDC, migration·backup은 environment-scoped secret, runtime은 Lightsail deployment environment에 분리한다. container에 long-lived AWS credential을 넣어 Secrets Manager를 호출하지 않는다.
- GitHub private repository plan이 protected Environment approval을 제공하지 않으면 production은 `workflow_dispatch`, branch 제한과 명시적 확인 값을 사용한다.
- provider 관리 계정은 MFA, 개인 account·최소 권한을 사용하고 recovery code를 작업 문서와 분리한다.
- secret inventory·rotation·incident runbook을 version control하되 실제 값은 포함하지 않는다.

### 15.6 Capacity·load test·scale trigger

- 폐쇄 MVP의 정상 목표는 60 concurrent Realtime client, release 검증은 100 client다. 120 connection/limit 60%에서 warning, 160 connection/주요 quota 80% 전에 Pro를 준비한다.
- Realtime connection을 tab 단위로 공유하고 channel/Presence cleanup, typing throttle·background 중지로 fan-out을 제어한다.
- PR은 10명 concurrency smoke, release candidate는 60명·30분 normal, 100명·10분 stress, 단일 방 15명 burst를 synthetic data·fake AI로 검증한다.
- HTTP는 k6, Realtime은 k6 WebSocket 또는 `supabase-js` harness를 사용하고 threshold·cleanup·report를 version control한다.
- 3회 중 2회 이상 p95 실패, CPU/memory 15분 70%, 지속 backlog, DB 400MB/quota 80%, Realtime 429/limit error를 최적화·scale/upgrade 조사 trigger로 삼는다.

## 16. 구현 순서 — vertical slices

각 slice는 화면만 만드는 것이 아니라 DB·권한·실패·테스트까지 사용 가능한 얇은 흐름으로 완성한다.

### Slice 0 — 서비스 기반 전환

- root package를 pnpm workspace와 TypeScript project reference graph로 전환
- 기존 Vite showcase를 `apps/web` 제품 SPA로 정리하고 token/component를 `packages/design-system` 경계로 이동
- `apps/server`에 NestJS + FastifyAdapter API entry point와 Nest application-context worker entry point를 만들고 공유 contract package 구성
- feature-local provider, strict validation, response schema, redacted structured logging, health/readiness와 graceful shutdown baseline 구성
- Amplify·Lightsail용 독립 build artifact, lint/test/CI와 local Supabase bootstrap
- GitHub Actions staging 자동·production 수동 승격, OIDC, release manifest와 deploy/rollback runbook
- production 일일·migration 직전 논리 backup, S3 lifecycle, restore tombstone·drill과 Free quota alarm
- strict CSP/CORS/security header, Supabase JWKS verifier와 secret·token 유출 방지 baseline
- publishable/secret API key 분리, environment schema, secret/artifact scan과 rotation·incident runbook
- Baseline browser capability gate, 360px responsive shell, semantic/focus/live-region accessibility helper와 axe/browser matrix
- 환경 변수 validation과 기본 route shell
- JSON safe logger, request/job correlation, Sentry scrub, health/readiness, worker heartbeat와 analytics no-op/first-party adapter baseline
- showcase의 데모 전용 알림 control과 제품 범위 밖 action을 제거하고, timer를 7분 연장 판단·5분 Synthesis·별도 Closing countdown 의미에 맞게 교체

완료 기준: web/server 독립 production build, local DB reset, design-system smoke가 통과한다.

### Slice 1 — 계정과 프로필

- 가입, 로그인, 로그아웃, 비밀번호 재설정
- 가입·로그인·reset Turnstile managed challenge와 Auth rate limit
- 필수 프로필 이름과 수정
- route protection과 Auth/RLS 기본 테스트

완료 기준: 이메일 인증 없이 새 사용자가 가입하고 재로그인하며 reset 메일 흐름을 완료한다.

### Slice 2 — 방 검색과 참가 등록

- Book Context Pack 7개 section/item/source/evidence foundation과 `BookContextProvider`
- 실제 구조를 가진 최소 Published fixture, Published 불변성과 기존 방의 Retired exact-version 조회
- Published Pack을 사용하는 방 생성
- 검색, password 참가, 인원 제한, 내 토론
- Argon2id hash, password version과 Postgres 기반 actor-scoped 시도 제한
- 방장 이전·등록 취소·방 취소의 시작 전 흐름

완료 기준: 두 계정으로 방을 찾고 참가 등록하며 권한·인원 경쟁 테스트가 통과하고, AI consumer가 `short_description`이 아니라 exact version의 구조화 Pack을 Provider로 읽을 수 있다.

### Slice 3 — 인간 중심 실시간 토론

- start transaction과 heartbeat 기반 최소 인원
- message append, inline reply, private Broadcast, Presence/typing
- reconnect snapshot/cursor와 failed-message retry
- 최근 100개 snapshot·cursor pagination과 safe latency/reconnect instrumentation

완료 기준: 두 브라우저 context가 메시지를 중복 없이 주고받고 네트워크 복구 후 같은 상태가 되며 release 부하 test가 성능 예산을 통과한다.

### Slice 4 — 시간과 운영 상태 머신

- 30분 timer, 7분 안내, 5분 Synthesis, 반복 15분 연장
- 방장 강제 종료, 신규 참가, 권한 이전·내보내기
- Cron reconciler와 모든 경계 경쟁 테스트

완료 기준: client가 없어도 서버 시간이 상태를 정확히 전환하며 중복 command가 한 번만 적용된다.

### Slice 5 — 최소 개입 AI

- Opening, Evaluator, evidence-linked versioned Wiki, deterministic Policy, Host
- typed patch, `basedThroughSeq`, stale-base suppression, Topic Checkpoint와 Raw Data retrieval
- WAIT/cooldown/freshness, host help, fallback
- AI_PRIVATE 격리와 canary eval

완료 기준: AI 장애에도 대화가 계속되고 private leak test·핵심 Policy 회귀·Wiki reference/concurrency/checkpoint eval이 통과한다.

### Slice 6 — Synthesis, Closing, 공식 기록

- Closing 5분, reflection/skip, 자동 종료
- Raw Data 재검증 기반 session-unique Final Wiki
- Final Wiki와 분리된 immutable discussion record와 결과 열람
- 결과 job retry와 방장 수동 재시도

완료 기준: 종료 후 실제 참여자만 안정된 기록을 다시 열람하고 성공한 결과는 변하지 않는다.

### Slice 7 — Book Context 운영

- 관리자 Builder durable stage, 7개 section/item/source/evidence 검수 UI
- 정보 부족·출처 충돌·Coverage와 hard blocker Publish Gate
- Draft/Review/Publish/Retire, 재생성 diff와 감사 로그
- version pin과 실패 후 Draft 보존

완료 기준: 운영자가 근거를 검토해 Pack을 게시하고 기존 방은 이전 exact version을 유지한다.

### Slice 8 — 탈퇴·보관·운영 강화

- 계정 탈퇴와 공동 기여 익명화
- 90일 진단 로그 만료
- production SMTP, 오류 추적 scrub, 운영 runbook, 최종 E2E

완료 기준: 삭제·익명화·보관 정책이 자동 테스트와 운영 절차로 검증된다.

## 17. 기술 결정 상태

### 확정

1. React + Vite frontend를 Amplify Hosting에, 별도 Node API·AI worker를 Lightsail Container 서울에 배포한다.
2. 기술 기획·구현·폐쇄 MVP에서 Supabase Free 서울의 active project 두 개를 staging/production Postgres·Auth·Realtime·Queue·Cron으로 사용하고, 자체 backup·pause·quota 감시와 명시적 upgrade trigger를 둔다.
3. backend는 NestJS + FastifyAdapter API와 별도 Nest application-context worker entry point로 구성하고, 선택적으로 계층화한 기능 중심 모듈 구조를 사용한다.
4. 인증·읽기·Realtime은 Supabase에 직접 연결하고, 모든 중요한 domain mutation은 NestJS Command API를 거쳐 versioned Postgres transaction에서 최종 확정한다.
5. realtime provider는 Supabase Realtime을 사용하고, DB-only 공식 Broadcast topic·client-writable ephemeral topic·DB heartbeat/snapshot의 역할을 분리한다.
6. Supabase Queues·Cron과 별도 Lightsail Nest worker로 durable job을 실행하고, 상태 변경과 enqueue를 같은 transaction으로 확정한다.
7. 초기 LLM은 OpenAI Responses API의 stateless Structured Outputs로 호출하되 provider-neutral `AiGateway`와 task contract로 격리하고, provider/model 변경은 eval·privacy gate를 거친다.
8. AI_PRIVATE는 별도 schema·권한·context builder·LLM task로 격리하고, private 입력을 읽는 호출은 PUBLIC-lane Wiki나 사용자-facing 출력을 만들 수 없게 한다. 외부 private LLM 처리는 보존 조건과 privacy gate를 통과하기 전까지 비활성화한다.
9. Vitest·Testing Library·pgTAP·Playwright를 위험 계층별로 사용하고, 일반 PR에는 fake AI contract test를, AI 관련 변경과 출시에만 고정 fixture의 live-model eval을 적용한다. privacy·권한·공식 결과 불변성 위반은 무조건 출시를 차단한다.
10. Supabase CLI SQL migration을 schema의 유일한 원본으로 두고, browser와 사용자 command는 typed `supabase-js`/RPC, 내부 worker·관리자는 최소 권한 Kysely/`pg` repository로 분리한다.
11. React Router Data Mode, TanStack Query와 session-scoped Zustand로 URL·서버 확정 상태·ephemeral Realtime 상태를 분리하고, Realtime gap은 DB snapshot으로 복구한다.
12. Zod 4 schema를 HTTP·Realtime·job·form·AI runtime contract의 단일 원본으로 사용하고 TypeScript/OpenAPI/provider JSON Schema를 파생한다.
13. pnpm workspace와 TypeScript project references만으로 web/server/shared package build graph를 관리하고, Turborepo/Nx는 실제 규모와 CI 필요가 생길 때까지 도입하지 않는다.
14. Nest JSON safe logger, 제한된 Sentry와 Postgres fact로 관측성을 구성하고, 사용자 행동은 first-party authoritative event와 privacy-gated GA4 coarse funnel으로 분리한다.
15. password reset은 Supabase Auth PKCE와 Resend custom SMTP로 전달하며, 인증 전용 domain·tracking 비활성화·generic response와 환경 분리를 적용한다.
16. Supabase SPA session을 유지하되 strict CSP/CORS, JWKS JWT 검증, plaintext rendering으로 token 경계를 보호하고, Argon2id·Turnstile·Postgres rate limit으로 인증·방 password abuse를 방어한다.
17. GitHub Actions가 단일 배포 orchestrator로서 staging에서 검증한 동일 artifact를 production에 수동 승격하고, expand-first DB 배포와 버전별 application rollback을 사용한다.
18. Supabase Free production DB를 일일·migration 직전 논리 dump로 S3에 30일 보관하고, 37일 삭제 tombstone·restore drill·pause/quota 감시로 RPO 24시간·RTO 8시간을 목표로 한다.
19. Supabase의 publishable/secret API key와 asymmetric signing key를 사용하고, GitHub OIDC·environment/Lightsail runtime secret 분리·artifact scan·MFA·staged rotation으로 key lifecycle을 관리한다.
20. Core Web Vitals·API·Realtime·AI의 p75/p95 budget을 분리하고, 60명 정상·100명 release 부하 test, cursor pagination·connection fan-out 제어와 Free quota upgrade trigger를 사용한다.
21. Vite Baseline의 주요 evergreen browser·iOS/Android와 360px responsive web을 지원하고, WCAG 2.2 AA를 구현 목표로 keyboard·focus·contrast·절제된 Realtime announcement을 자동·수동 검증한다.
22. Living Wiki는 evidence reference, typed patch, optimistic base version과 `basedThroughSeq`를 가진 session-scoped versioned document로 저장하고 Topic Checkpoint·Final Wiki에서 Raw Data를 재검증한다.
23. Book Context Pack은 normalized 7개 section/item/source/evidence 구조와 `BookContextProvider`로 구현하며 content foundation은 AI보다 먼저, Builder 운영 workflow는 Slice 7에서 완성한다.

### 검토 완료

핵심 기술 기준선과 Slice 0~8의 MVP 서버 범위가 구현되었다. Book Context foundation, 방·사전 입력, session connection/message/event, private Realtime과 server-authoritative lifecycle 위에 PUBLIC Context, Evaluator, evidence-linked Living Wiki, deterministic Policy, Opening/Host와 durable Queue를 연결했다. Synthesis·5분 Closing·개인 reflection·Final Wiki·불변 Discussion Record를 종료 lifecycle에 연결했고, Book Context 7단계 Builder와 Draft/Review/Publish Gate를 완성했다. 계정 탈퇴는 AI_PRIVATE 삭제, 공동 기여 익명화, Auth hard-delete recovery와 restore tombstone을 보장한다. 같은 image에서 API와 worker를 독립 실행하고 readiness·heartbeat, backup/restore, deploy/rollback runbook을 갖춘다. 2026-09-02 완료 기준 code test 259개와 local DB pgTAP 695개 assertion, 실제 model eval 세 종류, Node 24.18 Docker API/worker smoke가 통과했다.

## 18. 재검토 조건

- 동시 접속 또는 message throughput이 Supabase Realtime 한계에 반복적으로 근접할 때
- 10초 Cron 전환 지연이 사용자 경험에 유의미한 문제를 만들 때
- Queue backlog나 Lightsail worker 자원 한계로 AI/Builder job이 반복 지연·실패할 때
- RLS와 server command 이중 경계가 개발 속도를 과도하게 낮추면서 보안 이득을 주지 못할 때
- AI 비용이 목표 운영비를 넘거나 소형 모델의 평가 품질이 eval 기준을 통과하지 못할 때
- private sanitizer 경로를 켜야만 제품 가치가 나온다는 근거가 생길 때
- 법적 검토가 현재 보관·삭제·SMTP·데이터 처리 구조의 변경을 요구할 때

## 19. 공식 기술 참고 자료

제안 시점의 동작과 제약은 다음 공식 문서를 기준으로 확인했다. 구현 시점에는 각 서비스의 변경 사항을 다시 확인한다.

- Frontend hosting: [AWS Amplify Hosting](https://aws.amazon.com/amplify/hosting/), [AWS Amplify pricing](https://aws.amazon.com/amplify/pricing/)
- Backend hosting: [AWS Lightsail pricing](https://aws.amazon.com/lightsail/pricing/), [Lightsail container FAQ](https://aws.amazon.com/lightsail/faq/), [Lightsail container metrics](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-viewing-container-services-metrics.html)
- Supabase platform: [Free billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Backups](https://supabase.com/docs/guides/platform/backups), [CLI backup workflow](https://supabase.com/docs/guides/deployment/ci/backups)
- Supabase security: [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [JWT signing keys](https://supabase.com/docs/guides/auth/signing-keys), [Auth](https://supabase.com/docs/guides/auth), [Password auth](https://supabase.com/docs/guides/auth/passwords), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Supabase Realtime: [Authorization](https://supabase.com/docs/guides/realtime/authorization), [Presence](https://supabase.com/docs/guides/realtime/presence), [Database-triggered Broadcast](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)
- Supabase jobs: [Queues](https://supabase.com/docs/guides/queues), [Edge Function consumer](https://supabase.com/docs/guides/queues/consuming-messages-with-edge-functions), [Cron](https://supabase.com/docs/guides/cron), [Edge Functions](https://supabase.com/docs/guides/functions)
- OpenAI: [Responses API migration](https://developers.openai.com/api/docs/guides/migrate-to-responses), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Models](https://developers.openai.com/api/docs/models)
- Browser and accessibility: [Vite build browser compatibility](https://vite.dev/guide/build.html#browser-compatibility), [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Web Vitals](https://web.dev/articles/vitals)
- Testing and delivery: [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/languages), [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview), [k6 WebSockets](https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/), [GitHub deployment environments](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments)
