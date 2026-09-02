# 프론트엔드 Local 통합 환경

> Status: Local integration runbook  
> Environment template: `.env.example`  
> Supabase config: `supabase/config.toml`  
> Last verified: 2026-09-02

## 0. 목표

프론트엔드 엔지니어가 local Supabase, Nest API, Worker와 Vite web을 독립적으로 실행하고 다음 흐름을 검증할 수 있게 한다.

- email/password Auth와 프로필
- Published Pack catalog
- 방 생성·검색·참가·대기실
- 두 browser session의 실시간 토론
- Closing·공식 결과
- 계정 탈퇴
- 필요 시 Admin Builder

## 1. 요구 환경

- Node `24.18.x`
- pnpm `11.25.x`
- Docker Desktop 또는 Supabase local container를 실행할 수 있는 Docker runtime
- Supabase CLI는 workspace dev dependency 사용
- 선택: 실제 AI/Builder 통합에는 유효한 OpenAI API key

버전 확인:

```bash
node --version
pnpm --version
docker version
pnpm exec supabase --version
```

Node 23에서는 현재 test가 실행될 수 있어도 지원 범위가 아니다. `.node-version`과 Dockerfile의 Node 24.18을 따른다.

## 2. 설치와 Supabase 시작

저장소 root에서 실행한다.

```bash
pnpm install --frozen-lockfile
pnpm db:start
pnpm db:reset
```

Local service 기본 주소:

| Service | URL/port |
| --- | --- |
| Supabase API/Auth/Realtime | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Supabase Studio | `http://127.0.0.1:54323` |
| Local mail UI | `http://127.0.0.1:54324` |
| Nest API | `http://localhost:3000` |
| Vite web | `http://localhost:5173` |

`pnpm db:reset`은 local DB를 지우고 모든 migration을 다시 적용한다. 개발 중 만든 계정·Pack·방·메시지도 삭제되므로 보존 데이터가 있을 때 실행하지 않는다.

DB 검증이 필요하면 다음 명령을 사용한다.

```bash
pnpm check:db
```

이 명령도 먼저 reset하므로 일반 개발 seed 유지용 명령이 아니다.

## 3. 환경 변수

### 3.1 Server와 Worker

root `.env.example`을 참고해 gitignored root `.env`를 준비한다. 실제 값은 문서나 commit에 넣지 않는다.

Local 필수/권장 값:

```dotenv
NODE_ENV=development
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
CORS_ORIGINS=http://localhost:5173
RELEASE_VERSION=local

SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<supabase local publishable key>
SUPABASE_SECRET_KEY=<supabase local secret key>
WORKER_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

COMMAND_FINGERPRINT_KEY=<32자 이상의 local 전용 임의 문자열>
OPENAI_API_KEY=<실제 AI/Builder를 검증할 때만 설정>
```

local publishable/secret key는 `pnpm db:start` 또는 `pnpm exec supabase status` 출력에서 가져온다. legacy anon/service-role key 대신 현재 `sb_publishable_...`, `sb_secret_...` 형식을 사용한다. 값을 terminal 기록, screenshot, 이 문서에 복사하지 않는다.

### 3.2 Web

Vite는 `apps/web`을 root로 실행되므로 package의 `.env.example`을 gitignored `.env.local`로 복사한다.

```bash
cp apps/web/.env.example apps/web/.env.local
```

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<같은 local publishable key>
# local Supabase CAPTCHA는 꺼져 있으므로 VITE_TURNSTILE_SITE_KEY는 생략
```

`SUPABASE_SECRET_KEY`, DB URL, OpenAI key를 `VITE_` 변수로 만들지 않는다. Vite의 `VITE_` 값은 모두 browser bundle에서 읽을 수 있다.

## 4. 네 process 실행

각 명령은 별도 terminal에서 실행한다. Supabase container는 2단계에서 이미 실행 중이어야 한다.

### Terminal A — API

root `.env`를 Node가 직접 읽되, `tsx`는 dependency가 설치된 server package에서
해석되도록 실행한다.

```bash
pnpm --dir apps/server exec node \
  --env-file-if-exists="$PWD/.env" --import tsx --watch src/api/main.ts
```

또는 환경 변수를 현재 shell에 이미 export했다면 다음을 사용할 수 있다.

```bash
pnpm dev:server
```

### Terminal B — Worker

```bash
pnpm --dir apps/server exec node \
  --env-file-if-exists="$PWD/.env" --import tsx --watch src/worker/main.ts
```

Worker가 없으면 기본 room/message API는 사용할 수 있지만 Opening/Host, Synthesis·공식 결과, Book Context Builder와 삭제 복구 background 작업은 완료되지 않는다.

### Terminal C — Web

```bash
pnpm dev
```

Vite가 `apps/web/.env.local`을 읽고 `http://localhost:5173`에서 실행된다.

