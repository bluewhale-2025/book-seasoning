# 책은양념 MVP 프론트엔드 구현 계획

> Status: Accepted implementation plan  
> Product source of truth: `PRODUCT_SPEC.md`  
> Shared technical baseline: `docs/TECHNICAL_PLAN.md`  
> Server counterpart: `docs/BACKEND_PLAN.md`  
> AI engine detail: `docs/AI_ENGINE_SPEC.md`  
> Book Context detail: `docs/BOOK_CONTEXT_SPEC.md`  
> Design baseline: `docs/DESIGN_SYSTEM.md`  
> Server handoff: `docs/FRONTEND_INTEGRATION_GUIDE.md`  
> API reference: `docs/API_REFERENCE.md`  
> Realtime protocol: `docs/REALTIME_INTEGRATION.md`  
> Local integration: `docs/FRONTEND_LOCAL_SETUP.md`  
> Last updated: 2026-09-02

## 0. 문서 목적과 우선순위

이 문서는 `apps/web`과 `packages/design-system`을 별도 프론트엔드 작업으로 구현하기 위한 실행 계획이다. 제품 행동, 공통 contract, 상태 머신과 보안 불변조건을 다시 정의하지 않고 공통 기술 기준을 프론트엔드에서 어떻게 실현할지만 다룬다.

실제 서버 연결을 시작할 때는 이 계획과 `docs/FRONTEND_INTEGRATION_GUIDE.md`를 함께 읽는다. Endpoint·오류는 `docs/API_REFERENCE.md`, session 동기화는 `docs/REALTIME_INTEGRATION.md`, 실행 환경은 `docs/FRONTEND_LOCAL_SETUP.md`를 사용하며 요청·응답 필드의 최종 기준은 `packages/contracts`다.

문서가 충돌할 때는 다음 순서를 따른다.

1. `PRODUCT_SPEC.md`
2. 승인된 Product/Technical Decision이 있는 `docs/DECISIONS.md`
3. `docs/TECHNICAL_PLAN.md`
4. 이 문서
5. `docs/DESIGN_SYSTEM.md`

프론트 작업 중 사용자 경험을 바꿔야 하면 이 문서에서 임의로 확정하지 않는다. Product Decision이 필요한지 먼저 판단한다. API, event, 상태 전이 또는 권한 contract 변경은 `packages/contracts`와 공통 기술 계획을 먼저 갱신한 뒤 적용한다.

## 1. 프론트엔드 책임과 비책임

### 1.1 책임

- React + Vite SPA의 route, 화면, form과 사용자 상호작용
- Supabase Auth session과 PKCE reset UX
- RLS로 허용된 query, Nest Command API와 Realtime adapter 소비
- authoritative snapshot/event를 화면 상태로 투영하고 reconnect gap을 복구
- pending/confirmed/failed message와 command 결과의 명확한 표현
- 디자인 시스템, responsive web, keyboard와 screen reader 접근성
- first-party analytics 호출과 privacy gate를 통과한 제한적 GA4 adapter
- frontend exception scrub, Web Vitals와 안전한 성능 측정
- Amplify용 정적 artifact, CSP/header와 frontend smoke test

### 1.2 책임이 아닌 것

- 참가·정원·권한·타이머·종료를 클라이언트만으로 확정
- DB row, RLS, transaction function과 queue schema 정의
- AI prompt, Policy, Living Wiki 또는 결과 생성
- Living Wiki 전체 document, evidence reference, evaluation과 Participant State 내부 관찰을 client query/cache에 적재
- 방 password 검증·hash·rate limit
- `AI_PRIVATE` 원문을 session UI나 일반 client cache에 적재
- Realtime event를 DB snapshot보다 우선하는 최종 원본으로 취급
- 브라우저에 secret API key, DB credential, OpenAI 또는 SMTP key 제공

## 2. 대상 구조와 의존 방향

```text
apps/web/
  src/
    app/                    router, providers, bootstrap, error boundary
    routes/                 route-level composition and loaders
    features/
      auth/
      profile/
      books/
      rooms/
      prep/
      discussion/
      closing/
      records/
      admin-books/
    data/                   auth/query/command/realtime adapters
    analytics/              first-party and GA adapters
    observability/          scrubbed frontend errors and web-vitals
    test/                   render helpers, fake adapters, fixtures
packages/design-system/
  src/
    styles/                 semantic tokens and global styles
    ui/                     foundation primitives
    book/                   reusable book components
    discussion/             reusable discussion components
packages/contracts/         shared Zod schemas; frontend가 소비하되 단독 소유하지 않음
```

