import { describe, expect, it } from "vitest";

import {
  CreateRoomRequestSchema,
  JoinRoomRequestSchema,
  RoomSearchQuerySchema,
  UpsertPrepEntryRequestSchema,
} from "./room.js";

describe("room contracts", () => {
  it("accepts the confirmed capacity and password boundaries", () => {
    expect(
      CreateRoomRequestSchema.parse({
        commandId: "33000000-0000-4000-8000-000000000001",
        payload: {
          title: "  토론방  ",
          packVersionId: "32000000-0000-4000-8000-000000000001",
          scheduledStartAt: "2026-09-02T10:00:00+09:00",
          password: "Ab!1",
          minParticipants: 2,
          maxParticipants: 15,
        },
      }).payload.title,
    ).toBe("토론방");
  });

  it("rejects an inverted capacity and short password", () => {
    expect(() =>
      CreateRoomRequestSchema.parse({
        commandId: "33000000-0000-4000-8000-000000000001",
        payload: {
          title: "토론방",
          packVersionId: "32000000-0000-4000-8000-000000000001",
          scheduledStartAt: "2026-09-02T10:00:00Z",
          password: "123",
          minParticipants: 5,
          maxParticipants: 2,
        },
      }),
    ).toThrow();
  });

  it("provides stable room search defaults", () => {
    expect(RoomSearchQuerySchema.parse({})).toEqual({ query: "", limit: 20 });
  });

  it("allows an existing member to request re-entry without a password", () => {
    expect(
      JoinRoomRequestSchema.parse({
        commandId: "33000000-0000-4000-8000-000000000002",
        payload: {},
      }),
    ).toEqual({
      commandId: "33000000-0000-4000-8000-000000000002",
      payload: {},
    });
  });

  it("keeps prep visibility explicit", () => {
    expect(
      UpsertPrepEntryRequestSchema.parse({
        commandId: "33000000-0000-4000-8000-000000000003",
        payload: {
          entryId: "33000000-0000-4000-8000-000000000004",
          promptType: "DISCUSSION_QUESTION",
          visibility: "AI_PRIVATE",
          body: "다른 사람에게 보이지 않을 질문",
        },
      }).payload.visibility,
    ).toBe("AI_PRIVATE");
  });
});
