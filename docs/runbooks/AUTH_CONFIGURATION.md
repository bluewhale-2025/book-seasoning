# Auth 환경 설정

이 문서는 Slice 1의 Supabase Auth 환경 설정 체크리스트다. 제품 행동은
`PRODUCT_SPEC.md`, 기술 기준은 `docs/TECHNICAL_PLAN.md`와
`docs/DECISIONS.md`를 우선한다. Secret 값은 이 문서나 저장소에 기록하지
않는다.

## 공통 규칙

- Email/password 가입만 활성화하고 social provider는 활성화하지 않는다.
- Email confirmation을 비활성화한다.
- 가입 metadata의 `profile_name`은 필수다. DB trigger가 공백 이름과 Auth
  user 생성을 같은 transaction에서 거절한다.
- 브라우저의 Supabase Auth client만 access/refresh token을 보관한다.
- API는 asymmetric signing key의 JWKS로 access token을 검증한다.
- Reset 요청은 계정 존재 여부와 무관하게 같은 사용자-facing 결과를 낸다.

## Local

`supabase/config.toml`이 다음 동작을 소유한다.

- Site URL: `http://localhost:5173`
- 허용 redirect: `http://localhost:5173/**`
- Email confirmation: disabled
- Email/password signup: enabled
- Reset email: local Mailpit에서 확인
- CAPTCHA: local deterministic 개발에서는 disabled

검증 명령:

```bash
pnpm db:start
pnpm check:db
```

로컬 reset callback은 `http://localhost:5173/auth/reset`을 사용한다.

## Staging과 Production

각 환경을 독립적으로 설정하고 credential을 공유하지 않는다.

1. Email/password provider를 활성화한다.
2. Email confirmation을 비활성화한다.
3. Site URL과 reset callback allow-list를 exact deployment domain으로
   제한한다. Production에 preview wildcard를 넣지 않는다.
4. asymmetric JWT signing key를 current 상태로 승격하고 JWKS에 공개키가
   노출되는지 확인한다.
5. Supabase Auth 전역 Cloudflare Turnstile managed challenge를 가입·로그인·reset 흐름에 적용한다.
6. Supabase Auth rate limit을 staging에서 검증한 뒤 production에 적용한다.
7. Production은 Resend custom SMTP를 사용한다. 인증 전용 sending
   subdomain에 SPF, DKIM, DMARC를 설정하고 open/click tracking을 끈다.
8. Reset template에는 profile, 방, 책, 토론 정보를 넣지 않고 reset CTA만
   둔다.
9. recipient, reset URL, access/refresh token을 application log, Sentry,
   analytics에 남기지 않는다.

Turnstile secret, Resend SMTP password와 Supabase secret key는 deployment
environment에만 저장한다. 값이 없는 inventory에는 owner, environment,
service, 생성·교체 시각과 revoke 절차만 기록한다.

## Release smoke

- 새 이메일과 필수 프로필 이름으로 가입되고 즉시 로그인된다.
- 같은 이메일의 중복 가입은 사용자-facing 중복 이메일 오류로 매핑된다.
- 공백 프로필 이름은 Supabase 호출 전에 contract validation으로 거절되고,
  DB trigger도 우회 입력을 거절한다.
- access token 없이 profile API를 호출하면 `AUTH_REQUIRED`가 반환된다.
- 유효한 token으로 본인 profile만 조회·수정할 수 있다.
- 존재하는 이메일과 존재하지 않는 이메일의 reset 요청 응답이 같다.
- Mailpit 또는 staging SMTP에서 PKCE reset link를 한 번만 교환할 수 있다.