의존 방향은 `contracts → web`, `design-system → web`이다. `web`은 `server` source나 DB/Kysely type을 import하지 않는다. feature는 Supabase SDK나 `fetch`를 component에서 직접 호출하지 않고 `data` adapter와 typed hook을 통한다.

기존 root Vite showcase는 Slice 0에서 다음과 같이 이동한다.

- token과 재사용 가능한 primitive/domain component는 `packages/design-system`으로 이동
- 예시 데이터, 제품 범위 밖 알림 control과 showcase 전용 화면은 제품 route로 복사하지 않음
- `SessionTimer`는 generic 5분 경고가 아니라 서버 phase와 deadline에 따른 7분 연장 판단, 5분 Synthesis, 별도 Closing countdown을 표현하도록 재작성
- demo `app.tsx`는 제거하거나 개발 전용 design-system preview로 격리

## 3. 초기 route와 화면 경계

route의 URL 이름은 구현 세부사항이지만 다음 화면 책임을 안정적으로 분리한다.

| Route group | 핵심 화면과 책임 |
| --- | --- |
| Auth | 가입, 로그인, 비밀번호 재설정 요청·callback, generic error |
| App shell | 인증 확인, global navigation, profile summary, route error boundary |
| 내 토론 | `진행 중 / 예정 / 종료`, 역할·상태·정렬, 취소된 방 표시 |
| 토론 검색 | 방 제목·책·저자 검색, 상태·정원 표시, password 참가 진입 |
| 방 생성·설정 | Published Pack 선택, 필수 값, 시작 전/후 변경 가능 범위 |
| 대기실 | 참가 등록, PUBLIC 사전 입력, 최소 인원, 시작 control, 참가자 관리 |
| 토론방 | timeline, current topic, phase/timer, Presence/typing, host control |
| Closing | 일반 composer 닫기, 마지막 한 줄 작성·수정·삭제·건너뛰기, countdown |
| 종료된 방 | 전체 대화·PUBLIC prep·마지막 한 줄·공식 기록의 읽기 전용 열람 |
| 프로필 | 현재 프로필 이름 확인·변경, 탈퇴 가능 조건과 확인 절차 |
| Admin Builder | Book Context Pack Draft/Review/Publish/Retire 운영 화면 |

한 `roomId` 아래의 대기실·토론·Closing·종료 화면은 클라이언트가 임의로 route를 결정하지 않는다. snapshot의 서버 확정 phase와 membership/access 결과를 기준으로 올바른 view를 렌더링한다.

토론 화면의 `current topic`과 AI Host 메시지는 Living Wiki 전체 공개가 아니라 서버가 검증해 내보낸 참가자용 projection이다. 프론트 contract에는 Wiki의 Participant State, metric, evidence graph와 private-derived state를 표현하는 필드를 만들지 않는다.

Admin Builder는 `docs/BOOK_CONTEXT_SPEC.md`의 7개 section을 기준으로 다음을 구분해 보여준다.

- 책·판본 identity와 section별 Coverage
- 항목의 `FACT/AUTHOR_STATEMENT/INTERPRETATION/DISCUSSION_SIGNAL`
- 출처명·발행 주체·근거 locator와 supports/conflicts 관계. Tier는 내부 판정에만 사용하고 기본 UI에는 노출하지 않음
- 정보 부족과 출처 충돌
- 자동 생성본과 운영자 수정본, 재생성 diff
- Builder stage 진행률·실패·재시도
- Review validation, Publish blocker와 확인이 필요한 warning
- version history, Published/Retired 상태와 Retire 사유

정보 부족을 빈칸 오류처럼 숨기거나 운영자가 Publish를 위해 임의 내용을 채우도록 유도하지 않는다. conflict와 복수 해석은 비교 가능한 상태로 유지한다.

## 4. 상태 소유권

