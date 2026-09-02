# 프론트엔드–서버 통합 가이드

> Status: Implemented-server handoff  
> Product source of truth: `PRODUCT_SPEC.md`  
> Frontend implementation plan: `docs/FRONTEND_PLAN.md`  
> Runtime contract source: `packages/contracts`  
> Last verified: 2026-09-02

## 0. 목적과 읽는 순서

이 문서는 완성된 MVP 서버를 `apps/web`에서 소비하기 위한 시작점이다. 제품 행동이나 응답 필드를 다시 정의하지 않고, 실제 서버 endpoint·공개 contract·Realtime protocol과 기존 UX 문서를 연결한다.

프론트엔드 작업자는 다음 순서로 읽는다.

1. 제품 행동이 필요한 경우 `PRODUCT_SPEC.md`
2. 화면 구조와 구현 원칙은 `docs/FRONTEND_PLAN.md`
3. 역할·상태별 control은 `docs/ROLE_STATE_MATRIX.md`
4. 서버 연결 방식은 이 문서
5. HTTP 세부사항은 `docs/API_REFERENCE.md`
6. 토론방 동기화는 `docs/REALTIME_INTEGRATION.md`
7. 실행 방법은 `docs/FRONTEND_LOCAL_SETUP.md`
8. 요청·응답의 최종 필드 정의는 `packages/contracts/src/public`과 `packages/contracts/src/admin`

문서와 코드가 다르면 제품 행동은 `PRODUCT_SPEC.md`, wire contract는 `packages/contracts`, 실제 route는 Nest Controller를 우선한다. 불일치를 발견하면 프론트에서 임의로 보정하지 말고 contract와 문서를 함께 수정한다.

## 1. 현재 인수인계 상태

서버의 Slice 0~8 MVP 범위는 구현·검증되었다. 프론트엔드는 실시간 토론과 일부 세션 운영 adapter가 먼저 구현되어 있으며 나머지 화면과 adapter는 아래 계약에 맞춰 연결하면 된다.

| 영역 | 서버 | 현재 web | 프론트 작업 |
| --- | --- | --- | --- |
| Auth | Supabase email/password, profile 생성 trigger | Auth adapter/provider, 가입·로그인·PKCE reset route, 보호 route guard와 세 flow의 Managed Turnstile 연결 완료 | staging Turnstile·reset mail E2E |
| 프로필 | 조회·수정 API 완료 | profile query/mutation, 축약 설정과 계정 탈퇴 UX 구현 | staging 계정 탈퇴 smoke |
| 책 catalog | Published Pack 검색 API 완료 | catalog query·검색·exact Pack 선택 화면 구현 | 실제 local API smoke |
| 방·대기실 | 생성·검색·참가·설정·멤버·사전 입력 API 완료 | room/prep adapter, 제품 route, snapshot 기반 대기실 구현 | 실제 local API·heartbeat smoke |
| 실시간 토론 | snapshot·message·heartbeat·운영 command·Realtime 완료 | API/Realtime adapter, projection, route 구현 | 기존 구현을 기준으로 확장 |
| Closing·결과 | 마지막 한 줄·공식 기록 API와 event 완료 | closing/result adapter, 마지막 한 줄, 공식 기록·대화·prep 읽기 화면 구현 | 실제 local API·Worker result smoke |
| 계정 탈퇴 | preview·삭제 API와 복구 worker 완료 | 전체 탈퇴 UX, 실제 local Auth hard-delete·재가입과 DB prepare 이후 Worker 장애 복구 smoke 완료 | staging 계정 탈퇴 smoke |
| Admin Builder | 7단계 Builder와 Draft/Review/Publish API 완료 | Admin 전용 adapter, 7단계 진행·검수·proposal diff·Publish Gate 구현 | 실제 staging Builder smoke |

현재 실시간 구현의 기준 파일은 다음과 같다.

- `apps/web/src/data/session-api.ts`
- `apps/web/src/data/session-realtime.ts`
- `apps/web/src/features/discussion/session-projection.ts`
- `apps/web/src/features/discussion/use-session-connection.ts`
- `apps/web/src/test/session-fixture.ts`

