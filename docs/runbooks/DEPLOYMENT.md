# API·Worker 배포와 롤백

제품 요구사항은 `PRODUCT_SPEC.md`, 공통 배포 기준은 `docs/TECHNICAL_PLAN.md` §15를 우선한다. 실제 secret 값과 production `.env` 파일은 저장소·이미지·release manifest에 만들지 않는다.

환경별 도메인·자원 이름·설정 소유 위치는 배포 전에 `docs/runbooks/ENVIRONMENT_INVENTORY.md`에서 확정한다.

## 배포 단위

- 저장소 루트 `Dockerfile` 하나로 server image를 한 번 빌드한다.
- public API command는 `node dist/api/main.js`다.
- non-public worker command는 `node dist/worker/main.js`다.
- API만 port 3000을 공개하고 Lightsail health check는 `/health/ready`를 사용한다.
- `/health/live`는 Node process 생존, `/health/ready`는 Supabase REST 의존성 접근 가능 여부를 뜻한다.
- worker 생존은 30초 주기의 `worker.heartbeat`와 Queue backlog·stage 진행으로 따로 확인한다.

## 사전 조건

1. `pnpm check`와 `pnpm check:db`가 같은 Git SHA에서 통과한다.
2. Evaluator·Opening·Host의 prompt/model/schema/Policy 변경 release는 `pnpm eval:ai:live`를 통과한다.
3. Synthesis·Discussion Record 변경 release는 `pnpm eval:results:live`를 통과한다.
4. Builder 변경 release는 `pnpm eval:builder:live`를 통과한다.
5. staging과 production은 별도 Supabase project, Lightsail service, runtime secret을 사용한다.
6. AWS 접근은 GitHub OIDC role을 사용한다. container에 AWS access key를 넣지 않는다.
7. production migration 직전 `BACKUP_REASON=pre-migration pnpm ops:backup`이 성공해야 한다.

## Image build와 local smoke

```bash
docker build --tag bookseasoning-server:<git-sha> .
```

API와 worker는 같은 image digest여야 한다. API는 test environment에서 live/ready를 확인하고, worker는 `docker stop`의 SIGTERM 뒤 `worker.stopped`가 남는지 확인한다.

## 배포 순서

1. release Git SHA를 확정하고 image를 빌드한다.
2. production이면 migration 전 논리 backup과 restore tombstone export를 성공시킨다.
3. backward-compatible migration을 `supabase db push --db-url ...`로 적용한다.
4. image를 대상 Lightsail service에 등록하고 exact image reference를 확인한다. `latest`를 release manifest에 기록하지 않는다.
5. 다음 runtime 값을 GitHub Environment secret/variable에서 주입하고 `pnpm ops:deploy`를 실행한다.
6. `/health/ready`, migration head, worker heartbeat, AI Queue와 Builder Queue를 확인한다.
7. 로그인·catalog·방 조회와 합성 command smoke를 실행한다.
8. web을 배포하고 동일 contract version인지 확인한다.
9. `pnpm release:manifest`로 Git SHA, image digest/reference, migration head, AI alias를 기록한다.

`scripts/deploy-lightsail.sh`는 동일 image로 API·worker container 정의를 만들며, 생성한 secret 포함 임시 JSON은 종료 시 삭제한다. 필요한 환경 변수는 script의 `required` 목록이 유일한 실행 계약이다.

## Rollback

Application rollback은 `ROLLBACK_DEPLOYMENT_VERSION`을 exact version으로 지정하고 `CONFIRM_ROLLBACK=<service>:<version>`을 맞춘 뒤 `pnpm ops:rollback`으로 실행한다.

- production DB에 automatic down migration을 실행하지 않는다.
- 이전 deployment가 새 schema와 호환되는지 먼저 확인한다.
- 호환되지 않으면 현재 application을 유지하고 forward-fix migration을 배포한다.
- AI prompt 문제는 model/prompt alias를 이전 값으로 되돌리되 이미 확정된 AI 메시지·공식 결과·Published Pack은 수정하지 않는다.
- rollback 뒤에도 readiness, worker heartbeat, Queue lease, command idempotency와 Realtime snapshot을 smoke한다.

## Release manifest 필수 값

- `RELEASE_VERSION`, `GIT_SHA`
- exact `IMAGE_REFERENCE`, `IMAGE_DIGEST`
- `MIGRATION_HEAD`
- Evaluator/Host model alias와 prompt alias

manifest에는 secret, DB URL, Supabase key, OpenAI key, 사용자 데이터와 provider response id를 넣지 않는다.
