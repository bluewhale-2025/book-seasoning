import { describe, expect, it, vi } from "vitest";

import { roomId, sessionSnapshotFixture } from "../test/session-fixture";
import { HttpSessionApi, type SessionClientError } from "./session-api";

describe("HttpSessionApi", () => {
  it("adds the user bearer token and parses the public snapshot contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(sessionSnapshotFixture()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new HttpSessionApi("http://api.test", async () => "access-token", fetcher);

    const result = await api.sync(roomId, {
      afterEventCursor: 0,
      afterMessageSeq: 0,
      messageLimit: 100,
    });

    expect(result.room.roomId).toBe(roomId);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/rooms/${roomId}/session/sync?`),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer access-token" }),
      }),
    );
  });

  it("does not issue a request without an authenticated session", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const api = new HttpSessionApi("http://api.test", async () => null, fetcher);

    await expect(
      api.sync(roomId, { afterEventCursor: 0, afterMessageSeq: 0, messageLimit: 100 }),
    ).rejects.toEqual(expect.objectContaining<Partial<SessionClientError>>({ code: "AUTH_REQUIRED" }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts an idempotent extension command to the session control route", async () => {
    const snapshot = sessionSnapshotFixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          roomId,
          sessionId: snapshot.sessionId,
          state: {
            ...snapshot.state,
            phase: "EXTENDED",
            phaseVersion: 2,
            aggregateVersion: 2,
            extensionCount: 1,
            deadlines: {
              ...snapshot.state.deadlines,
              discussionEndsAt: "2026-09-02T10:45:00.000Z",
              extensionPromptedAt: null,
              extensionDecisionDeadlineAt: "2026-09-02T10:40:00.000Z",
            },
          },
          eventCursor: 2,
          duplicate: false,
          serverTime: snapshot.serverTime,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const api = new HttpSessionApi("http://api.test", async () => "token", fetcher);
    const request = {
      commandId: "97000000-0000-4000-8000-000000000001",
      expectedPhaseVersion: 1,
      payload: {},
    };

    await expect(api.extendSession(roomId, request)).resolves.toMatchObject({
      state: { phase: "EXTENDED", extensionCount: 1 },
    });
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.test/v1/rooms/${roomId}/session/extend`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("starts a scheduled session with the authoritative phase version", async () => {
    const snapshot = sessionSnapshotFixture();
    const response = {
      roomId,
      sessionId: snapshot.sessionId,
      state: snapshot.state,
      eventCursor: 1,
      connectedParticipantCount: 2,
      minParticipants: 2,
      duplicate: false,
      serverTime: snapshot.serverTime,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpSessionApi("http://api.test", async () => "token", fetcher);
    const request = {
      commandId: "97000000-0000-4000-8000-000000000001",
      expectedPhaseVersion: 0,
      payload: {},
    };

    await expect(api.startSession(roomId, request)).resolves.toMatchObject({
      state: { phase: "OPENING" },
      connectedParticipantCount: 2,
    });
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.test/v1/rooms/${roomId}/session/start`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("writes a private closing response through the closing command route", async () => {
    const snapshot = sessionSnapshotFixture();
    const response = {
      roomId,
      sessionId: snapshot.sessionId,
      closing: {
        eligibleParticipantCount: 2,
        completedParticipantCount: 1,
        actorResponse: {
          status: "SUBMITTED",
          revision: 1,
          body: "서로 다른 침묵을 보게 되었다.",
          updatedAt: snapshot.serverTime,
        },
      },
      aggregateVersion: 2,
      eventCursor: 2,
      duplicate: false,
      officiallyEnded: false,
      serverTime: snapshot.serverTime,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new HttpSessionApi("http://api.test", async () => "token", fetcher);
    const request = {
      commandId: "97000000-0000-4000-8000-000000000002",
      expectedPhaseVersion: 3,
      expectedRevision: 0,
      status: "SUBMITTED" as const,
      body: "서로 다른 침묵을 보게 되었다.",
    };

    await expect(api.upsertClosingResponse(roomId, request)).resolves.toMatchObject({
      closing: { actorResponse: { status: "SUBMITTED", revision: 1 } },
    });
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.test/v1/rooms/${roomId}/session/closing/response`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(request) }),
    );
  });

  it("loads the official result from its read-only route", async () => {
    const snapshot = sessionSnapshotFixture();
    const response = {
      roomId,
      sessionId: snapshot.sessionId,
      status: "INSUFFICIENT",
      canRetry: false,
      record: null,
      closingLines: [],
      readyAt: null,
      serverTime: snapshot.serverTime,
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new HttpSessionApi("http://api.test", async () => "token", fetcher);

    await expect(api.getDiscussionResult(roomId)).resolves.toMatchObject({
      status: "INSUFFICIENT",
      record: null,
    });
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.test/v1/rooms/${roomId}/session/result`,
      expect.objectContaining({ method: "GET" }),
    );
  });
});