| 상태 종류 | 소유자 | 규칙 |
| --- | --- | --- |
| route, 검색어, tab | React Router URL | 공유·뒤로가기 가치가 있는 상태만 저장 |
| profile, room, membership, phase, message, record | TanStack Query | 서버 확정 상태의 유일한 frontend cache |
| Presence, typing, connection, reply target, pending outbox | session-scoped Zustand | 방 route 진입마다 생성하고 이탈 시 폐기 |
| form draft, dialog open, local selection | React/RHF local state | 필요한 component 범위 안에서 유지 |
| Supabase Auth session | Auth provider | token을 Zustand/localStorage의 별도 key로 복제하지 않음 |

공식 message나 phase를 Zustand에 복사하지 않는다. 화면은 Query snapshot을 기본으로 그리고 Realtime event로 cache를 갱신하되 `aggregateVersion` gap, reconnect 또는 event parse 실패 시 snapshot을 다시 요청한다.

URL에는 token, 방 password, 이메일, 메시지·사전 입력·마지막 한 줄, 내부 UUID가 노출되지 않게 한다. 검색 URL이 analytics에 전달될 수 있으므로 raw 검색어는 GA에 보내지 않는다.

## 5. 데이터와 통합 adapter

### 5.1 Auth adapter

- Supabase email/password 가입·로그인·로그아웃과 PKCE reset을 감싼다.
- Hosted email confirmation이 꺼진 전제를 검증하되 화면은 인증 공급자 오류 문자열에 결합하지 않는다.
- 가입·로그인·reset form은 Cloudflare Managed Turnstile token을 각 Supabase Auth 요청과 같은 흐름으로 제출한다.
- 로그인 실패는 계정 존재 여부를 구분하지 않는 공통 문구를 사용한다.
- reset 요청도 이메일 존재 여부와 무관하게 같은 성공 안내를 표시한다.
- auth 상태 확정 전 protected route를 잠깐 공개하지 않는다.

### 5.2 Query adapter

- RLS가 허용한 Supabase view/RPC 또는 public read endpoint만 사용한다.
- query key는 profile, room list/search, room snapshot, messages cursor, record처럼 domain 단위로 정의한다.
- 모든 외부 응답은 `packages/contracts` Zod schema로 parse한다.
- message snapshot은 최근 100개, 과거 페이지는 cursor 50개를 기본으로 하고 전체 배열을 무제한 DOM에 유지하지 않는다.

### 5.3 Command client

- 중요한 변경은 authenticated Nest Command API로 보낸다.
- 각 mutation은 client command/message id를 포함해 retry가 같은 효과를 중복 만들지 않게 한다.
- server success 전 host 권한, phase, 참가 완료나 공식 message처럼 보이게 하지 않는다.
- `409` conflict나 stale version은 로컬 추측으로 합치지 않고 최신 snapshot을 받아 사용자에게 변경된 상태를 설명한다.
- validation, forbidden, rate-limit, conflict, transient failure를 안정된 error code로 mapping한다.

### 5.4 Realtime adapter

- DB-only 공식 Broadcast topic과 client-writable ephemeral topic을 같은 WebSocket 연결에서 session route 수명에 맞춰 구독·해제한다.
- 공식 topic은 `session:{sessionId}:v{channelEpoch}`에서 `session_event`를 수신만 하고, Presence/typing은 `:ephemeral` suffix topic에서 처리한다.
- event envelope을 parse하고 `eventId`, `aggregateVersion`, cursor로 duplicate/gap을 판정한다.
- Realtime은 알림·projection 수단이며 초기 진입, reconnect, background 복귀와 gap 발생 시 DB snapshot으로 수렴한다.
- typing은 throttle하고 background 또는 composer 비활성 phase에서 중단한다.
- WebSocket이나 필수 capability가 없으면 깨진 토론방 대신 지원 browser 안내를 표시한다.

## 6. 실시간 토론 UX 규칙

### 6.1 Message lifecycle

```text
local draft
  → pending outbox(client_message_id)
  → server confirmed(seq_no)
  → Realtime/cache reconciliation

실패 시
pending → failed(content 유지) → 사용자가 같은 id로 retry
```

