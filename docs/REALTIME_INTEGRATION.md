# 실시간 세션 통합 Protocol

> Status: Implemented protocol  
> Canonical contract: `packages/contracts/src/public/session.ts`  
> Current client reference: `apps/web/src/data/session-realtime.ts`  
> Last verified: 2026-09-02

## 0. 핵심 원칙

Supabase Realtime은 빠른 알림과 ephemeral UX를 담당하고, `GET /v1/rooms/:roomId/session/sync`의 snapshot이 최종 원본이다.

- 공식 message, phase, participant, Closing, result는 서버가 commit한 snapshot/event만 반영한다.
- Presence와 typing은 일시적 힌트이며 공식 참가·실제 참여·최소 시작 인원을 확정하지 않는다.
- event가 유실·중복·역순으로 와도 cursor sync로 수렴해야 한다.
- client timer가 만료되어도 phase를 직접 전환하지 않는다.
- 종료·취소 session은 Realtime topic을 제공하지 않고 읽기 전용 snapshot만 제공한다.

## 1. 상태 소유권

| 데이터 | Frontend 소유 위치 | Authoritative source |
| --- | --- | --- |
| room/session phase·deadline·version | TanStack Query `SessionSnapshot` | API/DB |
| 확정 message와 event cursor | TanStack Query `SessionSnapshot` | API/DB |
| 참가자·공개 topic·Closing·result | TanStack Query `SessionSnapshot` | API/DB |
| connection 상태 | route-scoped Zustand | client connection |
| Presence·typing | route-scoped Zustand | ephemeral Realtime |
| pending/failed outbox | route-scoped Zustand | client intent |
| reply target·새 메시지 badge | route-scoped Zustand | client UI |

공식 상태를 Zustand에 복사하지 않는다. route를 벗어나면 ephemeral store와 channel을 폐기한다.

## 2. Snapshot 계약

최초 진입은 다음 query를 사용한다.

```http
GET /v1/rooms/:roomId/session/sync
  ?afterEventCursor=0
  &afterMessageSeq=0
  &messageLimit=100
```

`afterMessageSeq=0`은 최신 message 최대 100개를 반환한다. `afterEventCursor=0`은 과거 event replay가 아니라 현재 authoritative state와 최신 cursor를 반환한다.

`SessionSnapshot`의 주요 영역:

| 영역 | 역할 |
| --- | --- |
| `serverTime` | client clock offset 계산 기준 |
| `room`, `actor` | pinned book/room과 현재 권한 |
| `state` | phase, phase/aggregate version, epoch, deadline |
| `participants` | 서버 heartbeat 기반 ONLINE/OFFLINE과 실제 참여 |
| `messages` | 최초 최신 page 또는 cursor 이후 page |
| `events` | 요청 cursor 이후 공식 event, 최대 200개 |
| `cursors` | 누락·pagination 판단 |
| `publicDiscussion` | 검증된 현재 공개 의제만 포함 |
| `ai` | 공개 연장 의견과 방장 요청 상태 projection |
| `closing` | 진행 인원수와 요청자 본인 response만 포함 |
| `result` | 공식 기록 생성 상태 |
| `realtime` | 현재 epoch의 exact topic 또는 종료 시 `null` |

`events`를 다시 projection해야만 현재 state가 완성되는 구조가 아니다. incoming snapshot 자체가 해당 응답 시점의 authoritative state다.

## 3. Topic과 권한

활성 session snapshot은 두 topic을 반환한다.

```text
official:  session:{sessionId}:v{channelEpoch}
ephemeral: session:{sessionId}:v{channelEpoch}:ephemeral
```

topic 문자열을 client에서 독자적으로 만들지 않고 `snapshot.realtime` 값을 그대로 사용한다. contract는 topic과 state의 `sessionId/channelEpoch` 일치를 검증한다.

### 3.1 Official private topic

- event name: `session_event`
- participant client: 수신 전용
- 발행자: DB trigger만 가능
- payload schema: `SessionRealtimeBroadcastPayloadSchema`
- transport `id`는 `event.eventId`와 같아야 한다.

client가 official topic에 broadcast를 보내려 하지 않는다. RLS가 막더라도 UI 보안은 서버 발행 event만 신뢰한다는 전제에서 작성한다.

### 3.2 Ephemeral private topic

- event name: `typing`
- Presence key: 현재 actor `userId`
- payload schema: `SessionTypingBroadcastSchema`
- broadcast self: false

Presence와 typing은 현재 snapshot의 participant 목록과 교차 확인한 뒤 표시한다. 알 수 없는 userId, 제거된 참가자, 현재 actor의 반사 신호는 무시한다. 이 신호로 role, actual participation, 최소 시작 인원, AI 평가를 UI에서 계산하지 않는다.

## 4. 안전한 최초 구독 순서

