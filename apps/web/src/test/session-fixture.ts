import type {
  SessionEvent,
  SessionMessage,
  SessionSnapshot,
} from "@bookseasoning/contracts/public";

export const roomId = "90000000-0000-4000-8000-000000000001";
export const sessionId = "90000000-0000-4000-8000-000000000002";
export const hostUserId = "90000000-0000-4000-8000-000000000003";
export const participantUserId = "90000000-0000-4000-8000-000000000004";

export function messageFixture(
  seqNo: number,
  authorUserId = hostUserId,
  body = `확정 메시지 ${seqNo}`,
): SessionMessage {
  return {
    messageId: `91000000-0000-4000-8000-${seqNo.toString().padStart(12, "0")}`,
    sessionId,
    seqNo,
    kind: "PARTICIPANT",
    author: {
      userId: authorUserId,
      profileName: authorUserId === hostUserId ? "민수" : "수진",
    },
    clientMessageId: `92000000-0000-4000-8000-${seqNo.toString().padStart(12, "0")}`,
    body,
    reply: null,
    confirmedAt: `2026-09-02T10:${seqNo.toString().padStart(2, "0")}:00.000Z`,
  };
}

export function messageEventFixture(message: SessionMessage): SessionEvent {
  return {
    eventId: `93000000-0000-4000-8000-${message.seqNo.toString().padStart(12, "0")}`,
    sessionId,
    eventCursor: message.seqNo,
    aggregateVersion: message.seqNo,
    channelEpoch: 1,
    occurredAt: message.confirmedAt,
    type: "MESSAGE_APPENDED",
    payload: { message },
  };
}

export function sessionSnapshotFixture(
  messages: readonly SessionMessage[] = [messageFixture(1)],
  events: readonly SessionEvent[] = [],
): SessionSnapshot {
  const latest = messages.at(-1)?.seqNo ?? 0;
  return {
    sessionId,
    serverTime: "2026-09-02T10:01:00.000Z",
    room: {
      roomId,
      title: "실시간 토론",
      scheduledStartAt: "2026-09-02T10:00:00.000Z",
      packVersionId: "90000000-0000-4000-8000-000000000005",
      bookTitle: "소년이 온다",
      bookAuthor: "한강",
      bookCoverUrl: null,
    },
    actor: {
      userId: hostUserId,
      role: "HOST",
      membershipStatus: "PARTICIPATED",
      actualParticipation: true,
    },
    state: {
      phase: "OPENING",
      phaseVersion: 1,
      aggregateVersion: latest,
      channelEpoch: 1,
      startedAt: "2026-09-02T10:00:00.000Z",
      endedAt: null,
      extensionCount: 0,
      deadlines: {
        discussionEndsAt: "2026-09-02T10:30:00.000Z",
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: "2026-09-02T10:25:00.000Z",
        closingStartedAt: null,
        closingEndsAt: null,
      },
    },
    participants: [
      {
        userId: hostUserId,
        profileName: "민수",
        role: "HOST",
        membershipStatus: "PARTICIPATED",
        connectionStatus: "ONLINE",
        actualParticipation: true,
      },
      {
        userId: participantUserId,
        profileName: "수진",
        role: "PARTICIPANT",
        membershipStatus: "PARTICIPATED",
        connectionStatus: "ONLINE",
        actualParticipation: true,
      },
    ],
    connectedParticipantCount: 2,
    messages: [...messages],
    events: [...events],
    cursors: {
      eventCursor: latest,
      latestMessageSeq: latest,
      oldestMessageSeq: messages[0]?.seqNo ?? null,
      hasMoreMessagesBefore: false,
      hasMoreMessagesAfter: false,
      hasMoreEventsAfter: false,
    },
    publicDiscussion: { currentTopic: "침묵은 어떤 선택이었을까요?" },
    ai: { extensionOpinion: null, latestHostHelpRequest: null },
    closing: null,
    result: { status: "NOT_STARTED", canRetry: false },
    realtime: {
      eventTopic: `session:${sessionId}:v1`,
      ephemeralTopic: `session:${sessionId}:v1:ephemeral`,
    },
  };
}