- pending message는 확정 message와 시각·접근성 semantics를 구분한다.
- 실패한 내용은 input으로 복구하거나 명시적 재전송을 제공한다.
- 확정 message는 수정·사용자 삭제 action을 제공하지 않는다.
- inline reply는 대상 message와 작성자·짧은 quote snapshot을 표시하며 별도 thread를 만들지 않는다.
- 사용자가 과거를 읽는 동안 자동으로 하단으로 이동시키지 않고 `새 메시지 N개`를 제공한다.

### 6.2 Phase와 timer

- server time과 authoritative deadline으로 남은 시간을 계산하고 주기적으로 보정한다.
- client timer 0은 화면 표시일 뿐 phase를 직접 전환하지 않는다.
- 7분 연장 판단, 5분 Synthesis 전환, 1분, Closing 시작·종료만 screen reader에 절제해 알린다.
- `토론 중 / 연장 중 / 마무리 중 / 종료`와 참가 가능 여부를 서로 다른 UI 상태로 표현한다.
- Synthesis에서는 AI 도움 요청만 닫고 일반 composer는 유지한다. Closing에서는 일반 composer도 닫는다.

### 6.3 Reconnect

- 연결 상태를 `연결 중 / 연결됨 / 재연결 중 / 동기화 실패`로 구분한다.
- reconnect 후 snapshot, message cursor와 phase version을 확인한 뒤 Realtime projection을 재개한다.
- 오래된 화면에서 작성한 command가 거절되면 현재 phase로 이동하고 입력 손실을 최소화한다.
- 공식 종료 후에는 읽기 전용 route로 수렴한다.

## 7. 개인정보·보안·analytics

- message, PUBLIC prep과 마지막 한 줄도 일반 오류 로그, Sentry breadcrumb, GA에 보내지 않는다.
- `AI_PRIVATE` 원문은 작성자 전용 사전 입력 form 이외의 session cache, Realtime payload, analytics adapter에서 표현할 수 없게 contract export를 분리한다.
- 사용자 작성 text는 HTML로 해석하지 않고 plaintext로 렌더링한다.
- access token은 Supabase Auth adapter와 command client 경계를 벗어나 출력·복제하지 않는다.
- CSP를 깨는 inline script와 임의 third-party tag를 추가하지 않는다.
- GA production adapter는 privacy 고지·동의 gate 전까지 no-op이며 coarse funnel만 허용한다.
- Sentry는 Replay, console/network body와 PII collection을 끄고 `beforeSend` allow-list scrub을 거친다.

## 8. 접근성·반응형·성능

- 360 CSS px부터 desktop까지 `100dvh`, safe area와 virtual keyboard를 검증한다.
- dialog/menu의 focus 이동·복귀, keyboard-only 핵심 flow, visible focus, 200% zoom/reflow와 reduced motion을 구현한다.
- 일반 text 4.5:1, component boundary/focus 3:1 대비를 목표로 하고 색만으로 상태를 전달하지 않는다.
- touch target은 가능하면 44×44 CSS px 이상으로 한다.
- message live announcement는 최신 위치에서만 polite로 사용하고 typing과 매초 timer를 읽지 않는다.
- 초기 user route JS gzip 약 350KB와 field p75 LCP 2.5초, INP 200ms, CLS 0.1 budget을 측정한다.
- route lazy loading, message pagination/필요 시 virtualization, book cover 크기 지정과 layout reserve로 budget을 지킨다.

## 9. 프론트엔드 테스트

### 9.1 PR gate

- lint, typecheck, production build
- Vitest domain-adjacent helper와 adapter contract test
- Testing Library의 semantic query 기반 component test
- `axe-core` component/route smoke
- fake server·fake Realtime을 사용한 route 상태 test
- Playwright Chromium 핵심 flow smoke

### 9.2 필수 회귀

- 이메일 인증 없는 가입, 중복 이메일, 필수 프로필 이름, generic login/reset response
- host/participant 권한별 control 노출과 server forbidden 처리
- 참가 password 오류·정원 conflict·stale 설정의 사용자 안내
- pending/confirmed/failed message, 같은 id retry와 inline reply
- Realtime duplicate/gap, background 복귀와 reconnect snapshot
- 7/5/1분 경계, 반복 연장, Synthesis·Closing composer 잠금
- 마지막 한 줄 숨김·수정·삭제·skip과 5분 마감
- 종료된 방의 읽기 전용 상태와 무권한 route 차단
- AI 지연·실패 중 인간 채팅 지속
- AI_PRIVATE canary가 DOM, public cache, event, error와 analytics에 나타나지 않음

