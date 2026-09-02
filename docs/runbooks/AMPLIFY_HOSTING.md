# Web SPA Amplify Hosting

> Scope: `apps/web` staging-first static hosting
> Build source: repository root `amplify.yml`
> Header source: repository root `customHttp.yml`

## 1. App와 branch 설정

- AWS Amplify Hosting에서 private GitHub repository를 연결한다.
- 첫 배포는 `staging` branch만 연결한다.
- branch auto-build는 끈다. GitHub Actions가 DB → API·Worker → Web 순서로 `RELEASE` job을 시작한다.
- monorepo app root는 `apps/web`으로 지정하고 `AMPLIFY_MONOREPO_APP_ROOT=apps/web`인지 확인한다.
- build image는 Amazon Linux 2023을 사용한다. `amplify.yml`이 Node `24.18.0`과 pnpm `11.25.0`을 고정한다.
- branch 환경 변수에는 `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`만 넣는다. Turnstile site key는 공개값이며 secret key는 Supabase Auth 설정에만 둔다. 다른 server secret에는 `VITE_` prefix를 붙이지 않는다. Cloudflare test site key는 배포 build가 거절한다.
- GitHub `staging` Environment variable에는 `AMPLIFY_APP_ID`를 둔다. OIDC role에는 해당 app·branch의 `amplify:GetApp`, `GetBranch`, `StartJob`, `GetJob`, `StopJob`만 추가한다.

`amplify.yml`은 workspace root에서 install·build하고 `apps/web/dist`만 artifact로 배포한다. build 전에 공개 환경값의 URL·key 형식을 확인하고, build 뒤에는 source map과 server-only marker가 artifact에 없는지 검사한다.

배포 workflow는 시작 직후와 polling 중 Amplify job의 `commitId`가 검증한 `GITHUB_SHA`와 같은지 확인한다. 다르면 job을 중단하고 web을 배포하지 않는다.

## 2. SPA rewrite

Amplify Console의 `Hosting → Rewrites and redirects`에 다음 규칙을 한 번 등록한다. 파일 확장자가 있는 정적 asset 요청은 제외하고 React Router route만 `/index.html`로 rewrite한다.

```json
[
  {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|jpeg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>",
    "status": "200",
    "target": "/index.html",
    "condition": null
  }
]
```

저장 후 `/auth/login`, `/discussions`, `/profile`을 주소창에서 직접 열어 모두 200과 앱 shell로 응답하는지 확인한다. 잘못된 asset URL은 HTML 200으로 바뀌지 않아야 한다.

## 3. Header와 cache 확인

`customHttp.yml`은 모든 응답에 CSP, HSTS, clickjacking·MIME·referrer·browser permission 제한을 적용한다. Vite hashed `/assets/*`는 1년 immutable cache, HTML과 route response는 즉시 재검증한다.

배포 뒤 다음을 확인한다.

```bash
curl --fail --head https://staging.book-seasoning.com/auth/login
curl --fail --head https://staging.book-seasoning.com/assets/<actual-hashed-file>.js
```

- route response: `Content-Security-Policy`, `Strict-Transport-Security`, `Cache-Control: public, max-age=0, must-revalidate`
- hashed asset: `Cache-Control: public, max-age=31536000, immutable`
- browser console: CSP 위반 없이 Supabase HTTPS·Realtime WSS, staging API와 Cloudflare Turnstile만 연결

## 4. Staging smoke

1. 가입·로그인·reset Managed Turnstile, 로그아웃과 reset callback
2. 보호 route 직접 진입과 새로고침
3. API CORS와 Supabase Auth·Realtime 연결
4. 방 검색·참가·대기실·session reconnect
5. 프로필 변경과 계정 탈퇴
6. 이전 정적 asset과 새 `index.html` 사이의 배포 혼합이 없는지 확인

실패하면 Amplify 직전 배포 version으로 web만 rollback하고 API·DB 상태는 임의 변경하지 않는다.
