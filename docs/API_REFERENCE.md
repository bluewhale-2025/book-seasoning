# 프론트엔드 HTTP API Reference

> Status: Implemented API reference  
> Runtime contract source: `packages/contracts`  
> Server route source: `apps/server/src/modules/**/**.controller.ts`  
> Last verified: 2026-09-02

## 0. 사용 규칙

이 문서는 endpoint와 contract의 연결표다. 필드 정의를 복제하지 않으며 다음 파일이 wire model의 기준이다.

| 영역 | Canonical schema |
| --- | --- |
| 공통 오류·health | `packages/contracts/src/public/error.ts`, `health.ts` |
| 프로필 | `packages/contracts/src/public/profile.ts` |
| 책 catalog | `packages/contracts/src/public/book.ts` |
| 방·대기실·사전 입력 | `packages/contracts/src/public/room.ts` |
| 세션·메시지·event | `packages/contracts/src/public/session.ts` |
| Closing·공식 결과 | `packages/contracts/src/public/result.ts` |
| 계정 탈퇴 | `packages/contracts/src/public/account.ts` |
| Admin Builder | `packages/contracts/src/admin/book-builder.ts` |

프론트는 `@bookseasoning/contracts/public` 또는 `/admin` package export를 사용하고 `apps/server`, DB row, `contracts/internal`을 import하지 않는다.

## 1. 공통 HTTP 계약

### 1.1 Base URL과 인증

- API base URL은 `VITE_API_BASE_URL`이다. Local 기본값은 `http://localhost:3000`이다.
- `/health/live`, `/health/ready`를 제외한 모든 endpoint는 인증이 필요하다.
- 인증 header는 `Authorization: Bearer <Supabase access token>`이다.
- JSON body가 있으면 `Content-Type: application/json`을 보낸다.
- `DELETE` endpoint 중 body contract가 있는 요청도 JSON body와 content type을 함께 보낸다.
- Nest의 method별 기본 success status에 결합하지 말고 모든 `2xx`를 성공으로 처리한 뒤 schema를 parse한다.
- 응답 header `x-request-id`와 오류 body의 `requestId`는 장애 문의 상관관계용이다. analytics 사용자 식별자로 사용하지 않는다.

### 1.2 오류 envelope

모든 사용자-facing HTTP 오류는 다음 schema로 parse한다.

```ts
type PublicError = {
  code: string;
  message: string;
  requestId?: string;
  aggregateVersion?: number;
};
```

`message`는 안전하게 공개할 수 있지만 제어 흐름은 `code`를 사용한다. 알 수 없는 body는 `REQUEST_FAILED`, 성공 body parse 실패는 `INVALID_SERVER_RESPONSE`, fetch 실패는 client-local `NETWORK_UNAVAILABLE`로 정규화한다.

### 1.3 멱등성과 optimistic concurrency

| 필드 | 사용처 | 규칙 |
| --- | --- | --- |
| `commandId` | 상태 변경 command | 새 사용자 의도마다 UUID 생성, 동일 payload 재시도에는 보존 |
| `clientMessageId` | 메시지 전송 | pending/failed/retry 동안 같은 UUID 유지 |
| `expectedVersion` | 방 설정·관리 | 최신 `RoomDetail.aggregateVersion` 사용 |
| `expectedPhaseVersion` | 세션·Closing | 최신 `SessionSnapshot.state.phaseVersion` 사용 |
| `expectedRevision` | prep·Closing·Builder | 최신 대상 revision 사용 |
| `duplicate` | command 응답 | 기존 성공 결과 재생이며 정상 성공으로 처리 |

같은 ID를 다른 payload에 쓰면 `409 COMMAND_PAYLOAD_MISMATCH`다. stale version 오류는 자동으로 local merge하지 말고 최신 detail/snapshot을 다시 조회한다.

## 2. 공개 health

| Method | Path | Auth | Request | Response | 의미 |
| --- | --- | --- | --- | --- | --- |
| GET | `/health/live` | 없음 | 없음 | `HealthStatusSchema` | API process 생존 |
| GET | `/health/ready` | 없음 | 없음 | `HealthStatusSchema` | Supabase REST 의존성 readiness |