release 전 Chrome·Firefox·WebKit, 360px profile, keyboard-only와 macOS/iOS VoiceOver 핵심 flow를 검증한다.

## 10. Amplify build와 운영

- `apps/web`만 독립 production artifact로 build한다.
- compile-time public 환경에는 Supabase URL·publishable key, API base URL과 허용된 public config만 넣는다.
- source map은 Sentry에 비공개 업로드하고 public artifact에 secret이나 `.env`가 포함되지 않는지 검사한다.
- SPA fallback, CSP·security header, immutable hashed asset cache와 `index.html` 짧은 cache를 Amplify 설정에 명시한다.
- staging smoke가 통과한 동일 Git SHA artifact만 production으로 승격한다.
- frontend release에는 contract version, API compatibility와 migration head readiness를 확인한다.

현재 배포 준비 상태(2026-09-02): pnpm monorepo용 `amplify.yml`과 `.npmrc`, `customHttp.yml`을 추가해 Node/pnpm 고정, `apps/web/dist` artifact 경계, 공개 환경값 사전 검증, source map·server secret marker 검사, staging-only CSP·security header와 hashed asset cache를 version control한다. GitHub staging workflow는 DB migration과 API·Worker readiness가 성공한 뒤에만 Amplify `RELEASE`를 시작하며, branch auto-build가 켜졌거나 Amplify job의 commit이 검증한 Git SHA와 다르면 배포를 중단한다. SPA history fallback은 `docs/runbooks/AMPLIFY_HOSTING.md`의 정규식 200 rewrite를 Amplify staging app 생성 시 적용하고 직접 진입 smoke로 확인한다. 실제 app 생성·환경값 입력·첫 배포는 AWS 계정 소유·MFA·비용 알림과 OIDC role 준비 뒤에 수행한다.

## 11. Vertical slice별 프론트 산출물

| Slice | 프론트 산출물 | 서버/공통 선행조건 |
| --- | --- | --- |
| 0 | workspace 이동, router/provider, responsive shell, design-system, fake adapter, build/CI | contract package와 environment schema skeleton |
| 1 | signup/login/reset/profile, route guard | Auth 설정, profile schema/RLS·command, error contract |
| 2 | 책 선택, 방 생성·검색·참가, 내 토론, 대기실 | catalog query, Pack foundation fixture, join/settings command와 conflict code |
| 3 | timeline, composer, reply, Presence/typing, reconnect | snapshot/message/event contract와 private channel |
| 4 | server timer, 연장·마무리·종료, 참가자 관리 | session machine command, deadline와 Cron reconciliation |
| 5 | AI Host·검증된 current-topic projection·fallback 상태 | AI intervention/public projection event와 safe failure state; 전체 Wiki는 비노출 |
| 6 | Synthesis·Closing·reflection·공식 기록 | closing/reflection/result state와 immutable record query |
| 7 | 7개 section·항목·출처·불확실성·diff·Publish Gate를 포함한 Admin Builder UI | admin authorization과 Pack workflow/validation contract |
| 8 | 탈퇴 UX, 운영 오류 보강, 전체 E2E | deletion/anonymization command와 retention jobs |

프론트는 서버가 준비되기 전 `packages/contracts`를 따르는 fake adapter로 개발할 수 있다. fake fixture가 실제 contract와 달라지지 않도록 server contract test에서 같은 fixture를 parse한다.

현재 구현 상태(2026-09-02): Slice 1의 공통 authenticated HTTP client, Supabase Auth provider, 보호 route guard, signup/login/reset route와 profile 조회·수정 화면을 구현했다. access token은 Supabase client에서만 읽으며 `AUTH_REQUIRED`에만 refresh 1회와 재시도를 적용하고 `CURRENT_PASSWORD_INVALID` 같은 다른 401은 전역 logout으로 처리하지 않는다. profile은 `['profile']` Query cache를 공식 상태로 사용하며 저장 성공 response로만 이름과 header 첫 글자 avatar를 갱신한다. Local에서는 site key를 생략해 CAPTCHA 없이 동작하고 staging/production은 가입·로그인·reset form의 `interaction-only` Managed Turnstile token을 Supabase Auth에 전달한다. token 실패·만료와 provider 거절 시 token을 폐기하고 widget을 reset하며, 배포 verifier는 Cloudflare test site key를 거절한다. 실제 staging E2E는 남아 있다. 계정 탈퇴 UX는 Slice 8 범위로 유지한다.