새 adapter는 이 구현의 인증, Zod parse, 안정된 client error, 의존성 주입 방식을 따른다.

## 2. 런타임과 신뢰 경계

```text
Browser
  ├─ Supabase Auth ── 가입·로그인·reset·access token
  ├─ Nest API ─────── Bearer token + query/command
  └─ Supabase Realtime
       ├─ official private topic: 서버 event 수신 전용
       └─ ephemeral private topic: Presence·typing

Nest API
  └─ 사용자 access token을 전달한 user-scoped Supabase client/RPC

Worker
  └─ browser에서 접근 불가: Queue, AI, 결과, Builder, 삭제 복구
```

브라우저에 허용되는 환경 변수는 다음 세 개뿐이다.

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY` — staging/production의 browser-public Cloudflare widget site key; local은 생략

`SUPABASE_SECRET_KEY`, `WORKER_DATABASE_URL`, `OPENAI_API_KEY`, `COMMAND_FINGERPRINT_KEY`는 절대 Vite 환경, bundle, source map, 로그에 넣지 않는다.

## 3. 공통 adapter 규칙

### 3.1 응답은 항상 runtime parse한다

TypeScript type assertion만 사용하지 않는다. 외부 응답은 대응하는 Zod schema로 parse하고 실패하면 서버 응답 계약 오류로 처리한다.

```ts
import {
  ProfileSchema,
  PublicErrorSchema,
  type Profile,
} from "@bookseasoning/contracts/public";

