import { describe, expect, it, vi } from "vitest";

import type { RuntimeEnvironment } from "../../config/environment.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  SessionGatewayError,
  type SessionGateway,
} from "./session.gateway.js";
import { SessionService } from "./session.service.js";

const actor: AuthenticatedActor = {
  userId: "72000000-0000-4000-8000-000000000001",
  accessToken: "private-token",
};
const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
};

function createGateway(overrides: Partial<SessionGateway> = {}): SessionGateway {
  return {
    appendMessage: vi.fn(),
    sync: vi.fn(),
    getMessagePage: vi.fn(),
    heartbeat: vi.fn(),
    requestAiHelp: vi.fn(),
    start: vi.fn(),
    extend: vi.fn(),
    startSynthesis: vi.fn(),
    end: vi.fn(),
    ...overrides,
  };
}

describe("SessionService", () => {
  it("forwards reconnect cursors to the authoritative sync gateway", async () => {
    const roomId = "72000000-0000-4000-8000-000000000002";
    const response = {
      sessionId: "72000000-0000-4000-8000-000000000003",
      serverTime: "2026-09-02T00:00:00.000Z",
      room: {
        roomId,
        title: "동기화 방",
        scheduledStartAt: "2026-09-02T00:00:00.000Z",
        packVersionId: "72000000-0000-4000-8000-000000000009",
        bookTitle: "책",
        bookAuthor: "작가",
        bookCoverUrl: null,
      },
      actor: {
        userId: actor.userId,
        role: "HOST" as const,
        membershipStatus: "PARTICIPATED" as const,
        actualParticipation: true,
      },
      state: {
        phase: "OPENING" as const,
        phaseVersion: 1,
        aggregateVersion: 3,
        channelEpoch: 2,
        startedAt: "2026-09-02T00:00:00.000Z",
        endedAt: null,
        extensionCount: 0,
        deadlines: {
          discussionEndsAt: "2026-09-02T00:30:00.000Z",
          extensionPromptedAt: null,
          extensionDecisionDeadlineAt: "2026-09-02T00:25:00.000Z",
          closingStartedAt: null,
          closingEndsAt: null,
        },
      },
      participants: [],
      connectedParticipantCount: 0,
      messages: [],
      events: [],
      cursors: {
        eventCursor: 3,
        latestMessageSeq: 2,
        oldestMessageSeq: null,
        hasMoreMessagesBefore: false,
        hasMoreMessagesAfter: false,
        hasMoreEventsAfter: false,
      },
      publicDiscussion: { currentTopic: null },
      ai: { extensionOpinion: null, latestHostHelpRequest: null },
      closing: null,
      result: { status: "NOT_STARTED", canRetry: false },
      realtime: {
        eventTopic: "session:72000000-0000-4000-8000-000000000003:v2",
        ephemeralTopic:
          "session:72000000-0000-4000-8000-000000000003:v2:ephemeral",
      },
    };
    const gateway = createGateway({ sync: vi.fn().mockResolvedValue(response) });
    const service = new SessionService(gateway, environment);

    await expect(
      service.sync(actor, roomId, {
        afterEventCursor: 1,
        afterMessageSeq: 1,
        messageLimit: 100,
      }),
    ).resolves.toEqual(response);
    expect(gateway.sync).toHaveBeenCalledWith(actor, {
      roomId,
      afterEventCursor: 1,
      afterMessageSeq: 1,
      messageLimit: 100,
    });
  });

  it("forwards backward pagination without inventing a cursor", async () => {
    const roomId = "72000000-0000-4000-8000-000000000002";
    const response = {
      sessionId: "72000000-0000-4000-8000-000000000003",
      serverTime: "2026-09-02T00:00:00.000Z",
      messages: [],
      page: {
        oldestMessageSeq: null,
        newestMessageSeq: null,
        hasMoreBefore: false,
      },
    };
    const gateway = createGateway({
      getMessagePage: vi.fn().mockResolvedValue(response),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.getMessagePage(actor, roomId, { limit: 50 }),
    ).resolves.toEqual(response);
    expect(gateway.getMessagePage).toHaveBeenCalledWith(actor, {
      roomId,
      limit: 50,
    });
  });

  it("forwards one idempotent participant message without changing its text", async () => {
    const response = {
      roomId: "72000000-0000-4000-8000-000000000002",
      message: {
        messageId: "72000000-0000-4000-8000-000000000006",
        sessionId: "72000000-0000-4000-8000-000000000003",
        seqNo: 1,
        kind: "PARTICIPANT" as const,
        author: { userId: actor.userId, profileName: "참가자" },
        clientMessageId: "72000000-0000-4000-8000-000000000007",
        body: "첫 줄\n둘째 줄",
        reply: null,
        confirmedAt: "2026-09-01T12:00:00.000Z",
      },
      aggregateVersion: 1,
      eventCursor: 1,
      channelEpoch: 1,
      duplicate: false,
      serverTime: "2026-09-01T12:00:00.000Z",
    };
    const gateway = createGateway({
      appendMessage: vi.fn().mockResolvedValue(response),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.sendMessage(actor, response.roomId, {
        clientMessageId: response.message.clientMessageId,
        body: response.message.body,
        replyToMessageId: null,
      }),
    ).resolves.toEqual(response);
    expect(gateway.appendMessage).toHaveBeenCalledWith(actor, {
      roomId: response.roomId,
      clientMessageId: response.message.clientMessageId,
      body: "첫 줄\n둘째 줄",
      replyToMessageId: null,
    });
  });

  it("forwards a device heartbeat without treating it as a domain command", async () => {
    const response = {
      roomId: "72000000-0000-4000-8000-000000000002",
      sessionId: "72000000-0000-4000-8000-000000000003",
      deviceId: "72000000-0000-4000-8000-000000000004",
      membershipStatus: "REGISTERED" as const,
      aggregateVersion: 0,
      eventCursor: 0,
      channelEpoch: 1,
      connectedParticipantCount: 1,
      heartbeatIntervalSeconds: 15,
      onlineThresholdSeconds: 30,
      lastSeenAt: "2026-09-01T12:00:00.000Z",
      serverTime: "2026-09-01T12:00:00.000Z",
    };
    const gateway = createGateway({
      heartbeat: vi.fn().mockResolvedValue(response),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.heartbeat(actor, response.roomId, { deviceId: response.deviceId }),
    ).resolves.toEqual(response);
    expect(gateway.heartbeat).toHaveBeenCalledWith(actor, {
      roomId: response.roomId,
      deviceId: response.deviceId,
    });
  });

  it("creates a stable fingerprint for an idempotent start command", async () => {
    const gateway = createGateway({
      start: vi.fn().mockResolvedValue({
        roomId: "72000000-0000-4000-8000-000000000002",
        sessionId: "72000000-0000-4000-8000-000000000003",
        state: {
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
            extensionDecisionDeadlineAt: "2026-09-01T12:25:00.000Z",
            closingStartedAt: null,
            closingEndsAt: null,
          },
        },
        eventCursor: 1,
        connectedParticipantCount: 2,
        minParticipants: 2,
        duplicate: false,
        serverTime: "2026-09-01T12:00:00.000Z",
      }),
    });
    const service = new SessionService(gateway, environment);

    await service.start(actor, "72000000-0000-4000-8000-000000000002", {
      commandId: "72000000-0000-4000-8000-000000000005",
      expectedPhaseVersion: 0,
      payload: {},
    });

    expect(gateway.start).toHaveBeenCalledWith(actor, {
      commandId: "72000000-0000-4000-8000-000000000005",
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      roomId: "72000000-0000-4000-8000-000000000002",
      expectedPhaseVersion: 0,
    });
  });

  it("maps a heartbeat minimum failure to a public conflict", async () => {
    const gateway = createGateway({
      start: vi
        .fn()
        .mockRejectedValue(
          new SessionGatewayError("minimum_connected_participants_not_met"),
        ),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.start(actor, "72000000-0000-4000-8000-000000000002", {
        commandId: "72000000-0000-4000-8000-000000000005",
        expectedPhaseVersion: 0,
        payload: {},
      }),
    ).rejects.toMatchObject({
      code: "MINIMUM_CONNECTED_PARTICIPANTS_NOT_MET",
    });
  });

  it("fingerprints and forwards each host state command independently", async () => {
    const roomId = "72000000-0000-4000-8000-000000000002";
    const request = {
      commandId: "72000000-0000-4000-8000-000000000008",
      expectedPhaseVersion: 3,
      payload: {},
    };
    const state = {
      phase: "EXTENDED" as const,
      phaseVersion: 4,
      aggregateVersion: 8,
      channelEpoch: 1,
      startedAt: "2026-09-01T12:00:00.000Z",
      endedAt: null,
      extensionCount: 1,
      deadlines: {
        discussionEndsAt: "2026-09-01T12:45:00.000Z",
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: "2026-09-01T12:40:00.000Z",
        closingStartedAt: null,
        closingEndsAt: null,
      },
    };
    const gateway = createGateway({
      extend: vi.fn().mockResolvedValue({
        roomId,
        sessionId: "72000000-0000-4000-8000-000000000003",
        state,
        eventCursor: 8,
        duplicate: false,
        serverTime: "2026-09-01T12:23:00.000Z",
      }),
    });
    const service = new SessionService(gateway, environment);

    await service.extend(actor, roomId, request);

    expect(gateway.extend).toHaveBeenCalledWith(actor, {
      commandId: request.commandId,
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      roomId,
      expectedPhaseVersion: 3,
    });
  });

  it("fingerprints and forwards a bounded host-help reason", async () => {
    const roomId = "72000000-0000-4000-8000-000000000002";
    const request = {
      commandId: "72000000-0000-4000-8000-000000000010",
      expectedPhaseVersion: 3,
      reason: "CONVERSATION_STOPPED" as const,
    };
    const gateway = createGateway({
      requestAiHelp: vi.fn().mockResolvedValue({
        roomId,
        sessionId: "72000000-0000-4000-8000-000000000003",
        requestId: "72000000-0000-4000-8000-000000000011",
        jobId: "72000000-0000-4000-8000-000000000012",
        status: "QUEUED",
        retryAvailableAt: "2026-09-01T12:01:30.000Z",
        duplicate: false,
        serverTime: "2026-09-01T12:00:00.000Z",
      }),
    });
    const service = new SessionService(gateway, environment);

    await service.requestAiHelp(actor, roomId, request);

    expect(gateway.requestAiHelp).toHaveBeenCalledWith(actor, {
      ...request,
      roomId,
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it("maps an in-flight host-help request to a public conflict", async () => {
    const gateway = createGateway({
      requestAiHelp: vi
        .fn()
        .mockRejectedValue(new SessionGatewayError("ai_help_request_in_progress")),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.requestAiHelp(actor, "72000000-0000-4000-8000-000000000002", {
        commandId: "72000000-0000-4000-8000-000000000010",
        expectedPhaseVersion: 3,
        reason: "CONVERSATION_STOPPED",
      }),
    ).rejects.toMatchObject({ code: "AI_HELP_REQUEST_IN_PROGRESS" });
  });

  it("maps a closed extension window to a public conflict", async () => {
    const gateway = createGateway({
      extend: vi
        .fn()
        .mockRejectedValue(new SessionGatewayError("session_extension_locked")),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.extend(actor, "72000000-0000-4000-8000-000000000002", {
        commandId: "72000000-0000-4000-8000-000000000008",
        expectedPhaseVersion: 3,
        payload: {},
      }),
    ).rejects.toMatchObject({ code: "SESSION_EXTENSION_LOCKED" });
  });

  it("maps an invalid inline reply target to a public not found error", async () => {
    const gateway = createGateway({
      appendMessage: vi
        .fn()
        .mockRejectedValue(new SessionGatewayError("reply_message_not_found")),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.sendMessage(actor, "72000000-0000-4000-8000-000000000002", {
        clientMessageId: "72000000-0000-4000-8000-000000000007",
        body: "답장입니다.",
        replyToMessageId: "72000000-0000-4000-8000-000000000008",
      }),
    ).rejects.toMatchObject({ code: "REPLY_MESSAGE_NOT_FOUND" });
  });

  it("maps unauthorized recovery to a public forbidden error", async () => {
    const gateway = createGateway({
      sync: vi
        .fn()
        .mockRejectedValue(new SessionGatewayError("session_read_forbidden")),
    });
    const service = new SessionService(gateway, environment);

    await expect(
      service.sync(actor, "72000000-0000-4000-8000-000000000002", {
        afterEventCursor: 0,
        afterMessageSeq: 0,
        messageLimit: 100,
      }),
    ).rejects.toMatchObject({ code: "SESSION_READ_FORBIDDEN" });
  });
});
