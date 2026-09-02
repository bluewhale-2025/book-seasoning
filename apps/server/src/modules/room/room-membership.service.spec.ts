import { describe, expect, it, vi } from "vitest";

import type { RuntimeEnvironment } from "../../config/environment.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { RoomMembershipGateway } from "./room.gateway.js";
import { RoomMembershipService } from "./room-membership.service.js";
import { RoomPasswordAttemptLimiter } from "./room-password-attempt-limiter.js";
import type { RoomPasswordHasher } from "./room-password-hasher.js";

const actor: AuthenticatedActor = {
  userId: "30000000-0000-4000-8000-000000000001",
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

function createGateway(
  overrides: Partial<RoomMembershipGateway> = {},
): RoomMembershipGateway {
  return {
    getJoinChallenge: vi.fn(),
    recordPasswordFailure: vi.fn(),
    authorizeJoin: vi.fn(),
    join: vi.fn(),
    cancelMembership: vi.fn(),
    ...overrides,
  };
}

describe("RoomMembershipService", () => {
  it("verifies a password before creating a short-lived join authorization", async () => {
    const gateway = createGateway({
      getJoinChallenge: vi.fn().mockResolvedValue({
        state: "PASSWORD_REQUIRED",
        passwordHash: "$argon2id$verified-hash",
        passwordVersion: 2,
      }),
      join: vi.fn().mockResolvedValue({
        roomId: "34000000-0000-4000-8000-000000000001",
        aggregateVersion: 2,
        duplicate: false,
        serverTime: "2026-09-01T00:00:00.000Z",
        membershipStatus: "REGISTERED",
        participantCount: 2,
      }),
    });
    const passwordHasher: RoomPasswordHasher = {
      hash: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
    };
    const service = new RoomMembershipService(
      gateway,
      passwordHasher,
      environment,
      new RoomPasswordAttemptLimiter(),
    );

    await service.join(actor, "34000000-0000-4000-8000-000000000001", {
      commandId: "33000000-0000-4000-8000-000000000009",
      payload: { password: "Room!42" },
    });

    expect(gateway.authorizeJoin).toHaveBeenCalledWith(
      actor,
      "34000000-0000-4000-8000-000000000001",
      2,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(gateway.join).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        authorizationToken: expect.any(String),
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
});
