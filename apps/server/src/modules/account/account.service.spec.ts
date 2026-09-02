import { HttpStatus } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { DeleteAccountRequest } from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { AccountGateway } from "./account.gateway.js";
import { AccountGatewayError } from "./account.gateway.js";
import { AccountService } from "./account.service.js";

const actor: AuthenticatedActor = {
  userId: "10000000-0000-4000-8000-000000000001",
  accessToken: "private-token",
};
const deletionId = "10000000-0000-4000-8000-000000000002";
const request: DeleteAccountRequest = {
  commandId: "10000000-0000-4000-8000-000000000003",
  currentPassword: "correct-password",
  confirmPermanentDeletion: true,
};
const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-32-bytes",
};

const gateway = (): AccountGateway => ({
  preview: vi.fn().mockResolvedValue({
    allowed: true,
    blockers: [],
    affected: { messages: 1, publicPrep: 1, privatePrep: 1, closingResponses: 1 },
  }),
  getEmail: vi.fn().mockResolvedValue("reader@example.com"),
  verifyPassword: vi.fn().mockResolvedValue(true),
  prepare: vi.fn().mockResolvedValue({
    deletionId,
    status: "PROCESSING",
    duplicate: false,
    serverTime: "2026-09-02T00:00:00.000Z",
  }),
  deleteAuthUser: vi.fn().mockResolvedValue("DELETED"),
  complete: vi.fn().mockResolvedValue(undefined),
  fail: vi.fn().mockResolvedValue(undefined),
});

describe("AccountService", () => {
  it("stops before password verification when product blockers exist", async () => {
    const accountGateway = gateway();
    vi.mocked(accountGateway.preview).mockResolvedValue({
      allowed: false,
      blockers: ["ACTIVE_PARTICIPATION"],
      affected: { messages: 0, publicPrep: 0, privatePrep: 0, closingResponses: 0 },
    });
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_BLOCKED",
      status: HttpStatus.CONFLICT,
    });
    expect(accountGateway.verifyPassword).not.toHaveBeenCalled();
    expect(accountGateway.prepare).not.toHaveBeenCalled();
  });

  it("rejects an invalid current password before preparing deletion", async () => {
    const accountGateway = gateway();
    vi.mocked(accountGateway.verifyPassword).mockResolvedValue(false);
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).rejects.toMatchObject({
      code: "CURRENT_PASSWORD_INVALID",
      status: HttpStatus.UNAUTHORIZED,
    });
    expect(accountGateway.prepare).not.toHaveBeenCalled();
  });

  it("prepares, hard-deletes Auth, and completes the durable request", async () => {
    const accountGateway = gateway();
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).resolves.toMatchObject({
      deletionId,
      status: "COMPLETED",
      duplicate: false,
    });
    expect(accountGateway.getEmail).toHaveBeenCalledWith(actor.userId);
    expect(accountGateway.verifyPassword).toHaveBeenCalledWith(
      actor.userId,
      "reader@example.com",
      request.currentPassword,
    );
    expect(accountGateway.prepare).toHaveBeenCalledWith(
      actor,
      request.commandId,
      expect.any(String),
    );
    expect(accountGateway.deleteAuthUser).toHaveBeenCalledWith(actor.userId);
    expect(accountGateway.complete).toHaveBeenCalledWith(deletionId);
  });

  it("records a retry when Auth deletion fails and returns a pending response", async () => {
    const accountGateway = gateway();
    vi.mocked(accountGateway.deleteAuthUser).mockRejectedValue(
      new AccountGatewayError("account_auth_delete_failed"),
    );
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).rejects.toSatisfy((error) => {
      return (
        error instanceof PublicHttpException &&
        error.code === "ACCOUNT_DELETION_PENDING" &&
        error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
      );
    });
    expect(accountGateway.fail).toHaveBeenCalledWith(
      deletionId,
      "AUTH_DELETE_FAILED",
    );
  });

  it("returns completion after Auth deletion even if bookkeeping needs recovery", async () => {
    const accountGateway = gateway();
    vi.mocked(accountGateway.complete).mockRejectedValue(
      new AccountGatewayError("account_deletion_complete_failed"),
    );
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).resolves.toMatchObject({
      deletionId,
      status: "COMPLETED",
    });
  });

  it("does not let a failed recovery marker hide the deletion-pending result", async () => {
    const accountGateway = gateway();
    vi.mocked(accountGateway.deleteAuthUser).mockRejectedValue(
      new AccountGatewayError("account_auth_delete_failed"),
    );
    vi.mocked(accountGateway.fail).mockRejectedValue(new Error("database unavailable"));
    const service = new AccountService(accountGateway, environment);

    await expect(service.delete(actor, request)).rejects.toMatchObject({
      code: "ACCOUNT_DELETION_PENDING",
    });
  });
});
