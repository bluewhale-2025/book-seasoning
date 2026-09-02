import { describe, expect, it } from "vitest";

import { HealthStatusSchema } from "./health.js";

describe("HealthStatusSchema", () => {
  it("accepts the public health allow-list", () => {
    expect(
      HealthStatusSchema.parse({
        status: "ok",
        service: "bookseasoning",
        runtime: "api",
        release: "local",
        timestamp: "2026-09-01T00:00:00.000Z",
      }),
    ).toEqual({
      status: "ok",
      service: "bookseasoning",
      runtime: "api",
      release: "local",
      timestamp: "2026-09-01T00:00:00.000Z",
    });
  });

  it("rejects private or operational fields", () => {
    expect(() =>
      HealthStatusSchema.parse({
        status: "ok",
        service: "bookseasoning",
        runtime: "api",
        release: "local",
        timestamp: "2026-09-01T00:00:00.000Z",
        secretKey: "must-not-leak",
      }),
    ).toThrow();
  });
});