snapshot을 먼저 받고 나서 바로 화면에 연결 완료를 표시하면 snapshot과 subscribe 사이 event를 놓칠 수 있다. 다음 순서를 유지한다.

```text
1. initial snapshot 요청
2. snapshot의 official/ephemeral topic 구독 시작
3. 구독 중 official event를 buffer
4. 두 channel SUBSCRIBED 확인
5. ephemeral Presence track
6. snapshot cursor 이후 sync를 반복해 gap 보충
7. buffered event를 eventCursor 순으로 적용
8. connected 표시
```

catch-up 요청:

```ts
api.sync(roomId, {
  afterEventCursor: current.cursors.eventCursor,
  afterMessageSeq: current.cursors.latestMessageSeq,
  messageLimit: 100,
});
```

응답의 `hasMoreEventsAfter` 또는 `hasMoreMessagesAfter`가 true면 새 cursor로 다시 요청한다. 한 번의 요청이 모든 gap을 포함한다고 가정하지 않는다.

## 5. 공식 event envelope

모든 event에는 다음 순서/식별 정보가 있다.

```ts
type SessionEventEnvelope = {
  eventId: string;
  sessionId: string;
  eventCursor: number;
  aggregateVersion: number;
  channelEpoch: number;
  occurredAt: string;
};
```

현재 public union:

| Type | Payload | Projection |
| --- | --- | --- |
| `MESSAGE_APPENDED` | 확정 `SessionMessage` | timeline, message/event cursor |
| `SESSION_STATE_CHANGED` | 전체 `SessionState`, optional reason | phase, deadline, epoch, timer |
| `SESSION_PARTICIPANT_CHANGED` | 대상 participant/null, 전체/접속 인원 | 참가자 목록과 count |
| `SESSION_AI_STATE_CHANGED` | 공개 extension opinion | `snapshot.ai.extensionOpinion` |
| `SESSION_CLOSING_PROGRESS_CHANGED` | eligible/completed count | 본인 response는 유지하고 count만 갱신 |
| `SESSION_RESULT_STATE_CHANGED` | result status/canRetry | result 상태 갱신 후 필요 시 query refetch |

새 event type을 추가하면 Zod discriminated union, DB public payload, projection과 fixture를 동시에 변경한다. parse할 수 없는 payload는 화면에 부분 적용하지 않고 protocol error로 sync한다.

## 6. Duplicate·gap 판정

현재 projection 기준:

```text
다른 sessionId
  → gap

eventCursor <= current.eventCursor
  → duplicate, 무시

eventCursor != current.eventCursor + 1
  → gap

aggregateVersion != current.aggregateVersion + 1
  → gap

MESSAGE_APPENDED인데 seqNo != latestMessageSeq + 1
  → gap

그 외
  → applied
```

gap에서는 event 하나를 억지로 적용하지 않는다. 현재 화면을 유지하고 recovery sync를 단일 in-flight promise로 합친다. 여러 event가 동시에 gap을 감지해도 recovery request 폭주가 생기지 않게 한다.

`eventId`와 `messageId`로 배열 중복을 제거하고 각각 cursor 순서, `seqNo` 순서로 정렬한다. 유지하는 최근 event는 최대 200개다.

## 7. Channel epoch 교체

participant 제거처럼 권한을 즉시 폐기해야 하는 변경은 `channelEpoch`를 증가시킬 수 있다. 새 epoch event는 기존 topic에서 수신되지 않을 수 있으므로 heartbeat와 sync가 전환을 보장한다.

1. heartbeat response의 `channelEpoch` 또는 `eventCursor`가 cache보다 앞서면 recovery
2. incoming snapshot의 `realtime` topic이 바뀌면 기존 channel 두 개 close
3. 새 topic으로 최초 구독 순서를 다시 수행
4. old topic에서 늦게 온 event는 epoch/cursor 검증으로 무시하거나 recovery

topic 권한이 폐기된 사용자는 재구독 실패를 성공적인 offline 상태처럼 숨기지 않는다. 최신 snapshot/API 권한 응답으로 removed/ended 상태 화면에 수렴한다.

## 8. Heartbeat와 Presence

`POST .../heartbeat`는 DB의 server-authoritative connection을 갱신한다.

- `deviceId`: room별 `sessionStorage` UUID
- 첫 heartbeat: active session route 진입 직후
- 반복 간격: response의 `heartbeatIntervalSeconds`
- server online threshold: response의 `onlineThresholdSeconds`
- browser offline/heartbeat 실패: `reconnecting`
- `online` event 또는 background → foreground: 즉시 recovery

Realtime Presence는 빠른 UI 표시를 보완하지만 `participants[].connectionStatus`의 최종 의미를 대체하지 않는다. 특히 session 시작의 최소 접속 인원은 서버 transaction이 heartbeat 데이터를 기준으로 판정한다.

## 9. Typing

payload:

```ts
{
  userId: actorUserId,
  typing: boolean,
  sentAt: new Date().toISOString(),
}
```

