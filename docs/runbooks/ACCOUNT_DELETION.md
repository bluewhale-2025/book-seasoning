# 계정 탈퇴 운영

제품 기준은 `PRODUCT_SPEC.md` §17.1과 `docs/DECISIONS.md` PRODUCT-029다.

## 사용자 flow

1. `GET /v1/me/account/deletion-preview`가 영향 개수와 blocker를 반환한다.
2. ADMIN, 진행 중 실제 참여자, 종료되지 않은 방의 방장은 먼저 역할·세션·방 상태를 정리한다.
3. `DELETE /v1/me/account`는 current password와 `confirmPermanentDeletion: true`, command id를 요구한다.
4. password는 본 요청과 분리된 non-persistent Supabase client로 확인한다.
5. DB transaction이 private 삭제·공동 기여 익명화·connection 회수와 durable deletion request를 먼저 확정한다.
6. API가 Auth identity를 hard delete하고 request를 완료한다. 실패하면 worker가 lease/retry로 이어서 처리한다.

## 보존과 삭제

- 즉시 삭제: Auth identity, email/password 정보, profile/settings, 모든 AI_PRIVATE prep.
- 익명 보존: PUBLIC prep, participant message, Closing 마지막 한 줄, 공동 공식 결과.
- 표시 이름은 `탈퇴한 사용자`로 바꾸며 participant identity는 Auth와 FK가 끊긴 pseudonymous UUID로만 남긴다.
- AI 진단 원문·근거·provider metadata는 세션 종료 90일 뒤 익명 일일 집계만 남기고 purge한다.
- restore tombstone은 37일 뒤 former user 연결을 제거한다.
- 탈퇴 후 같은 이메일은 새 Auth UUID로 다시 가입할 수 있지만 과거 참여·기록과 연결하지 않는다.

## 장애 대응

- API가 `ACCOUNT_DELETION_PENDING`을 반환하면 request row의 status/attempt/error code만 확인한다. 사용자 email이나 private 원문을 운영 로그에 남기지 않는다.
- worker의 `worker.account_deletion_retry_scheduled`와 `worker.account_deletion_recovery_failed`를 alert한다.
- 10회 소진된 `FAILED`는 Auth 존재 여부를 먼저 확인한 후 `claim_pending_account_deletions`와 같은 멱등 경계로 복구한다. row를 임의 수정해 완료로 위장하지 않는다.
- 공동 메시지 본문을 삭제하거나 공식 결과 전체를 재생성하지 않는다.
- 복원 사고에서는 최신 외부 tombstone을 서비스 재개 전에 재적용한다.

## 검증

- `supabase/tests/account_deletion_retention.sql`은 blocker, private 삭제, 공동 기여·reply·Closing 익명화, Auth hard delete, 같은 이메일의 새 계정 분리, worker completion, tombstone replay/expiry와 90일 진단 purge를 검증한다.
- privacy 검증 실패는 허용 임계값 없이 출시를 차단한다.
