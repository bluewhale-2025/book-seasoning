# Server incident response

## 우선순위

1. AI_PRIVATE·token·secret 노출과 무권한 데이터 접근을 먼저 차단한다.
2. 인간 채팅, 세션 종료와 공식 기록 원본을 가능한 한 유지한다.
3. 중복 AI 메시지·결과·Publish를 막기 위해 worker를 중지해도 Queue row를 삭제하지 않는다.
4. 추측으로 DB row를 수정하지 않고 request/job/deployment id와 stable error code로 범위를 확인한다.

## 즉시 조치

- API readiness 실패: liveness, Supabase status, migration head, key 상태를 분리 확인한다.
- worker heartbeat 누락: process 상태, DB session pool, Queue backlog와 stale lease를 확인한다.
- AI provider 장애: 자동 개입/Builder flag를 끄고 인간 토론은 유지한다. provider 원문 오류를 사용자에게 노출하지 않는다.
- Realtime 장애: authoritative snapshot/cursor 경로를 유지하고 Broadcast를 원본으로 취급하지 않는다.
- privacy 의심: 관련 worker와 public output 경로를 중지하고 secret/token을 회수한 뒤 AI_PRIVATE canary 및 access log를 조사한다.
- 잘못된 migration: application을 호환 version으로 되돌리거나 forward-fix한다. production down migration은 금지한다.

## Secret rotation

- Supabase publishable key: 새 key 배포 → web/API 확인 → 이전 key revoke.
- Supabase secret key: worker/API 새 deployment 확인 → 이전 key revoke.
- OpenAI key: 새 worker deployment에서 live eval의 safe report 확인 → 이전 key revoke.
- command fingerprint key는 idempotency receipt 검토 없이 즉시 교체하지 않는다. 교체 release boundary와 기존 receipt 처리 계획을 먼저 정한다.
- AWS OIDC role은 access key를 발급하지 않고 trust subject와 permission policy를 수정한다.

secret 값, access token, email, prompt, AI_PRIVATE, provider response body는 incident 문서·채팅·ticket에 붙이지 않는다.

## 복구 완료 조건

- API live/ready와 worker heartbeat 정상
- migration head와 release manifest 일치
- Queue backlog 감소, stale lease 회수, 중복 확정 없음
- 로그인·catalog·room/session snapshot과 종료 smoke 통과
- AI_PRIVATE canary 비노출
- 계정 삭제/tombstone과 공식 결과·Published Pack 불변성 확인
- 원인, 영향 범위, 조치, 재발 방지와 추가 test를 기록