async function getProfile(): Promise<Profile> {
  const response = await authenticatedFetch("/v1/me/profile");
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = PublicErrorSchema.safeParse(payload);
    throw toClientError(response.status, error.success ? error.data : null);
  }
  return ProfileSchema.parse(payload);
}
```

component는 `fetch`, Supabase RPC 또는 Realtime SDK를 직접 호출하지 않는다. `src/data` adapter → feature hook → route/component 순서로 의존한다.

### 3.2 인증

- Supabase browser client가 session과 refresh token을 소유한다.
- Nest API 요청 직전에 현재 access token을 읽어 `Authorization: Bearer <token>`을 붙인다.
- token을 별도 Zustand/localStorage key, URL, analytics, 오류 context에 복제하지 않는다.
- `401 AUTH_REQUIRED`는 session refresh를 한 번 시도한 뒤 실패하면 로그인 route로 보낸다.
- `401 CURRENT_PASSWORD_INVALID`는 탈퇴 form의 비밀번호 오류이며 전역 로그아웃으로 처리하지 않는다.

### 3.3 query와 mutation

권장 query key는 다음과 같다.

```text
["profile"]
["books", { query, sort, limit }]
["rooms", "search", { query, limit }]
["rooms", "mine"]
["room", roomId]
["room", roomId, "prep"]
["session", roomId]
["session", roomId, "result"]
["account", "deletion-preview"]
["admin", "book-context", "packs"]
["admin", "book-context", "pack", packVersionId]
```

mutation 성공 후 response의 version을 로컬에서 임의 계산하지 않는다. 필요한 query를 invalidate하거나 session cursor sync로 확정 상태에 수렴한다. `409` stale/conflict는 최신 query를 먼저 다시 받고 사용자에게 상태 변경을 설명한다.

### 3.4 멱등성 식별자

- 사용자가 새 동작을 시작할 때 `crypto.randomUUID()`로 `commandId`를 만든다.
- 네트워크 실패로 같은 동작을 재시도할 때는 같은 ID와 같은 payload를 사용한다.
- payload를 수정했다면 새 ID를 만든다.
- 메시지는 `clientMessageId`가 멱등성 key다. 실패 재전송에도 같은 ID를 유지한다.
- `duplicate: true`는 첫 요청 결과가 재생된 정상 성공이다.
- `COMMAND_PAYLOAD_MISMATCH`는 ID 재사용 버그이므로 자동 재시도하지 않는다.

## 4. 기능별 연결 흐름

### 4.1 가입·로그인·비밀번호 재설정

Auth는 Nest API가 아니라 Supabase Auth browser client를 직접 사용한다.

- 가입: `signUp({ email, password, options: { data: { profile_name }, captchaToken } })`
- 로그인: `signInWithPassword({ email, password })`
- reset 요청: 계정 존재 여부와 무관하게 동일한 완료 화면을 표시한다.
- reset callback: PKCE session 교환 후 `updateUser({ password })`
- 로그아웃: Supabase session을 폐기한 뒤 authenticated query cache를 제거한다.

가입 metadata의 key는 정확히 `profile_name`이다. Local은 email confirmation과 CAPTCHA가 꺼져 있고, staging/production 가입·로그인·reset에는 Turnstile token을 전달한다. 자세한 환경 규칙은 `docs/runbooks/AUTH_CONFIGURATION.md`를 따른다.

### 4.2 프로필

1. 보호 route 진입 후 `GET /v1/me/profile`
2. 이름 변경은 `PATCH /v1/me/profile`
3. 성공하면 `profile` query를 response로 교체한다.
4. 과거 메시지·과거 Closing 이름은 snapshot이므로 소급 변경하지 않는다.

UI 기준은 `docs/PROFILE_ACCOUNT_UX.md`다.

### 4.3 책 catalog와 방 생성

1. `GET /v1/books`로 Published Pack만 검색한다.
2. 선택 값은 `bookId`가 아니라 exact `packVersionId`다.
3. `POST /v1/rooms`에 새 `commandId`와 선택된 `packVersionId`를 보낸다.
4. 생성 성공 후 `/rooms/:roomId`로 이동하고 room detail/mine query를 갱신한다.

Draft, Review, Retired Pack은 일반 catalog에 나타나지 않는다. 검색 결과가 비어 있으면 오류가 아니라 제품의 empty state로 표현한다.

### 4.4 방 검색·참가·대기실

방 membership이 없는 로그인 사용자도 방 검색과 상세 조회는 가능하다. `RoomDetail.actorRole === "NONE"`이면 `members`는 빈 배열이다.

참가 흐름:

1. `GET /v1/rooms/:roomId`로 상태·정원 확인
2. 기존 참가자가 아니면 password form 표시
3. `POST /v1/rooms/:roomId/join`
4. 성공하면 detail, mine, prep을 갱신하고 대기실 또는 현재 session으로 이동

비밀번호 입력 실패에는 같은 `commandId`를 고집하지 않는다. 사용자가 값을 다시 입력하면 새 의도이므로 새 ID를 만든다. 이미 참가한 사용자는 password 없이 같은 join endpoint를 재호출할 수 있다.

대기실에서는 room detail의 `members`, `aggregateVersion`, membership/role을 기준으로 control을 표시한다. 방장 설정·권한 이전·내보내기·취소 command에는 detail에서 받은 최신 `expectedVersion`을 사용한다.

사전 입력 목록은 모든 `PUBLIC` 항목과 현재 사용자의 `AI_PRIVATE` 항목만 반환한다. 다른 사용자의 `AI_PRIVATE`는 응답 모델로도 존재하면 안 된다. 작성·수정·삭제는 Scheduled 대기 상태의 등록 참가자에게만 허용한다. 조회는 Scheduled 등록 참가자와 종료 후 실제 참여자/방장에게 허용하며, 종료 화면에서는 읽기 전용으로 제공한다.

### 4.5 실시간 토론

토론 route는 `GET /v1/rooms/:roomId/session/sync`의 `SessionSnapshot`을 단일 authoritative 상태로 사용한다.

1. 최초 snapshot을 가져온다.
2. snapshot의 exact Realtime topic 두 개를 구독한다.
3. 구독 중 도착한 event를 잠시 buffer한다.
4. cursor sync로 구독 전후 gap을 메운다.
5. buffer를 `eventCursor` 순서로 projection한다.
6. heartbeat를 서버가 반환한 주기로 반복한다.
7. duplicate는 무시하고 gap/protocol error/epoch 변경은 다시 sync한다.

세부 알고리즘은 `docs/REALTIME_INTEGRATION.md`를 따른다. 기존 `HttpSessionApi`, `SupabaseSessionRealtimeClient`, projection helper를 재사용하고 공식 session state를 별도 Zustand store에 복사하지 않는다.

### 4.6 Closing과 공식 결과

`SessionSnapshot.closing`과 `result`가 session 화면의 상태 진입을 결정한다.

- `CLOSING`: 일반 composer를 닫고 실제 참여자에게만 마지막 한 줄 form을 제공한다.
- 저장/건너뛰기: `PUT .../closing/response`
- 다시 미응답 상태로 돌리기: `DELETE .../closing/response`
- `expectedRevision`은 `closing.actorResponse.revision`, `expectedPhaseVersion`은 현재 session state를 사용한다.
- 타인의 미공개 답변은 snapshot/event에서 보이지 않는다. 진행 event에는 완료 인원수만 있다.
- 전원 완료 또는 5분 만료로 공식 종료될 수 있으므로 command 응답의 `officiallyEnded`와 후속 state event를 모두 처리한다.

종료 후 `GET .../result`를 조회한다. `PENDING/PROCESSING/RETRYING`은 polling 또는 `SESSION_RESULT_STATE_CHANGED` 뒤 refetch하고, `READY`일 때만 record와 공개 Closing line을 렌더링한다. `FAILED`에서 `canRetry: true`여도 재시도 control은 방장에게만 보인다. `INSUFFICIENT`는 생성 실패가 아니라 충분한 대화가 없다는 공식 상태다.

화면 기준은 `docs/DISCUSSION_RESULTS_UX.md`다.

### 4.7 계정 탈퇴

1. `GET /v1/me/account/deletion-preview`
2. blocker가 있으면 해결 방법만 안내하고 비밀번호 form을 열지 않는다.
3. 허용 상태에서 current password와 영구 삭제 확인을 받아 `DELETE /v1/me/account`
4. `COMPLETED` 성공을 받은 뒤 local query cache와 Supabase Auth session을 폐기한다.

`ACCOUNT_DELETION_PENDING`은 서버 worker가 Auth hard-delete를 계속 복구하는 상태다. 성공한 것처럼 로그아웃 완료 화면을 보여주지 말고 잠시 후 상태를 다시 확인하도록 안내한다. 탈퇴 후 같은 이메일 재가입은 가능하지만 새 Auth UUID이며 과거 기록과 연결하지 않는다.

### 4.8 Admin Book Context Builder

Admin route와 adapter는 일반 사용자 bundle에서도 role을 추측해 권한을 우회하지 않는다. 서버의 `ADMIN_REQUIRED`가 최종 경계다.
웹 셸과 Admin route guard는 본인의 `ProfileSchema.role`만 사용해 진입점을 표시한다. 이 값은 토론 참가자 정보나 참가자용 화면으로 전달하지 않는다.

기본 흐름은 다음과 같다.

```text
Pack 생성 → 7단계 Builder 진행 → Draft 편집
  → Review → blocker/warning 확인 → Publish