`/health/ready`는 준비되지 않으면 HTTP 503과 `{ status: "not_ready", ... }`를 반환한다. browser 제품 화면의 일반 health polling 용도가 아니라 배포·운영 probe다.

## 3. 프로필·책·계정

| Method | Path | 권한 | Request | Response | Cache 동작 |
| --- | --- | --- | --- | --- | --- |
| GET | `/v1/me/profile` | 로그인 본인 | 없음 | `ProfileSchema` | `profile` 저장 |
| PATCH | `/v1/me/profile` | 로그인 본인 | `UpdateProfileRequestSchema` | `ProfileSchema` | response로 `profile` 교체 |
| GET | `/v1/books` | 로그인 | `BookCatalogQuerySchema` query | `BookCatalogResponseSchema` | 검색 key별 저장 |
| GET | `/v1/me/account/deletion-preview` | 로그인 본인 | 없음 | `AccountDeletionPreviewSchema` | 탈퇴 화면 진입마다 갱신 |
| DELETE | `/v1/me/account` | 로그인 본인 | `DeleteAccountRequestSchema` | `DeleteAccountResponseSchema` | 성공 후 cache/session 폐기 |

`ProfileSchema.role`은 요청자 본인의 account role인 `USER | ADMIN`을 반환한다. 이는 Admin 진입점을 숨기는 UX 판단에만 사용하며, 실제 권한 경계는 각 Admin endpoint의 서버 검증이다. 토론 참가자 payload에는 이 account role을 포함하지 않는다.

책 query 기본값:

| Query | 기본값 | 제약 |
| --- | --- | --- |
| `query` | 빈 문자열 | trim 후 최대 200자, 제목·저자 검색 |
| `sort` | `recent` | `recent`, `title`, `author` |
| `limit` | 20 | 1~50 |

Catalog에는 `PUBLISHED` Pack만 나타나며 방 생성은 응답의 exact `packVersionId`를 사용한다.

탈퇴 preview blocker:

- `ADMIN_ROLE`
- `ACTIVE_PARTICIPATION`
- `HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL`

## 4. 방·대기실·사전 입력

### 4.1 Query