Slice 2 구현 상태(2026-09-02): 공개 contract를 runtime parse하는 book/room HTTP adapter와 Query key를 추가하고 `/discussions`, `/discussions/find`, `/rooms/new`, `/rooms/:roomId` 제품 route를 구현했다. 내 토론 tab, 방·책 검색, 3단계 방 생성, 상태와 참가 가능 여부를 분리한 방 card/detail, 참가 password 오류 시 초기화·focus 복구, 생성 command ID의 동일 payload 재시도를 포함한다. desktop/mobile header는 `내 토론`·`토론 찾기`를 탐색 항목으로 두고 토론 만들기는 독립된 icon action으로 유지한다. 대기실은 `SessionSnapshot`과 heartbeat를 재사용해 접속 상태·최소 시작 인원을 표시하고, 방장 시작·설정·방 취소·권한 이전·내보내기, 일반 참가자의 참가 취소를 role과 lifecycle에 맞춰 제공한다. 시작 후 설정은 새 password와 최대 인원 증가만 허용한다. 사전 입력은 PUBLIC과 요청자 본인의 AI_PRIVATE만 렌더링하며 작성·수정·삭제와 revision conflict를 처리한다. 현재 public `MyRoomSummary`에는 참가 인원·정원 정보가 없으므로 내 토론 목록에는 이를 추측해 표시하지 않는다. 실제 local Supabase/API heartbeat를 포함한 smoke는 남아 있다.

Slice 3 프론트 범위와 Slice 4의 session timer·운영 control도 완료되었다. `/rooms/:roomId/session` route는 공용 snapshot/event contract만 소비하며, 공식 상태는 TanStack Query, connection·Presence·typing·reply·pending outbox는 route-scoped Zustand가 소유한다. 초기 subscribe 후 cursor sync, duplicate/gap 복구, heartbeat/background 복귀, epoch topic 교체, 최근 100개와 과거 50개 pagination, inline reply, pending/failed/same-ID retry를 유지한다. timer는 active/Synthesis의 `discussionEndsAt`과 Closing의 별도 `closingEndsAt`을 서버 시각 offset으로 표시한다. 7분 판단 창은 모든 참가자에게 보이고 방장에게만 `15분 연장`·`마무리하기`를 제공하며, 강제 종료에는 되돌릴 수 없다는 확인 dialog를 둔다. command 성공 후에는 client 계산값이 아니라 cursor sync로 확정 상태에 수렴하고 stale/권한 오류도 최신 snapshot으로 복구한다. 진행 중 방 설정과 참가자 관리 command는 방 상세의 최신 aggregate version을 사용한다.

Slice 6 구현 상태(2026-09-02): Closing에서는 일반 composer를 닫고 실제 참여자 본인의 마지막 한 줄만 작성·수정·삭제·건너뛰기 할 수 있게 했다. 진행 중에는 완료 인원수와 현재 사용자의 응답만 표시하고 다른 참가자의 원문은 렌더링하지 않는다. 종료 후 기본 화면은 익명화된 `오늘의 토론 기록`이며 `PENDING/PROCESSING/RETRYING/READY/FAILED/INSUFFICIENT`를 독립적으로 처리한다. 방장에게만 허용된 실패 재시도, 실제 참여자 dialog, 읽기 전용 전체 대화, PUBLIC prep과 작성자 본인의 AI_PRIVATE를 분리한 `내 준비`, 제출된 마지막 한 줄을 제공한다. 종료 후 prep 조회가 제품 명세와 달리 Scheduled에만 잠겨 있던 DB 권한을 실제 참여자/방장 읽기까지 확장했고, 다른 사용자의 AI_PRIVATE 비노출 pgTAP과 DOM 회귀를 추가했다. 360px 가로 넘침과 axe 자동 검사를 통과했다.

