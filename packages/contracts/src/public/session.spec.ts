import { describe, expect, it } from "vitest";

import {
  EndSessionResponseSchema,
  RequestSessionAiHelpRequestSchema,
  RequestSessionAiHelpResponseSchema,
  ExtendSessionRequestSchema,
  ExtendSessionResponseSchema,
  SendSessionMessageRequestSchema,
  SendSessionMessageResponseSchema,
  SessionHeartbeatResponseSchema,
  SessionEventSchema,
  SessionMessagePageQuerySchema,
  SessionMessagePageSchema,
  SessionMessageSchema,
  SessionRealtimeBroadcastPayloadSchema,
  SessionSnapshotSchema,
  SessionSyncQuerySchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  StartSynthesisResponseSchema,
} from "./session.js";

const participantMessage = {
  messageId: "71000000-0000-4000-8000-000000000001",
  sessionId: "71000000-0000-4000-8000-000000000002",
  seqNo: 1,
  kind: "PARTICIPANT",
  author: {
    userId: "71000000-0000-4000-8000-000000000003",
    profileName: "참가자",
  },
  clientMessageId: "71000000-0000-4000-8000-000000000004",
  body: "서로 다른 관점을 살펴보고 싶어요.",
  reply: null,
  confirmedAt: "2026-09-01T12:00:00.000Z",
} as const;

const state = {
  phase: "OPENING",
  phaseVersion: 1,
  aggregateVersion: 1,
  channelEpoch: 1,
  startedAt: "2026-09-01T12:00:00.000Z",
  endedAt: null,
  extensionCount: 0,
  deadlines: {
    discussionEndsAt: "2026-09-01T12:30:00.000Z",
    extensionPromptedAt: null,
    extensionDecisionDeadlineAt: null,
    closingStartedAt: null,
    closingEndsAt: null,
  },
} as const;

