# Production backup·restore drill

이 절차는 `docs/DECISIONS.md` TECH-019의 실행 문서다. 내부 목표는 RPO 24시간, RTO 8시간이며 외부 SLA가 아니다. production dump를 개인 PC, GitHub artifact, application log 또는 저장소에 보관하지 않는다.

## Backup 구성

- `scripts/backup-supabase.sh`는 Supabase `roles.sql`, `schema.sql`, `data.sql`을 별도로 생성해 하나의 압축 archive로 만든다.
- archive는 AWS 서울 리전 private S3 bucket에 TLS로 전송하고 SSE-KMS를 강제한다.
- object metadata에는 content SHA-256, backup reason, migration head만 기록한다.
- GitHub workflow는 매일 03:23 KST에 DB backup, 매시 8분에 restore tombstone snapshot을 실행한다.
- S3 lifecycle은 `infra/aws/backup-lifecycle.json`의 DB 30일, tombstone 37일 규칙을 적용한다.
- backup job의 AWS role은 대상 prefix write/head와 KMS encrypt에 필요한 최소 권한만 가진다.

필수 GitHub production 설정:

- secret: `AWS_BACKUP_ROLE_ARN`, `SUPABASE_BACKUP_DB_URL`, `BACKUP_KMS_KEY_ID`
- variable: `BACKUP_S3_BUCKET`
- OIDC trust는 production Environment subject와 repository로 제한

backup 성공은 upload exit code뿐 아니라 `head-object` 확인까지 포함한다. age, 크기 급변, 실패를 alert 대상으로 연결한다.

## 삭제 restore tombstone

`scripts/export-restore-tombstones.sh`는 아직 37일이 지나지 않은 탈퇴자의 `former_user_id`와 분리된 participant identity id만, 재적용 가능한 SQL로 내보낸다. 이메일·이름·메시지·AI_PRIVATE 내용은 포함하지 않는다.

복원 후 `private.reapply_account_deletion_tombstone`은 다음을 멱등적으로 다시 적용한다.

- 복원된 Auth/profile 삭제
- AI_PRIVATE 본문과 entry 삭제
- PUBLIC prep, 채팅, Closing 작성자 익명화
- reply/event snapshot 익명화
- connection과 AI 도움 actor 연결 제거

같은 이메일로 재가입한 새 UUID 계정은 과거 participant identity와 연결하지 않는다.

## Restore drill 절차

1. 외부 AI, SMTP, Sentry, GA가 비활성화된 별도 임시 cloud DB를 준비한다.
2. maintenance/read-only를 확인하고 API·worker·Cron이 대상 DB에 접속하지 않게 한다.
3. 복원할 DB archive와 그 이후 시점의 최신 tombstone snapshot S3 URI를 고정한다.
4. 다음 이중 확인을 설정한 뒤 `pnpm ops:restore-drill`을 실행한다.

```bash
RESTORE_TARGET_CLASS=ephemeral-drill
CONFIRM_RESTORE=RESTORE_EPHEMERAL_DRILL
```

5. script가 roles → schema → data → 현재 migration → tombstone 순서로 적용한다.
6. Auth/JWKS, RLS, Realtime, Queue, stale lease, command receipt, official result와 Published Pack 불변성을 확인한다.
7. 삭제된 계정·AI_PRIVATE가 부활하지 않았고 공동 기여가 익명인지 표본과 query로 확인한다.
8. API readiness와 worker heartbeat 뒤 synthetic smoke를 실행한다.
9. drill 일시, archive key, migration head, 소요 시간, 검증 결과만 기록하고 임시 환경을 제거한다.

실제 production target에는 `restore-drill.sh`를 사용하지 않는다. production 복구는 incident commander 승인, 별도 maintenance 절차와 exact target 검증을 거쳐 같은 순서를 수동으로 수행한다.

## 출시 차단 조건

- 마지막 성공 DB backup이 24시간보다 오래됨
- 최신 tombstone snapshot을 읽거나 재적용하지 못함
- restore drill에서 Auth/RLS/Queue 또는 privacy 검증 실패
- S3 public access block, KMS, lifecycle, OIDC 최소 권한 미설정
- DB 400MB 또는 주요 Free quota 80% 도달 전에 upgrade 계획 없음
