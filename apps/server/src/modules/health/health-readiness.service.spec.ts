import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { HealthReadinessService } from "./health-readiness.service.js";

const production: RuntimeEnvironment = {
  nodeEnv: "production",
  runtime: "api",
  host: "0.0.0.0",
  port: 3000,
  logLevel: "info",
  release: "test",
  corsOrigins: ["https://example.test"],
  supabaseUrl: "https://project.supabase.co",
  supabasePublishableKey: "sb_publishable_test",
  supabaseSecretKey: "sb_secret_test",
  commandFingerprintKey: "test-command-fingerprint-key-32-bytes",
};

describe("HealthReadinessService", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reports ready when the Supabase REST dependency responds", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetcher);
    const service = new HealthReadinessService(production);

    await expect(service.check()).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://project.supabase.co/rest/v1/"),
      expect.objectContaining({
        method: "HEAD",
        headers: { apikey: "sb_publishable_test" },
      }),
    );
  });

  it("reports not ready without throwing or leaking dependency errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret details")));
    const service = new HealthReadinessService(production);

    await expect(service.check()).resolves.toBe(false);
  });

  it("allows a dependency-free local application to become ready", async () => {
    const service = new HealthReadinessService({
      nodeEnv: "test",
      runtime: "api",
      host: "127.0.0.1",
      port: 3000,
      logLevel: "error",
      release: "test",
      corsOrigins: ["http://localhost:5173"],
      commandFingerprintKey: "test-command-fingerprint-key-32-bytes",
    });

    await expect(service.check()).resolves.toBe(true);
  });
});
