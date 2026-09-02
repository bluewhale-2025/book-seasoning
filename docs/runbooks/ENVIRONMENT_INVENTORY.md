# 배포 환경 인벤토리

> Status: D1 in progress — staging-first rollout  
> Last updated: 2026-09-02  
> Scope: staging·production의 도메인, 클라우드 자원, 설정과 secret 소유 위치

이 문서는 배포 환경의 이름과 연결 관계를 기록한다. 실제 secret 값, 비밀번호, API key, DB URL은 이 문서와 저장소에 기록하지 않는다.

## 1. 확정된 도메인

| 용도 | Production | Staging |
| --- | --- | --- |
| Web SPA | `https://book-seasoning.com` | `https://staging.book-seasoning.com` |
| API | `https://api.book-seasoning.com` | `https://api-staging.book-seasoning.com` |
| Supabase Auth 발신 도메인 | `auth.book-seasoning.com` | `auth.book-seasoning.com` |

- 루트 도메인 `book-seasoning.com`을 Production Web SPA의 정식 주소로 사용한다.
- `www.book-seasoning.com`을 사용하게 되면 별도 앱을 두지 않고 `https://book-seasoning.com`으로 리다이렉트한다.
- 도메인 등록 및 현재 DNS 관리는 가비아에서 수행한다.
- Auth 발신 도메인은 Resend에서 환경별 발신 주소를 분리하되 동일한 검증 도메인을 사용할 수 있다.
- 로컬 Web origin은 `http://localhost:5173`, 로컬 API는 `http://localhost:3000`을 유지한다.

## 2. 현재 배포 범위

첫 배포 준비에서는 staging만 구성한다.

- 지금 생성·연결: staging Supabase, staging Lightsail, Amplify `staging` branch, staging GitHub Environment, staging DNS와 TLS
- 지금 보류: production Supabase·Lightsail·backup 자원, Production Web/API DNS, production secret과 배포 승인 규칙
- production 자원 이름과 도메인은 예약된 계획으로만 유지하며 staging 검증이 끝나기 전에는 생성하지 않는다.

## 3. DNS 레코드 계획

실제 target은 Amplify·Lightsail·Resend 자원을 만든 뒤 공급자가 제시한 값을 입력한다. target을 추측해서 먼저 만들지 않는다.

| Host | 목적 | 예상 방식 | 상태 |
| --- | --- | --- | --- |
| apex (`@`) | Production Amplify branch | Amplify가 안내하는 apex alias/검증 레코드 | 보류 |
| `www` | Production root redirect | DNS/hosting redirect | 보류 |
| `staging` | Staging Amplify branch | Amplify가 안내하는 CNAME/검증 레코드 | 미연결 |
| `api` | Production Lightsail API | Lightsail custom domain/인증서 연결 | 보류 |
| `api-staging` | Staging Lightsail API | Lightsail custom domain/인증서 연결 | 미연결 |
| `auth` | Resend 발신 도메인 | Resend가 안내하는 SPF·DKIM 레코드 | staging 설정 시 연결 |

DNS 레코드는 가비아 DNS 관리 화면에서 변경한다. 등록할 실제 값은 각 공급자가 발급한 값을 그대로 사용하고, 저장 전 host·record type·target을 이 문서와 대조한다.

TLS 인증서가 활성화되고 HTTPS 응답을 확인하기 전에는 프론트엔드의 API base URL이나 Supabase redirect allow-list를 해당 cloud 환경 값으로 전환하지 않는다.

## 4. 환경별 자원 이름

| 공급자 | Staging | Production | 상태 |
| --- | --- | --- | --- |
| Supabase project | `bookseasoning-staging` | `bookseasoning-production` | Seoul staging 생성·25개 migration·원격 pgTAP 완료 / production 보류 |
| Lightsail Container Service | `bookseasoning-staging` | `bookseasoning-production` | Seoul Micro × 1 생성 완료, 첫 deployment 대기 / production 보류 |
| Amplify app | `bookseasoning-web`의 `staging` branch | `bookseasoning-web`의 `main` branch | staging 생성 필요 / production 보류 |
| GitHub Environment | `staging` | `production` | staging 생성 필요 / production 보류 |
| S3 backup bucket | 해당 없음 | `bookseasoning-production-backups-<aws-account-id>` | production까지 보류 |
| KMS alias | 해당 없음 | `alias/bookseasoning-production-backup` | production까지 보류 |

- 모든 AWS 자원은 원칙적으로 서울 리전 `ap-northeast-2`에 둔다.
- GitHub source repository는 private `bluewhale-2025/book-seasoning`을 사용한다.
- 이 AWS 계정은 신규 고객 Free Tier credit 대상이 아니다. staging 자원은 처음부터 종량제 과금을 전제로 하고, 개별 서비스의 무료 월간 한도나 trial은 Billing에서 실제 적용이 확인된 경우에만 비용 계획에 반영한다.
- Supabase staging과 production은 서로 다른 project·database·Auth user·Realtime channel·secret을 사용한다.
- production 배포는 GitHub `production` Environment의 승인 규칙을 통과해야 한다.

## 5. Origin과 인증 설정값