### Terminal D — 선택적 로그/검사

```bash
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
```

두 번째 요청이 실패하면 API의 Supabase URL/publishable key와 local container 상태를 먼저 확인한다.

## 5. Local Auth 준비

Local Auth 설정은 다음과 같다.

- email/password 가입 활성화
- email confirmation 비활성화
- CAPTCHA 비활성화
- site URL `http://localhost:5173`
- reset callback `http://localhost:5173/auth/reset`

가입 요청 metadata에는 반드시 `profile_name`을 보낸다.

```ts
await supabase.auth.signUp({
  email,
  password,
  options: { data: { profile_name: profileName } },
});
```

DB trigger가 같은 transaction에서 profile을 만든다. 공백 또는 누락 이름은 Auth user 생성과 함께 거절된다.

실시간 토론 smoke에는 서로 다른 email의 계정 두 개와 서로 다른 browser context가 필요하다. 일반 창과 시크릿 창 또는 서로 다른 browser profile을 사용한다.

비밀번호 reset email은 local mail UI에서 확인한다. 존재하지 않는 email을 입력해도 제품 화면은 같은 완료 안내를 보여야 한다.

## 6. 테스트 데이터 전략

현재 저장소에는 일반 제품 flow용 Supabase seed 파일이 없다. pgTAP test data는 각 test transaction용이며 프론트 개발 seed로 사용하지 않는다.

### 6.1 화면 단위 개발

서버 상태를 빠르게 재현할 때는 contract-compatible fixture와 fake adapter를 사용한다.

- session fixture: `apps/web/src/test/session-fixture.ts`
- fake session E2E: `apps/web/e2e`
- 모든 새 fixture는 대응하는 `packages/contracts` schema parse test를 둔다.

Closing, result, room, error와 Admin Builder에도 같은 방식의 fixture를 추가한다. fixture에 실제 token, email, password나 private 원문을 넣지 않는다.

### 6.2 실제 local 통합

실제 user flow는 제품 API를 통해 데이터를 만든다.

1. 방장과 참가자 계정 가입
2. Published Pack 준비
3. 방장으로 방 생성
4. 참가자 계정으로 검색·password 참가
5. 두 browser 모두 대기실 heartbeat/Realtime 연결
6. 예정 시각 이후 방장이 시작

Catalog가 비어 있으면 정상 empty state다. 방 생성에 필요한 Pack이 아직 Publish되지 않은 것이다.

### 6.3 Local Admin 준비

Admin Builder를 검증할 때만 Supabase Studio의 SQL editor에서 local 계정 하나를 승격한다.

```sql
update public.profiles
set role = 'ADMIN'
where user_id = (
  select id from auth.users where email = '<local-admin-email>'
);
```

이 SQL은 local 개발 전용이다. staging/production role 변경 절차로 사용하지 않는다.

Admin으로 Pack을 생성하면 Worker가 7단계 Builder를 처리한다. 실제 Builder 완료에는 `WORKER_DATABASE_URL`과 `OPENAI_API_KEY`가 모두 필요하다. 완료 후 Draft 검수 → Review → Publish해야 일반 `GET /v1/books`에 나타난다.

실제 모델을 사용하지 않는 프론트 개발에서는 Admin/Pack fixture를 사용하고, contract 통합 단계에서만 실제 Builder를 실행한다.

## 7. 권장 smoke 시나리오

### 7.1 기반

1. `/health/live`가 200 `ok`
2. `/health/ready`가 200 `ok`
3. web이 환경 오류 없이 열린다.
4. access token 없이 보호 API가 `401 AUTH_REQUIRED`

### 7.2 Auth·프로필

1. 프로필 이름을 포함해 가입하고 즉시 로그인
2. `GET /v1/me/profile`에서 같은 이름 확인
3. 이름 변경 후 새 이름 확인
4. 과거 메시지 작성자 snapshot은 바뀌지 않음
5. reset 요청과 local mail callback 확인

### 7.3 방·대기실

1. Published Pack 검색
2. 방 생성 후 `내 토론`과 상세에 표시
3. 다른 계정의 잘못된 password 오류
4. 올바른 password 참가와 재입장
5. PUBLIC prep은 두 계정에 보이고 AI_PRIVATE은 작성자에게만 보임
6. 방장만 설정·이전·내보내기 control 사용

### 7.4 실시간 세션

