import { describe, expect, it, vi } from "vitest";
import type { FastifyReply } from "fastify";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { AiDiagnosticsController } from "./ai-diagnostics.module.js";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../infrastructure/supabase/user-client.js", () => ({
  createUserSupabaseClient: () => ({ rpc }),
}));

const environment: RuntimeEnvironment = {
  nodeEnv: "test", runtime: "api", host: "127.0.0.1", port: 3000,
  logLevel: "error", release: "test", corsOrigins: [],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
};
const actor = { userId: "ac100000-0000-4000-8000-000000000001", accessToken: "test-only" };
const roomId = "ac400000-0000-4000-8000-000000000001";
const reply = { header: vi.fn() } as unknown as FastifyReply;

describe("admin AI diagnostics HTTP boundary", () => {
  it.each(["admin_required", "session_access_denied"])("preserves DB denial: %s", async (message) => {
    rpc.mockResolvedValue({ data: null, error: { message, code: "42501" } });
    await expect(new AiDiagnosticsController(environment).get(actor, roomId, reply))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(rpc).toHaveBeenLastCalledWith("admin_read_session_ai_diagnostics", { p_room_id: roomId });
    expect(reply.header).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("rejects unprojected context instead of returning it", async () => {
    rpc.mockResolvedValue({ data: { canonicalResult: "AI_PRIVATE_CANARY" }, error: null });
    await expect(new AiDiagnosticsController(environment).get(actor, roomId, reply)).rejects.toThrow();
  });

  it("preserves the known Supabase unavailable classification", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST303", message: "JWT issued at future" } });
    await expect(new AiDiagnosticsController(environment).get(actor, roomId, reply))
      .rejects.toMatchObject({ dependencyCode: "SUPABASE_POSTGREST_JWT_TIME_STALE" });
  });
});