| 설정 | Staging | Production |
| --- | --- | --- |
| Web origin | `https://staging.book-seasoning.com` | `https://book-seasoning.com` |
| API base URL | `https://api-staging.book-seasoning.com` | `https://api.book-seasoning.com` |
| API `CORS_ORIGINS` | `https://staging.book-seasoning.com` | `https://book-seasoning.com` |
| Web `VITE_API_BASE_URL` | `https://api-staging.book-seasoning.com` | `https://api.book-seasoning.com` |
| Web `VITE_TURNSTILE_SITE_KEY` | staging widget의 공개 site key | production widget의 공개 site key |
| Auth Site URL | `https://staging.book-seasoning.com` | `https://book-seasoning.com` |
| Password reset redirect | `https://staging.book-seasoning.com/auth/reset` | `https://book-seasoning.com/auth/reset` |

Supabase의 redirect allow-list에는 각 환경의 정확한 HTTPS 주소와 필요한 로컬 개발 주소만 등록한다. staging에 production callback을, production에 staging callback을 교차 등록하지 않는다.

## 6. 설정과 secret의 저장 위치

### Browser에 공개 가능한 값

Amplify branch 환경 변수로 관리한다.

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_TURNSTILE_SITE_KEY`

### Lightsail runtime secret

GitHub Environment secret에서 배포 시 주입하며 이미지나 파일에 넣지 않는다.

- `SUPABASE_SECRET_KEY`
- `WORKER_DATABASE_URL`
- `OPENAI_API_KEY`
- `COMMAND_FINGERPRINT_KEY`

`COMMAND_FINGERPRINT_KEY`는 환경마다 별도로 생성하고, 일반 배포 때 재생성하지 않는다. 변경 시 기존 idempotency fingerprint와의 호환 영향을 먼저 검토한다.

### Lightsail runtime 일반 설정

- `NODE_ENV`
- `SERVER_HOST`, `SERVER_PORT`, `LOG_LEVEL`
- `RELEASE_VERSION`
- `CORS_ORIGINS`
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
- OpenAI model·prompt alias와 timeout

### GitHub Actions 전용 secret

- 환경별 migration용 `SUPABASE_DB_URL`
- production backup용 `SUPABASE_BACKUP_DB_URL`
- staging·production 배포용 AWS OIDC role ARN
- staging Amplify app ID
- backup용 AWS OIDC role ARN, S3 bucket, KMS key ARN

AWS 인증은 GitHub OIDC를 사용하고 장기 Access Key를 GitHub나 container에 저장하지 않는다.

### 외부 공급자 내부 설정

- Resend API key와 SMTP credential
- Cloudflare Turnstile site key·secret key
- Sentry DSN·auth token(도입 시)
- GA4 measurement ID(도입 시)

## 7. D1 완료 체크리스트

- [x] 루트 도메인 확정
- [x] production·staging Web/API/Auth 도메인 규칙 확정
- [x] 첫 배포 범위를 staging으로 제한
- [x] DNS 관리 서비스 확정: 가비아
- [ ] 가비아 계정 접근, MFA와 복구 수단 확인
- [x] AWS Paid plan 계정과 결제 수단 준비 완료
- [x] AWS 신규 고객 Free Tier credit 미대상 확인
- [x] AWS 계정 활성화와 Paid account plan 전환 완료
- [ ] AWS root MFA와 복구 수단 확인 — 사용자 요청으로 후순위 보류, staging 공개 전 완료 필요
- [ ] AWS Budget 비용 알림 설정
- [x] Supabase 계정 준비 완료
- [x] Supabase `bookseasoning-staging`을 Seoul `ap-northeast-2`에 생성
- [x] Seoul staging CLI 연결 및 25개 migration 적용
- [x] Seoul staging migration local/remote 이력 일치 확인
- [x] Supabase staging 원격 pgTAP 도구 활성화 후 24개 SQL test·699 assertions 통과
- [x] 기존 staging이 Tokyo `ap-northeast-1`임을 확인 — 사용자 데이터 없음, 교체 대상
- [x] Supabase staging Seoul 리전·`ACTIVE_HEALTHY` 확인
- [x] Supabase staging Free plan 확인
- [x] Supabase staging Email 가입 활성화·email confirmation 비활성화
- [x] Supabase staging JWT current key를 ECC P-256(`ES256`)으로 전환하고 JWKS 공개 확인
- [ ] Supabase staging project 소유자 확인
- [x] GitHub repository 기록: private `bluewhale-2025/book-seasoning`
- [ ] OpenAI staging project/key 소유자 확인
- [x] Resend 계정과 인증 발신 도메인 `auth.book-seasoning.com` 검증
- [x] 인증 발신 주소를 `no-reply@auth.book-seasoning.com`으로 확정
- [x] Resend와 Supabase staging custom SMTP 연결
- [ ] staging HTTPS reset callback 연결 후 reset mail smoke
- [x] Cloudflare 계정과 staging Turnstile widget `bookseasoning-staging-auth` 생성
- [ ] Turnstile site 소유자 기록과 signup/login/reset 전역 적용 E2E
- [x] Amplify build/header 설정과 GitHub staging release gate 준비
- [x] Amplify staging app·branch 생성, auto-build 비활성화, `AMPLIFY_APP_ID` 등록과 SPA rewrite 직접 진입 확인
- [ ] Sentry 도입 여부 확정
- [ ] GA4 초기 도입 여부 확정

production 승인자, production key, backup·장애 복구 담당자는 production 준비를 시작할 때 별도 확정한다.

계정 식별자와 담당자 이름은 기록할 수 있지만 credential과 복구 코드는 기록하지 않는다. 위 staging 항목이 채워지면 D1을 완료하고 D2에서 staging 자원을 생성한다.
