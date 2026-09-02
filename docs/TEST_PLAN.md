# 책은양념 MVP 테스트 계획

> Product source of truth: `PRODUCT_SPEC.md`  
> Shared technical baseline: `docs/TECHNICAL_PLAN.md`  
> Last updated: 2026-09-02

## 1. 목적

이 문서는 구현 계획의 테스트 기준을 실행 가능한 명령과 fixture에 연결한다. 개인정보·권한·공식 결과 불변성은 허용 임계값 없이 차단하고, 성능·지연은 local smoke와 release qualification을 구분해 기록한다.

## 2. Slice 3 실시간 토론 검증

### 2.1 정적·컴포넌트 회귀

- `pnpm check`: 전체 lint, typecheck, Vitest, production build
- web Vitest: public contract parse, 공식 projection duplicate/gap, reconnect merge, 과거 page merge, pending/failed/same-ID retry, 알려진 참가자의 typing 표시
- DB pgTAP: 공식 topic client write 거절, ephemeral membership RLS, outsider/removed/ended/canceled 접근, 최근 100개·과거 50개·event gap 200개, public payload canary

### 2.2 브라우저 E2E

`pnpm --filter @bookseasoning/web test:e2e`는 production feature와 같은 component/hook에 contract-compatible fake HTTP/SSE adapter를 연결한다.

- 서로 다른 Playwright browser context의 typing·inline reply·message 수렴
- 한 context가 닫힌 동안 확정된 message를 재입장 snapshot으로 복구
- transient failure 후 같은 `clientMessageId` 재사용과 한 건 확정
- WCAG A/AA axe smoke

fake adapter는 전달 순서를 재현하기 위한 테스트 경계이며 실제 권한을 대체하지 않는다. 실제 private topic/RLS는 pgTAP과 다음 Supabase harness가 담당한다.

### 2.3 실제 Supabase Realtime harness

- runner: `apps/web/scripts/realtime-load.mjs`
- local 인증 wrapper: `apps/web/scripts/realtime-load-local.mjs`
- 고정 합성 fixture: `apps/web/scripts/realtime-load-fixture.sql`
- report에는 client/session 수, active sender 수, send/receive 수, delivery ratio, join p50/p95와 typing delivery p50/p95만 남기며 token·message body는 남기지 않는다.
- 기본 threshold는 join p95 3초 이하, 수신된 typing p95 1초 이하, 정상 profile delivery 95% 이상이다.

2026-09-02 local smoke 결과:

| Profile | 결과 | Join p95 | Typing p95 | Delivery |
| --- | --- | ---: | ---: | ---: |
| 10 client / 1 session / 짧은 smoke | PASS | 61.7ms | 5.0ms | 100% |
| 60 client / 4 sessions / active sender 6 / 30초 | PASS | 208.5ms | 11.5ms | 100% |
| 15 client / 1 session / active sender 3 / 15초 | PASS | 65.2ms | 5.0ms | 100% |

60 client를 한 session에 두고 전원이 동시에 typing한 진단 profile은 local Realtime의 message-per-second 제한을 재현했다. 이는 정상 60명 profile이 아니라 최대 방 인원 15명을 위반한 모델이므로 정상 기준에는 사용하지 않는다. 단일 방에서는 ephemeral typing 손실이 공식 상태를 바꾸지 않아야 하며, 공식 event 손실은 snapshot/cursor로 수렴해야 한다.

release candidate에서는 60 client·30분 normal, 100 client·10분 stress와 최대 15명 단일 방 burst를 staging에서 반복한다. 장시간 실행 결과와 provider quota는 release report에 별도로 보존한다.

## 3. Slice 6~8 서버 출시 차단 회귀

### 3.1 종료·공식 결과

- Synthesis 실패가 Closing 진입을 막지 않음
- Closing 본인 reflection revision/skip, 타인 비공개, 전원 응답 조기 종료와 5분 timeout
- Final Wiki와 Discussion Record의 single finalization, official result `READY` 이후 수정·재생성 거절
- 실제 참여자만 결과 조회, 익명 이름과 evidence/reference 정합성
- `pnpm eval:results:live`는 Synthesis·Discussion Record를 실제 model로 생성해 schema, evidence subset, 이름·private canary 비노출을 검증하고 원문을 출력하지 않음

### 3.2 Book Context Builder

- 7단계 run/job lease, retry/poison archive와 queue envelope의 content-free 계약
- source/evidence reference, FACT/INTERPRETATION, Tier와 uncertainty/conflict 보존
- regeneration이 Draft를 덮지 않고 proposal로 남으며 item scope 밖 변경을 거절
- Review 전 Publish, hard blocker, Published mutation 거절과 exact version pin
- `pnpm eval:builder:live`는 web research → structured Draft → canonical validation을 실제 model로 확인하고 원문을 출력하지 않음

### 3.3 계정 탈퇴·retention

- blocker와 current password, command replay/payload mismatch
- AI_PRIVATE 삭제, PUBLIC 공동 기여·reply·Closing·event 익명화
- Auth hard delete 실패의 durable worker recovery
- 같은 이메일의 새 UUID 가입과 과거 participant identity 비연결
- restore tombstone 멱등 재적용과 37일 만료
- 세션 종료 90일 뒤 AI diagnostic 원문 purge와 익명 집계

### 3.4 운영 artifact

- Docker image 안에서 API live/ready와 worker SIGTERM graceful shutdown smoke
- backup/restore/deploy/rollback script `bash -n`과 destructive guard
- migration reset 뒤 전체 pgTAP
- release manifest에 secret/user/provider 원문이 포함되지 않음

2026-09-02 완료 기준으로 `pnpm check`의 code test 259개(contracts 45, domain 10, server 189, web 15)와 24개 SQL file의 pgTAP 695개 assertion이 통과했다. 실제 model eval에서는 Evaluator·Opening·Host, Synthesis·Discussion Record, Builder research·draft의 canonical/safety gate가 모두 통과했다.

## 4. 합성 데이터 정리

Realtime local fixture는 `b0...` UUID와 `realtime-load@example.test`만 사용한다. 검증 후 `pnpm db:reset`으로 local 합성 데이터와 임시 Realtime row를 제거하고 전체 pgTAP을 다시 실행한다. staging에서는 run별 prefix를 쓰고 harness 종료 후 해당 합성 aggregate만 삭제한다.
