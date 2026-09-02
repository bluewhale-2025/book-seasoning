import { describe, expect, it } from "vitest";

import { RoomPasswordAttemptLimiter } from "./room-password-attempt-limiter.js";

describe("RoomPasswordAttemptLimiter", () => {
  it("limits five recent failures only for the same actor and room", () => {
    const limiter = new RoomPasswordAttemptLimiter();
    const actorId = "50000000-0000-4000-8000-000000000001";
    const roomId = "51000000-0000-4000-8000-000000000001";

    for (let index = 0; index < 5; index += 1) {
      limiter.recordFailure(actorId, roomId, 1_000 + index);
    }

    expect(limiter.isAllowed(actorId, roomId, 2_000)).toBe(false);
    expect(
      limiter.isAllowed("50000000-0000-4000-8000-000000000002", roomId, 2_000),
    ).toBe(true);
    expect(limiter.isAllowed(actorId, roomId, 62_000)).toBe(true);
  });
});

