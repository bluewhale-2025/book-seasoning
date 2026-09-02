import { describe, expect, it, vi } from "vitest";

import type { CreateRoomRequest } from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { RoomAdministrationService } from "./room-administration.service.js";
import type { RoomAdministrationGateway } from "./room.gateway.js";
import type { RoomPasswordHasher } from "./room-password-hasher.js";

const actor: AuthenticatedActor = {
  userId: "30000000-0000-4000-8000-000000000001",
  accessToken: "private-token",
};
const request: CreateRoomRequest = {
  commandId: "33000000-0000-4000-8000-000000000001",
  payload: {
    title: "토론방",
    packVersionId: "32000000-0000-4000-8000-000000000001",
    scheduledStartAt: "2026-09-02T01:00:00.000Z",
    password: "Room!42",
    minParticipants: 2,
    maxParticipants: 5,
  },
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
  overrides: Partial<RoomAdministrationGateway> = {},
): RoomAdministrationGateway {
  return {
    create: vi.fn(),
    update: vi.fn(),
    cancelRoom: vi.fn(),
    transferHost: vi.fn(),
    removeMember: vi.fn(),
    ...overrides,
  };
}

describe("RoomAdministrationService", () => {
  it("hashes the room password before calling the persistence gateway", async () => {
    const gateway = createGateway({
      create: vi.fn().mockResolvedValue({
        roomId: "34000000-0000-4000-8000-000000000001",
        aggregateVersion: 1,
        duplicate: false,
        serverTime: "2026-09-01T00:00:00.000Z",
      }),
    });
    const passwordHasher: RoomPasswordHasher = {
      hash: vi.fn().mockResolvedValue("$argon2id$verified-hash"),
      verify: vi.fn(),
    };
    const service = new RoomAdministrationService(gateway, passwordHasher, environment);

    await service.create(actor, request);

    expect(passwordHasher.hash).toHaveBeenCalledWith("Room!42");
    expect(gateway.create).toHaveBeenCalledWith(actor, {
      commandId: request.commandId,
      payload: {
        title: "토론방",
        packVersionId: request.payload.packVersionId,
        scheduledStartAt: request.payload.scheduledStartAt,
        minParticipants: 2,
        maxParticipants: 5,
        passwordHash: "$argon2id$verified-hash",
      },
      requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(JSON.stringify(vi.mocked(gateway.create).mock.calls)).not.toContain(
      "Room!42",
    );
  });
});
