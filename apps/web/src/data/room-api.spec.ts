import { describe, expect, it, vi } from "vitest";

import { AuthenticatedHttpClient } from "./http-client";
import { HttpRoomApi } from "./room-api";

describe("HttpRoomApi", () => {
  it("posts the exact pack version and idempotent command when creating a room", async () => {
    const response = {
      roomId: "90000000-0000-4000-8000-000000000001",
      aggregateVersion: 1,
      duplicate: false,
      serverTime: "2026-09-02T10:00:00.000Z",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpRoomApi(new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher,
    }));
    const request = {
      commandId: "93000000-0000-4000-8000-000000000001",
      payload: {
        title: "몸과 선택의 경계",
        packVersionId: "91000000-0000-4000-8000-000000000001",
        scheduledStartAt: "2026-09-05T20:00:00.000Z",
        password: "join-us",
        minParticipants: 2,
        maxParticipants: 6,
      },
    };

    await expect(api.createRoom(request)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/rooms",
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("serializes room search without exposing membership data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpRoomApi(new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher,
    }));

    await api.searchRooms({ query: "  한강  ", limit: 20 });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/rooms?query=%ED%95%9C%EA%B0%95&limit=20",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("sends the latest aggregate version with host administration commands", async () => {
    const response = {
      roomId: "90000000-0000-4000-8000-000000000001",
      aggregateVersion: 4,
      duplicate: false,
      serverTime: "2026-09-02T10:00:00.000Z",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpRoomApi(new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher,
    }));
    const request = {
      commandId: "93000000-0000-4000-8000-000000000001",
      expectedVersion: 3,
      payload: { targetUserId: "90000000-0000-4000-8000-000000000004" },
    };

    await expect(api.transferHost(response.roomId, request)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      `http://api.test/v1/rooms/${response.roomId}/host/transfer`,
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
  });

  it("keeps AI-private prep text on the dedicated prep command only", async () => {
    const response = {
      entryId: "94000000-0000-4000-8000-000000000001",
      revision: 1,
      duplicate: false,
      serverTime: "2026-09-02T10:00:00.000Z",
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpRoomApi(new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher,
    }));
    const request = {
      commandId: "93000000-0000-4000-8000-000000000001",
      payload: {
        entryId: response.entryId,
        promptType: "DISCUSSION_QUESTION" as const,
        visibility: "AI_PRIVATE" as const,
        body: "다른 참가자에게 공개하지 않을 관점",
      },
    };

    await expect(api.upsertPrepEntry("90000000-0000-4000-8000-000000000001", request)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/rooms/90000000-0000-4000-8000-000000000001/prep",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(request) }),
    );
  });
});