재생성 → 기존 Draft 유지 → proposal diff
  → apply 또는 discard
```

`expectedRevision`은 pack snapshot의 `pack.revision`을 사용한다. `builderRun.status`가 완료되기 전에 Review를 시작하지 않고, warning은 정확한 code 목록을 `acknowledgedWarnings`로 다시 보내야 한다. 상세 화면 의미는 `docs/BOOK_CONTEXT_BUILDER_UX.md`와 `docs/BOOK_CONTEXT_SPEC.md`를 따른다.

## 5. 화면 권한과 상태

control 표시에는 최소 다음 축을 함께 사용한다.

- account role: USER / ADMIN
- actor role: HOST / PARTICIPANT / NONE
- membership: REGISTERED / PARTICIPATED / CANCELED 계열
- session phase와 `phaseVersion`
- actual participation
- current deadline와 server time

클라이언트의 control 숨김은 UX일 뿐 보안 경계가 아니다. 서버가 `403` 또는 `409`를 반환할 수 있다는 전제로 작성한다. 상세 매트릭스는 `docs/ROLE_STATE_MATRIX.md`를 사용한다.

대표 원칙:

- 방장만 시작·연장·Synthesis·강제 종료·참가자 관리·결과 재시도를 한다.
- 실제 참여자만 메시지와 Closing response를 작성한다.
- Synthesis에서는 일반 메시지는 계속 가능하지만 AI 도움 요청은 불가하다.
- Closing에서는 일반 composer를 닫는다.
- 종료 후에는 실제 참여자와 방장만 읽기 전용 대화·결과를 본다.
- client timer가 0이 되어도 phase를 직접 바꾸지 않는다.

## 6. 오류 처리와 사용자 상태

모든 HTTP 오류는 가능한 경우 `PublicErrorSchema`로 parse한다. `message`는 사용자에게 표시 가능한 문장이지만, UI 동작 분기는 `code`를 기준으로 한다.

- `400`: form 또는 cursor를 수정하고 자동 재시도하지 않는다.
- `401 AUTH_REQUIRED`: Auth session 회복 또는 로그인 이동
- `403`: control을 제거하고 최신 권한/상태를 조회
- `409`: 최신 snapshot/detail을 다시 받은 뒤 사용자 선택을 보존해 재시도
- `429`: 서버가 지정한 상태 문구를 표시하고 즉시 반복하지 않는다.
- `5xx` 또는 network: 공식 성공으로 가정하지 않는다. 멱등성 ID를 보존한 수동 재시도를 제공한다.
- `INVALID_SERVER_RESPONSE`: 배포 contract 불일치이므로 일반 form 오류로 취급하지 않고 관측 가능하게 보고한다.

오류 code 전체 목록과 endpoint별 가능 오류는 `docs/API_REFERENCE.md`를 따른다.

## 7. 개인정보와 로그 금지 항목

다음 값은 console, Sentry breadcrumb/network body, analytics, URL, local persistence에 남기지 않는다.

- access/refresh token과 room password
- email과 current password
- message body, reply quote, PUBLIC prep body, Closing body
- 모든 `AI_PRIVATE` 원문
- Admin Builder provider artifact 원문

사용자 작성 text는 HTML로 해석하지 않고 plaintext로 렌더링한다. `AI_PRIVATE`는 작성자의 대기실 form/query 외 session cache와 Realtime 모델로 전달하지 않는다. 공식 event와 AI Host 메시지에는 내부 metric, private 정보, provider 진단을 추가하지 않는다.

## 8. 프론트 구현 권장 순서

1. 공통 authenticated HTTP client와 `PublicError` mapping
2. Auth provider·route guard·profile
3. book catalog·room search/create/join·내 토론
4. 대기실·room command·prep
5. 기존 session route를 app shell/query 구조에 통합
6. Closing·result
7. account deletion
8. Admin Builder
9. 전체 flow Playwright와 privacy canary 회귀

서버가 준비되기 전 단계는 contract-compatible fake adapter를 사용한다. fixture는 반드시 해당 Zod schema로 parse하는 test를 둬 실제 contract drift를 막는다.

## 9. 통합 완료 기준

- 모든 외부 응답이 `packages/contracts` runtime schema를 통과한다.
- component가 server source, DB row type 또는 internal contract를 import하지 않는다.
- mutation retry가 중복 확정 효과를 만들지 않는다.
- Realtime 유실·중복·순서 변경 후 snapshot으로 수렴한다.
- phase, role, membership, actual participation에 맞지 않는 control이 보이지 않고 서버 거절도 안전하게 처리한다.
- AI/provider 실패 중에도 인간 대화와 종료 흐름이 유지된다.
- `AI_PRIVATE` canary가 DOM, public cache, event, error, analytics에 나타나지 않는다.
- 360px, keyboard, axe와 지원 browser 핵심 flow가 통과한다.