1. 두 browser에서 heartbeat 후 connected count 2 확인
2. 방장이 시작하고 두 화면이 같은 phase로 수렴
3. 메시지·inline reply·typing·Presence 확인
4. 한 browser를 offline으로 전환한 동안 메시지 전송
5. online 복귀 후 snapshot으로 누락 복구
6. 같은 `clientMessageId` retry가 한 메시지만 확정
7. 방장 연장/Synthesis/종료와 일반 참가자 control 비노출 확인

### 7.5 Closing·결과

1. Closing에서 일반 composer가 닫힘
2. 각 실제 참여자가 마지막 한 줄 저장/수정/skip
3. 타인의 body는 공식 결과 `READY` 전 보이지 않음
4. 전원 완료 또는 timeout 후 `ENDED`
5. Worker가 결과를 `READY` 또는 `INSUFFICIENT`로 확정
6. 실제 참여자만 결과를 읽고 no-show는 거절됨

### 7.6 탈퇴

1. blocker preview 확인
2. 잘못된 current password 오류
3. 허용 계정 삭제 성공 후 local cache와 Auth session 제거
4. 공동 메시지는 `탈퇴한 사용자`로 남고 AI_PRIVATE은 삭제
5. 같은 email 재가입은 새 계정이며 과거 참여와 연결되지 않음

API와 Worker가 실행 중이면 Auth hard-delete와 재가입 경계는 다음 local-only smoke로 반복 검증한다.

```bash
pnpm smoke:account-deletion
```

이 명령은 `localhost` 또는 `127.0.0.1` 외의 서비스와 production mode에서는 실행을 거부한다. 매번 고유한 임시 계정을 만들고 `가입 → 프로필 contract parse → preview → 잘못된 비밀번호 거절 → 실제 삭제 → 재로그인 불가 → 같은 email의 새 UUID 재가입`을 검증한 뒤 재가입 계정도 삭제한다. 실패 중 남은 임시 Auth user는 server-only local secret client로 정리한다.

API가 DB 준비 직후 중단된 장애 경계와 Worker 복구는 별도 local-only smoke로 확인한다. 이 명령은 API process 없이 실행하며, 임시 계정의 삭제 준비를 실제 DB에 commit한 뒤 처리 lease만 만료시켜 Worker recovery service가 Auth hard-delete와 완료 기록을 수행하는지 검증한다.

```bash
pnpm smoke:account-deletion-recovery
```

Supabase local container가 실행 중이고 root `.env`에 local `SUPABASE_*`, `WORKER_DATABASE_URL`, `COMMAND_FINGERPRINT_KEY`가 있어야 한다. smoke는 non-local URL과 production mode를 거부하고, 검증 뒤 임시 Auth user와 삭제 요청을 정리한다.

## 8. 자주 발생하는 문제

| 증상 | 확인할 것 |
| --- | --- |
| `WebEnvironmentError` | `apps/web/.env.local`의 세 VITE 변수 |
| API 시작 실패 | root `.env`, URL/key prefix, CORS URL, Node 버전 |
| `/health/ready` 503 | local Supabase container와 publishable key |
| 보호 API 401 | 같은 Supabase project의 현재 access token, 만료/refresh |
| browser CORS 오류 | `CORS_ORIGINS`에 exact `http://localhost:5173` |
| 책 검색이 항상 비어 있음 | Published Pack 존재 여부 |
| Admin API 403 | local profile의 ADMIN role |
| Builder가 멈춤 | Worker, DB URL, OpenAI key, Builder run status |
| 방 시작이 최소 인원 미달 | 두 계정의 DB heartbeat; Presence만으로는 부족 |
| Realtime subscribe 실패 | membership, access token, 종료 여부, current channel epoch |
| 메시지는 보냈는데 화면 gap | cursor recovery와 API/Realtime contract parse |
| 결과가 계속 PENDING | Worker 실행과 AI Queue 상태 |
| reset email이 없음 | local mail UI와 redirect allow-list |

## 9. 종료와 정리

개발 process를 Ctrl+C로 종료한 뒤 local Supabase를 멈출 수 있다.

```bash
pnpm db:stop
```

`db:stop`은 container를 멈추는 작업이고, `db:reset`은 데이터를 삭제하는 작업이다. reset 전에는 항상 대상이 local project인지 확인한다.

## 10. Local 통합 완료 기준

- 프론트 component가 실제 API 응답을 public Zod schema로 parse한다.
- 두 browser context에서 snapshot·Realtime·reconnect가 수렴한다.
- API/Worker를 끈 상태의 loading/error/retry UX가 안전하다.
- `AI_PRIVATE`, token, password와 content body가 console/network error reporting/analytics에 복제되지 않는다.
- `pnpm check`, 필요한 경우 `pnpm check:db`, 핵심 Playwright smoke가 통과한다.