| Method | Path | 권한 | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/v1/rooms?query=&limit=20` | 로그인 | `RoomSearchQuerySchema` | `RoomSearchResponseSchema` |
| GET | `/v1/rooms/mine` | 로그인 | 없음 | `MyRoomsResponseSchema` |
| GET | `/v1/rooms/:roomId` | 로그인 | UUID path | `RoomDetailSchema` |
| GET | `/v1/rooms/:roomId/prep` | Scheduled 등록 참가자 또는 종료 후 실제 참여자/방장 | UUID path | `PrepEntriesResponseSchema` |

방 검색 query는 `query` 빈 문자열, `limit` 20이 기본이며 최대 50이다. `RoomDetail.actorRole === "NONE"`인 사용자는 공개 상세를 보지만 `members`는 빈 배열이다. 취소된 방 상세는 일반 검색 경로에서 조회하지 않는다.

Prep 응답은 모든 `PUBLIC` 항목과 요청자 본인의 `AI_PRIVATE`만 포함한다. 다른 작성자의 `AI_PRIVATE`는 존재 여부를 포함해 반환하지 않는다. 토론 진행 중에는 별도 prep 조회 화면을 제공하지 않고, 종료 후에는 위 범위를 읽기 전용으로 다시 제공한다.

### 4.2 Command

| Method | Path | 권한 | Request schema | Response schema | 주요 invalidate |
| --- | --- | --- | --- | --- | --- |
| POST | `/v1/rooms` | 로그인 | `CreateRoomRequestSchema` | `CreateRoomResponseSchema` | rooms search/mine |
| POST | `/v1/rooms/:roomId/join` | 로그인, 참가 가능 | `JoinRoomRequestSchema` | `JoinRoomResponseSchema` | detail/mine/prep |
| PATCH | `/v1/rooms/:roomId` | 방장 | `UpdateRoomRequestSchema` | `RoomCommandResponseSchema` | detail/search/mine |
| POST | `/v1/rooms/:roomId/membership/cancel` | 시작 전 일반 참가자 | `CancelMembershipRequestSchema` | `RoomCommandResponseSchema` | detail/search/mine |
| POST | `/v1/rooms/:roomId/cancel` | 시작 전 방장 | `CancelRoomRequestSchema` | `RoomCommandResponseSchema` | detail/search/mine |
| POST | `/v1/rooms/:roomId/host/transfer` | 방장 | `TransferHostRequestSchema` | `RoomCommandResponseSchema` | detail/mine |
| POST | `/v1/rooms/:roomId/members/remove` | 방장 | `RemoveRoomMemberRequestSchema` | `RoomCommandResponseSchema` | detail/search |
| PUT | `/v1/rooms/:roomId/prep` | Scheduled 등록 참가자 본인 | `UpsertPrepEntryRequestSchema` | `PrepEntryCommandResponseSchema` | prep |
| DELETE | `/v1/rooms/:roomId/prep` | 작성자 본인 | `DeletePrepEntryRequestSchema` | `PrepEntryCommandResponseSchema` | prep |

참가 password는 4~20자이고 대소문자를 구분한다. 이미 활성 membership이 있는 사용자는 `payload.password` 없이 join을 재호출할 수 있다. password를 다시 입력하는 새 시도에는 새 `commandId`를 사용한다.

방 설정 변경 범위:

- 시작 전: title, Pack, 예정 시각, password, 최소·최대 인원
- 시작 후 공식 종료 전: password 변경과 최대 인원 증가만 가능
- 최대 인원은 15 이하이며 현재 활성 membership 수보다 작게 줄일 수 없다.
- 종료·취소 후에는 변경할 수 없다.

Prep의 `entryId`도 client가 UUID로 생성한다. 새 항목은 `expectedRevision`을 생략하고, 수정은 현재 revision을 전달한다. `AI_PRIVATE` body도 이 endpoint에는 전달되지만 일반 session snapshot/event에는 절대 포함되지 않는다.

## 5. 세션·메시지·AI 도움

### 5.1 Snapshot과 message page

| Method | Path | 권한 | Request | Response |
| --- | --- | --- | --- | --- |
| GET | `/v1/rooms/:roomId/session/sync` | 활성 참가자, 종료 후 실제 참여자/방장 | `SessionSyncQuerySchema` query | `SessionSnapshotSchema` |
| GET | `/v1/rooms/:roomId/session/messages` | 동일 | `SessionMessagePageQuerySchema` query | `SessionMessagePageSchema` |

Sync query:

| Query | 기본값 | 제약 | 용도 |
| --- | ---: | ---: | --- |
| `afterEventCursor` | 0 | 0 이상 | 이 cursor 다음 공식 event |
| `afterMessageSeq` | 0 | 0 이상 | 이 seq 다음 최신 message |
| `messageLimit` | 100 | 1~100 | sync message page 크기 |

과거 message query는 `beforeSeq` optional, `limit` 기본 50·최대 50이다. `messages`는 `seqNo` 순서로 합치고 `messageId`로 중복 제거한다.

### 5.2 Message·heartbeat·AI 도움

| Method | Path | 권한 | Request schema | Response schema | 비고 |
| --- | --- | --- | --- | --- | --- |
| POST | `/v1/rooms/:roomId/session/messages` | 실제 참여자, Closing 전 | `SendSessionMessageRequestSchema` | `SendSessionMessageResponseSchema` | `clientMessageId` 멱등성 |
| POST | `/v1/rooms/:roomId/session/heartbeat` | 활성 등록/참여자 | `SessionHeartbeatRequestSchema` | `SessionHeartbeatResponseSchema` | device별 연결 갱신 |
| POST | `/v1/rooms/:roomId/session/ai-help` | 방장, 허용 phase | `RequestSessionAiHelpRequestSchema` | `RequestSessionAiHelpResponseSchema` | cooldown·active job 제한 |

메시지 최대 길이는 2,000자다. `replyToMessageId`는 같은 session의 확정 message만 가리킨다. 전송 응답과 Realtime event가 모두 도착할 수 있으므로 `messageId`, `clientMessageId`, cursor로 reconcile한다.

Heartbeat의 `deviceId`는 room route 수명 동안 `sessionStorage`에 유지한다. 다음 호출 간격은 response의 `heartbeatIntervalSeconds`를 사용하며 브라우저 timer를 서버의 online 판정으로 간주하지 않는다.

AI 도움 reason:

- `CONVERSATION_STOPPED`
- `DISCUSSION_STUCK_OR_REPETITIVE`
- `TOO_FAR_OFF_TOPIC`
- `CONFLICT_NEEDS_REFRAMING`

### 5.3 방장 session command

| Method | Path | 권한 | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| POST | `/v1/rooms/:roomId/session/start` | 방장, 예정 시각·최소 접속 충족 | `StartSessionRequestSchema` | `StartSessionResponseSchema` |
| POST | `/v1/rooms/:roomId/session/extend` | 방장, 연장 결정 window | `ExtendSessionRequestSchema` | `ExtendSessionResponseSchema` |
| POST | `/v1/rooms/:roomId/session/synthesis` | 방장, 마무리 결정 window | `StartSynthesisRequestSchema` | `StartSynthesisResponseSchema` |
| POST | `/v1/rooms/:roomId/session/end` | 방장, 활성 phase | `EndSessionRequestSchema` | `EndSessionResponseSchema` |

모든 command는 최신 `expectedPhaseVersion`을 사용한다. 성공 후 response만으로 일부 state를 먼저 표시할 수 있지만 반드시 cursor sync로 누락 event와 최신 projection에 수렴한다.

## 6. Closing과 공식 결과

| Method | Path | 권한 | Request schema | Response schema |
| --- | --- | --- | --- | --- |
| PUT | `/v1/rooms/:roomId/session/closing/response` | Closing의 실제 참여자 | `UpsertClosingResponseRequestSchema` | `ClosingResponseCommandResponseSchema` |
| DELETE | `/v1/rooms/:roomId/session/closing/response` | Closing의 작성자 | `DeleteClosingResponseRequestSchema` | `ClosingResponseCommandResponseSchema` |
| GET | `/v1/rooms/:roomId/session/result` | 종료 후 실제 참여자/방장 | 없음 | `GetDiscussionResultResponseSchema` |
| POST | `/v1/rooms/:roomId/session/result/retry` | 방장, retry 가능 상태 | `RetryDiscussionResultRequestSchema` | `RetryDiscussionResultResponseSchema` |

Closing 저장 규칙:

- `SUBMITTED`: trim 후 비어 있지 않은 body, 최대 300자
- `SKIPPED`: body는 반드시 `null`
- 최초 상태의 revision은 0, 저장마다 revision 증가
- DELETE는 `PENDING`으로 돌아가며 기존 body를 공개하지 않는다.

결과 status:

| Status | UI 의미 |
| --- | --- |
| `NOT_STARTED` | 종료 lifecycle 전 |
| `PENDING` | 생성 예약 |
| `PROCESSING` | worker 처리 중 |
| `RETRYING` | 자동 재시도 중 |
| `READY` | `record`와 공개 `closingLines` 렌더링 가능 |
| `FAILED` | 실패 안내, `canRetry`와 방장 여부 확인 |
| `INSUFFICIENT` | 충분한 대화가 없어 공식 기록 없음 |

`READY`가 아니면 `record`는 `null`, `closingLines`는 빈 배열이다.

## 7. Admin Book Context Builder

모든 endpoint는 로그인과 DB의 `profiles.role = 'ADMIN'`이 필요하다. 일반 사용자에게 route를 숨겨도 서버의 `ADMIN_REQUIRED`가 최종 권한 경계다.

| Method | Path | Request schema | Response schema |
| --- | --- | --- | --- |
| POST | `/v1/admin/book-context/packs` | `CreateBookContextPackRequestSchema` | `CreateBookContextPackResponseSchema` |
| GET | `/v1/admin/book-context/packs` | 없음 | `AdminBookContextPackListResponseSchema` |
| GET | `/v1/admin/book-context/packs/:packVersionId` | UUID path | `AdminBookContextPackSnapshotSchema` |
| PUT | `/v1/admin/book-context/packs/:packVersionId/draft` | `UpdateBookContextDraftRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/packs/:packVersionId/review` | `BuilderPackCommandRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/packs/:packVersionId/return-to-draft` | `BuilderPackCommandRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/packs/:packVersionId/publish` | `PublishBookContextPackRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/packs/:packVersionId/retire` | `RetireBookContextPackRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/runs/:runId/retry` | `RetryBookBuilderRunRequestSchema` | `RetryBookBuilderRunResponseSchema` |
| POST | `/v1/admin/book-context/packs/:packVersionId/regenerate` | `RegenerateBookContextRequestSchema` | `RegenerateBookContextResponseSchema` |
| POST | `/v1/admin/book-context/proposals/:proposalId/apply` | `ProposalCommandRequestSchema` | `AdminPackCommandResponseSchema` |
| POST | `/v1/admin/book-context/proposals/:proposalId/discard` | `ProposalCommandRequestSchema` | `AdminPackCommandResponseSchema` |

초기 create는 title과 author만 받으며 Builder가 판본·출처·claim·section을 채운다. Draft/Review/Publish/Retire 상태 전이는 snapshot revision으로 낙관적 동시성을 제어한다. 재생성은 현재 Draft를 즉시 덮지 않고 `pendingProposal`을 생성한다.

## 8. 안정된 오류 code

### 8.1 공통

| HTTP | Code | Client 동작 |
| ---: | --- | --- |
| 400 | `INVALID_REQUEST` | schema/form 수정 |
| 401 | `AUTH_REQUIRED` | session 회복 또는 로그인 |
| 403 | `FORBIDDEN` | 권한 재조회 |
| 404 | `NOT_FOUND` | route 대상 없음 |
| 409 | `CONFLICT` | 최신 상태 재조회 |
| 429 | `RATE_LIMITED` | backoff |
| 500/503 | `INTERNAL_ERROR` | 성공으로 가정하지 않고 안전한 재시도 |

### 8.2 방·대기실

| HTTP | Codes |
| ---: | --- |
| 400 | `INVALID_ROOM_CAPACITY`, `PUBLISHED_PACK_REQUIRED`, `INVALID_HOST_TRANSFER_TARGET`, `INVALID_REMOVE_TARGET`, `INVALID_PREP_ENTRY` |
| 403 | `ROOM_MEMBER_REMOVED`, `ROOM_PASSWORD_REQUIRED`, `ROOM_PASSWORD_INVALID`, `ROOM_HOST_REQUIRED`, `PREP_WRITE_NOT_ALLOWED`, `PREP_READ_NOT_ALLOWED`, `PREP_AUTHOR_REQUIRED`, `ROOM_MEMBERSHIP_REQUIRED` |
| 404 | `ROOM_NOT_FOUND`, `REGISTERED_MEMBERSHIP_NOT_FOUND`, `PREP_ENTRY_NOT_FOUND` |
| 409 | `COMMAND_PAYLOAD_MISMATCH`, `ROOM_CAPACITY_REACHED`, `ROOM_PASSWORD_CHANGED`, `JOIN_AUTHORIZATION_EXPIRED`, `ROOM_CANCELED`, `ROOM_ENDED`, `AGGREGATE_VERSION_CONFLICT`, `ROOM_SETTINGS_LOCKED`, `ROOM_COMMAND_LOCKED`, `ROOM_BOOK_LOCKED`, `HOST_CANNOT_CANCEL_MEMBERSHIP`, `HOST_TRANSFER_TARGET_NOT_REGISTERED`, `PREP_REVISION_CONFLICT` |
| 429 | `ROOM_PASSWORD_RATE_LIMITED` |

### 8.3 세션·메시지

| HTTP | Codes |
| ---: | --- |
| 400 | `MESSAGE_BODY_INVALID`, `SESSION_CURSOR_INVALID`, `SESSION_MESSAGE_LIMIT_INVALID` |
| 403 | `ACTUAL_PARTICIPATION_REQUIRED`, `ACTIVE_MEMBERSHIP_REQUIRED`, `ROOM_HOST_REQUIRED`, `SESSION_READ_FORBIDDEN` |
| 404 | `ROOM_NOT_FOUND`, `SESSION_NOT_FOUND`, `REPLY_MESSAGE_NOT_FOUND` |
| 409 | `AI_HELP_REQUEST_IN_PROGRESS`, `AI_HELP_REQUEST_PHASE_NOT_ALLOWED`, `COMMAND_PAYLOAD_MISMATCH`, `MESSAGE_WRITE_NOT_ALLOWED`, `MINIMUM_CONNECTED_PARTICIPANTS_NOT_MET`, `PHASE_VERSION_CONFLICT`, `ROOM_CANCELED`, `SESSION_CONNECTION_CLOSED`, `SESSION_END_LOCKED`, `SESSION_EXTENSION_LOCKED`, `SESSION_SYNTHESIS_LOCKED`, `SESSION_START_LOCKED`, `SESSION_START_TOO_EARLY` |
| 429 | `AI_HELP_REQUEST_COOLDOWN` |

### 8.4 Closing·결과

| HTTP | Codes |
| ---: | --- |
| 400 | `CLOSING_RESPONSE_INVALID` |
| 403 | `ACTUAL_PARTICIPATION_REQUIRED`, `ROOM_HOST_REQUIRED`, `SESSION_READ_FORBIDDEN` |
| 404 | `ROOM_NOT_FOUND`, `SESSION_NOT_FOUND` |
| 409 | `CLOSING_RESPONSE_LOCKED`, `CLOSING_REVISION_CONFLICT`, `COMMAND_PAYLOAD_MISMATCH`, `DISCUSSION_RESULT_NOT_AVAILABLE`, `DISCUSSION_RESULT_RETRY_UNAVAILABLE`, `PHASE_VERSION_CONFLICT` |

### 8.5 계정 탈퇴

| HTTP | Code | 의미 |
| ---: | --- | --- |
| 401 | `CURRENT_PASSWORD_INVALID` | 탈퇴 form 비밀번호 오류 |
| 404 | `ACCOUNT_NOT_FOUND` | 계정 상태 재확인 |
| 409 | `ACCOUNT_DELETION_BLOCKED` | preview blocker 해결 필요 |
| 409 | `COMMAND_PAYLOAD_MISMATCH` | command ID 재사용 버그 |
| 503 | `ACCOUNT_DELETION_PENDING` | Auth hard-delete recovery 진행 중 |

### 8.6 Admin Builder

| HTTP | Codes |
| ---: | --- |
| 403 | `ADMIN_REQUIRED` |
| 404 | `BOOK_CONTEXT_PACK_NOT_FOUND`, `BOOK_CONTEXT_ITEM_NOT_FOUND` |
| 409 | `BOOK_BUILDER_REVISION_CONFLICT`, `BOOK_BUILDER_DRAFT_LOCKED`, `BOOK_BUILDER_RUN_INCOMPLETE`, `BOOK_BUILDER_RETRY_UNAVAILABLE`, `BOOK_BUILDER_RETRY_STALE`, `BOOK_BUILDER_PROPOSAL_PENDING`, `BOOK_BUILDER_PROPOSAL_RESOLVED`, `BOOK_CONTEXT_PUBLISH_BLOCKED`, `BOOK_CONTEXT_WARNINGS_UNACKNOWLEDGED`, `COMMAND_PAYLOAD_MISMATCH` |

## 9. 변경 규칙

- additive response field도 Zod `strictObject`에서는 기존 client parse를 깨므로 contract version과 양쪽 배포 순서를 먼저 검토한다.
- 새 endpoint 또는 error code를 추가하면 Controller, `packages/contracts`, 이 문서와 frontend fixture를 같은 변경에서 갱신한다.
- destructive 변경은 DB expand → server → frontend migration → old field 제거 순서로 한다.
- `contracts/internal`의 AI/Worker model을 browser public package로 재수출하지 않는다.