describe("session public contracts", () => {
  it("parses a reconnect snapshot with authoritative cursors", () => {
    const snapshot = SessionSnapshotSchema.parse({
      sessionId: participantMessage.sessionId,
      serverTime: "2026-09-01T12:01:00.000Z",
      room: {
        roomId: "71000000-0000-4000-8000-000000000005",
        title: "함께 읽는 방",
        scheduledStartAt: "2026-09-01T12:00:00.000Z",
        packVersionId: "71000000-0000-4000-8000-000000000006",
        bookTitle: "책 제목",
        bookAuthor: "작가",
        bookCoverUrl: null,
      },
      actor: {
        userId: participantMessage.author.userId,
        role: "PARTICIPANT",
        membershipStatus: "PARTICIPATED",
        actualParticipation: true,
      },
      state,
      participants: [
        {
          userId: participantMessage.author.userId,
          profileName: "참가자",
          role: "PARTICIPANT",
          membershipStatus: "PARTICIPATED",
          connectionStatus: "ONLINE",
          actualParticipation: true,
        },
      ],
      connectedParticipantCount: 1,
      messages: [participantMessage],
      events: [],
      cursors: {
        eventCursor: 1,
        latestMessageSeq: 1,
        oldestMessageSeq: 1,
        hasMoreMessagesBefore: false,
        hasMoreMessagesAfter: false,
        hasMoreEventsAfter: false,
      },
      publicDiscussion: { currentTopic: null },
      ai: { extensionOpinion: null, latestHostHelpRequest: null },
      closing: null,
      result: { status: "NOT_STARTED", canRetry: false },
      realtime: {
        eventTopic: `session:${participantMessage.sessionId}:v1`,
        ephemeralTopic: `session:${participantMessage.sessionId}:v1:ephemeral`,
      },
    });

    expect(snapshot.cursors.eventCursor).toBe(1);
    expect(snapshot.messages[0]?.clientMessageId).toBe(
      participantMessage.clientMessageId,
    );
  });

  it("rejects participant messages without an idempotency key", () => {
    expect(() =>
      SessionMessageSchema.parse({ ...participantMessage, clientMessageId: null }),
    ).toThrow();
  });

  it("rejects private-looking fields in strict event payloads", () => {
    expect(() =>
      SessionEventSchema.parse({
        eventId: "71000000-0000-4000-8000-000000000007",
        sessionId: participantMessage.sessionId,
        eventCursor: 1,
        aggregateVersion: 1,
        channelEpoch: 1,
        occurredAt: "2026-09-01T12:00:00.000Z",
        type: "MESSAGE_APPENDED",
        payload: { message: participantMessage, aiPrivateBody: "canary" },
      }),
    ).toThrow();
  });

  it("parses the host-help command without accepting free-form instructions", () => {
    expect(
      RequestSessionAiHelpRequestSchema.parse({
        commandId: "71000000-0000-4000-8000-000000000020",
        expectedPhaseVersion: 2,
        reason: "CONVERSATION_STOPPED",
      }).reason,
    ).toBe("CONVERSATION_STOPPED");
    expect(() =>
      RequestSessionAiHelpRequestSchema.parse({
        commandId: "71000000-0000-4000-8000-000000000020",
        expectedPhaseVersion: 2,
        reason: "CONVERSATION_STOPPED",
        instruction: "이 결론으로 유도해줘",
      }),
    ).toThrow();
  });

  it("parses safe async request and extension-opinion projections", () => {
    expect(
      RequestSessionAiHelpResponseSchema.parse({
        roomId: "71000000-0000-4000-8000-000000000005",
        sessionId: participantMessage.sessionId,
        requestId: "71000000-0000-4000-8000-000000000021",
        jobId: "71000000-0000-4000-8000-000000000022",
        status: "QUEUED",
        retryAvailableAt: "2026-09-01T12:02:30.000Z",
        duplicate: false,
        serverTime: "2026-09-01T12:01:00.000Z",
      }).status,
    ).toBe("QUEUED");
    expect(
      SessionEventSchema.parse({
        eventId: "71000000-0000-4000-8000-000000000023",
        sessionId: participantMessage.sessionId,
        eventCursor: 2,
        aggregateVersion: 2,
        channelEpoch: 1,
        occurredAt: "2026-09-01T12:01:00.000Z",
        type: "SESSION_AI_STATE_CHANGED",
        payload: {
          extensionOpinion: {
            phaseVersion: 2,
            status: "READY",
            recommendation: "EXTEND",
            reason: "새 관점이 이어지고 있어 더 탐색할 가치가 있습니다.",
            basedThroughSeq: 4,
          },
        },
      }).type,
    ).toBe("SESSION_AI_STATE_CHANGED");
  });

  it("accepts only a transport envelope tied to the committed event id", () => {
    const event = SessionEventSchema.parse({
      eventId: "71000000-0000-4000-8000-000000000007",
      sessionId: participantMessage.sessionId,
      eventCursor: 1,
      aggregateVersion: 1,
      channelEpoch: 1,
      occurredAt: "2026-09-01T12:00:00.000Z",
      type: "MESSAGE_APPENDED",
      payload: { message: participantMessage },
    });

    expect(
      SessionRealtimeBroadcastPayloadSchema.parse({ id: event.eventId, event })
        .event.type,
    ).toBe("MESSAGE_APPENDED");
    expect(() =>
      SessionRealtimeBroadcastPayloadSchema.parse({
        id: "71000000-0000-4000-8000-000000000008",
        event,
      }),
    ).toThrow();
  });

  it("keeps message whitespace while rejecting a blank body", () => {
    const request = SendSessionMessageRequestSchema.parse({
      clientMessageId: participantMessage.clientMessageId,
      body: "첫 줄\n둘째 줄",
    });
    expect(request.body).toBe("첫 줄\n둘째 줄");
    expect(() =>
      SendSessionMessageRequestSchema.parse({
        clientMessageId: participantMessage.clientMessageId,
        body: "   ",
      }),
    ).toThrow();
  });

  it("parses a confirmed message response with its committed event position", () => {
    const response = SendSessionMessageResponseSchema.parse({
      roomId: "71000000-0000-4000-8000-000000000005",
      message: participantMessage,
      aggregateVersion: 2,
      eventCursor: 2,
      channelEpoch: 1,
      duplicate: false,
      serverTime: "2026-09-01T12:00:00.000Z",
    });

    expect(response.message.clientMessageId).toBe(
      participantMessage.clientMessageId,
    );
    expect(response.eventCursor).toBe(2);
  });

  it("normalizes missing reconnect cursors to zero", () => {
    expect(SessionSyncQuerySchema.parse({})).toEqual({
      afterEventCursor: 0,
      afterMessageSeq: 0,
      messageLimit: 100,
    });
  });

  it("limits backward message history pages to 50", () => {
    expect(SessionMessagePageQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(() => SessionMessagePageQuerySchema.parse({ limit: 51 })).toThrow();

    expect(
      SessionMessagePageSchema.parse({
        sessionId: participantMessage.sessionId,
        serverTime: "2026-09-01T12:01:00.000Z",
        messages: [participantMessage],
        page: {
          oldestMessageSeq: 1,
          newestMessageSeq: 1,
          hasMoreBefore: false,
        },
      }).page.oldestMessageSeq,
    ).toBe(1);
  });

  it("parses a durable heartbeat response", () => {
    expect(
      SessionHeartbeatResponseSchema.parse({
        roomId: "71000000-0000-4000-8000-000000000005",
        sessionId: participantMessage.sessionId,
        deviceId: "71000000-0000-4000-8000-000000000008",
        membershipStatus: "REGISTERED",
        aggregateVersion: 0,
        eventCursor: 0,
        channelEpoch: 1,
        connectedParticipantCount: 2,
        heartbeatIntervalSeconds: 15,
        onlineThresholdSeconds: 30,
        lastSeenAt: "2026-09-01T12:00:00.000Z",
        serverTime: "2026-09-01T12:00:00.000Z",
      }).onlineThresholdSeconds,
    ).toBe(30);
  });

  it("parses an idempotent opening transition response", () => {
    const request = StartSessionRequestSchema.parse({
      commandId: "71000000-0000-4000-8000-000000000009",
      expectedPhaseVersion: 0,
      payload: {},
    });
    expect(request.expectedPhaseVersion).toBe(0);

    const response = StartSessionResponseSchema.parse({
      roomId: "71000000-0000-4000-8000-000000000005",
      sessionId: participantMessage.sessionId,
      state: {
        ...state,
        deadlines: {
          ...state.deadlines,
          extensionDecisionDeadlineAt: "2026-09-01T12:25:00.000Z",
        },
      },
      eventCursor: 1,
      connectedParticipantCount: 2,
      minParticipants: 2,
      duplicate: false,
      serverTime: "2026-09-01T12:00:00.000Z",
    });
    expect(response.state.phase).toBe("OPENING");
  });

  it("keeps session-control commands empty, versioned and idempotent", () => {
    expect(
      ExtendSessionRequestSchema.parse({
        commandId: "71000000-0000-4000-8000-000000000010",
        expectedPhaseVersion: 2,
        payload: {},
      }),
    ).toMatchObject({ expectedPhaseVersion: 2, payload: {} });
    expect(() =>
      ExtendSessionRequestSchema.parse({
        commandId: "71000000-0000-4000-8000-000000000010",
        expectedPhaseVersion: 2,
        payload: { minutes: 30 },
      }),
    ).toThrow();
  });

  it("narrows each session-control response to its committed phase", () => {
    const response = {
      roomId: "71000000-0000-4000-8000-000000000005",
      sessionId: participantMessage.sessionId,
      state: {
        ...state,
        phase: "EXTENDED",
        phaseVersion: 2,
        aggregateVersion: 2,
        extensionCount: 1,
        deadlines: {
          ...state.deadlines,
          discussionEndsAt: "2026-09-01T12:45:00.000Z",
          extensionDecisionDeadlineAt: "2026-09-01T12:40:00.000Z",
        },
      },
      eventCursor: 2,
      duplicate: false,
      serverTime: "2026-09-01T12:23:00.000Z",
    };

    expect(ExtendSessionResponseSchema.parse(response).state.phase).toBe("EXTENDED");
    expect(
      StartSynthesisResponseSchema.parse({
        ...response,
        state: { ...response.state, phase: "SYNTHESIS" },
      }).state.phase,
    ).toBe("SYNTHESIS");
    expect(
      EndSessionResponseSchema.parse({
        ...response,
        state: {
          ...response.state,
          phase: "ENDED",
          endedAt: "2026-09-01T12:24:00.000Z",
        },
      }).state.phase,
    ).toBe("ENDED");
  });
});