Slice 7 구현 상태(2026-09-03): 본인의 `ProfileSchema.role`로만 표시되는 Admin 진입점과 별도 route guard, 전체 Admin HTTP adapter를 추가했다. 새 Pack은 Kakao 도서 검색에서 정확한 판본을 선택하고 서명 `selectionProof`로 생성하며 같은 Provider ID/ISBN의 기존 Pack은 중복 생성하지 않는다. 상세 화면은 7개 섹션과 출처를 연속 표시하고 item·section별 검수 control과 Tier 문자를 숨긴다. 운영자는 내용을 수정·삭제하고 `수정 필요`를 해결한 뒤 `확인 필요`를 한 번 확인해 Pack 전체 검수를 완료하며, Publish는 별도 확인으로 실행한다. 7단계 Builder 진행·실패 재시도, revision 기반 직렬 자동 저장, 전체·항목 재생성 proposal의 현재/제안 비교와 적용·폐기, 작성 중 → 검수 완료 → 게시됨 → 게시 중단 흐름을 연결했다. 일반 사용자는 Admin route에서 `/discussions`로 복귀하며 account role은 토론 참가자 payload에 노출하지 않는다. Published 내용을 복제하는 별도 새 버전 command는 서버 contract 보강 대상으로 남아 있다.

Slice 8 프론트 구현 상태(2026-09-02): 프로필 설정에서 탈퇴 preview를 매번 새로 조회하고, `ADMIN_ROLE`·`ACTIVE_PARTICIPATION`·`HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL` blocker가 있으면 비밀번호 form을 만들지 않은 채 해결 경로만 안내한다. 허용된 계정에는 유지·익명화되는 공동 기록과 영구 삭제되는 AI_PRIVATE 수를 분리해 보여주고, 현재 비밀번호와 명시적 영구 동의가 모두 있어야 삭제 command를 보낸다. 비밀번호는 TanStack mutation cache에 넣지 않으며 실패 즉시 input에서 제거한다. `CURRENT_PASSWORD_INVALID`와 `ACCOUNT_DELETION_PENDING`은 전역 logout으로 처리하지 않고, `COMPLETED` 뒤에는 Auth sign-out 실패와 관계없이 모든 local Query cache와 인증 상태를 폐기한다. 완료 후 로그인 화면은 탈퇴 완료를 확인해 준다. route render 실패에는 원문·credential을 표시하지 않는 전역 복구 화면을 추가했다. 360px dialog reflow와 axe WCAG A/AA 자동 검사를 통과했다. 프론트의 실제 adapter를 사용한 local Auth hard-delete smoke에서 가입·프로필 parse·preview·비밀번호 오류·삭제·재로그인 차단·같은 email의 새 UUID 재가입과 임시 계정 정리까지 통과했다. DB prepare 직후 Auth 삭제가 중단된 상태도 실제 local lease로 재현했고, Worker recovery 경로의 재claim·Auth hard-delete·완료 기록·새 UUID 재가입까지 통과했다.

구조 정리(2026-09-02): `useDiscussionSession`은 route-facing facade만 유지하고 snapshot/Realtime gap 복구·heartbeat·browser lifecycle은 connection hook, outbox·pagination·typing은 messaging hook으로 분리했다. 화면은 public environment adapter 조립, session screen, server-clock countdown, message timeline과 viewport를 각 수명·책임별로 분리하며 공식 Query 상태와 scoped Zustand 상태의 소유권은 변경하지 않았다.

## 12. 프론트 완료 기준

- `apps/web`과 `packages/design-system`이 독립적으로 lint, typecheck, test, build된다.
- component가 server/DB 구현 type에 의존하지 않고 public contract만 소비한다.
- authoritative server state와 ephemeral Realtime state가 중복 소유되지 않는다.
- 네트워크·AI 실패와 reconnect에서도 입력 손실을 최소화하며 공식 상태를 추측하지 않는다.
- 핵심 flow가 360px, keyboard, axe와 지원 browser matrix를 통과한다.
- content, credential와 `AI_PRIVATE`가 log, error, analytics와 public artifact에 포함되지 않는다.
- `docs/TECHNICAL_PLAN.md`의 해당 slice E2E 완료 기준을 서버와 함께 통과한다.