현재 client 기준:

- 입력 시작/변경 시 `typing: true`
- 2.5초 idle 후 `false`
- remote `true`는 4초 뒤 자동 만료
- 같은 boolean 연속 전송 억제
- composer 비활성 phase, background, channel 미연결에서는 전송하지 않음
- send 실패는 공식 message 실패로 승격하지 않음

typing은 유실될 수 있으며 별도 재전송 queue를 만들지 않는다. screen reader에 모든 typing 변화를 실시간 announce하지 않는다.

## 10. Message outbox와 reconcile

```text
local draft
  → pending(clientMessageId)
  → POST message
      ├─ success → confirmed message merge → pending 제거
      └─ failure → failed(body와 동일 ID 보존)

Realtime MESSAGE_APPENDED가 먼저/나중에 올 수 있음
  → cursor와 messageId로 reconcile
  → 순서 불연속이면 recovery
```

재시도는 같은 `clientMessageId`, body, `replyToMessageId`를 사용한다. 사용자가 failed body를 수정하면 기존 retry가 아니라 새 message ID를 만든다.

서버 success response를 현재 cursor 바로 다음으로 안전하게 적용할 수 없으면 confirmed message는 보존하되 전체 recovery를 수행한다. 전송 요청 timeout을 곧바로 실패 확정으로 단정하지 않는다. 같은 ID 재시도가 서버 receipt/unique key로 중복 메시지를 막는다.

## 11. 과거 message pagination

최초 snapshot은 최신 최대 100개다. 위로 스크롤해 과거를 요청할 때:

```http
GET /v1/rooms/:roomId/session/messages
  ?beforeSeq={snapshot.cursors.oldestMessageSeq}
  &limit=50
```

- 응답을 기존 배열 앞에 합친다.
- `messageId`로 중복 제거하고 `seqNo`로 정렬한다.
- `page.hasMoreBefore`가 false면 더 요청하지 않는다.
- 과거 page 요청 중 새 message event가 와도 두 작업을 별도 cursor로 안전하게 합친다.
- 전체 message를 무제한 DOM node로 렌더링하지 않는다.

## 12. Phase·Closing·result projection

### 12.1 Phase와 timer

남은 시간은 `serverTime`과 authoritative deadline으로 clock offset을 구한 뒤 표시한다.

- `OPENING/CORE/EXTENDED/SYNTHESIS`: `discussionEndsAt`
- `CLOSING`: `closingEndsAt`
- `ENDED/CANCELED`: countdown 없음

timer 0은 표시일 뿐이다. due-event reconciler 또는 방장 command가 만든 `SESSION_STATE_CHANGED`/snapshot을 기다린다.

### 12.2 Closing

Closing progress event에는 총 eligible/completed count만 있다. 현재 actor의 body/revision은 command response 또는 sync snapshot에서 가져온다. progress event를 적용할 때 기존 `actorResponse`를 유지한다.

Closing command response의 `officiallyEnded: true` 또는 phase event가 도착하면 일반 composer/Closing form을 즉시 닫고 sync한다.

### 12.3 Result

`SESSION_RESULT_STATE_CHANGED`는 status와 `canRetry`만 갱신한다. `READY` event 뒤 전체 record와 `closingLines`는 `GET .../result`로 가져온다. event payload에 record 원문을 기대하지 않는다.

## 13. 연결 상태 UX

| Client status | UI | 입력 |
| --- | --- | --- |
| `connecting` | 최초 연결 중 | 비활성 |
| `connected` | 정상 | phase/권한에 따라 활성 |
| `reconnecting` | 재연결·동기화 중 | 새 전송 비활성, draft 보존 |
| `failed` | 재시도 control과 안내 | 비활성 |

Realtime 장애 중에도 이미 받은 확정 대화는 지우지 않는다. reconnect 실패를 session 종료로 추정하지 않는다. API snapshot이 읽기 권한 또는 종료 상태를 확정할 때만 해당 화면으로 이동한다.

## 14. 구현·회귀 체크리스트

- subscribe 전후에 발생한 event가 cursor sync로 복구된다.
- 같은 event를 두 번 받아도 한 번만 보인다.
- cursor, aggregate version, message seq 각각의 gap이 recovery를 일으킨다.
- protocol parse 실패가 부분 state mutation을 만들지 않는다.
- heartbeat가 더 최신 cursor/epoch를 알려주면 재구독한다.
- offline/online, background/foreground에서 snapshot으로 수렴한다.
- pending message와 Realtime 확정 message가 중복 렌더링되지 않는다.
- failed message retry가 같은 `clientMessageId`를 쓴다.
- participant 제거와 종료 뒤 old topic을 계속 사용하지 않는다.
- 다른 사용자의 Closing body와 `AI_PRIVATE` canary가 event/cache/DOM에 나타나지 않는다.
- typing/Presence 손실이 공식 participant나 session state를 바꾸지 않는다.

