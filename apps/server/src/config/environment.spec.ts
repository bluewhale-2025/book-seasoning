import { describe, expect, it } from "vitest";

import {
  EnvironmentValidationError,
  loadEnvironment,
} from "./environment.js";

describe("loadEnvironment", () => {
  it("provides safe local defaults", () => {
    expect(loadEnvironment("api", {})).toMatchObject({
      nodeEnv: "development",
      runtime: "api",
      host: "0.0.0.0",
      port: 3000,
      logLevel: "info",
      release: "local",
      corsOrigins: ["http://localhost:5173"],
      openAiEvaluatorModel: "gpt-5.6-luna",
      openAiHostModel: "gpt-5.6-terra",
      openAiTimeoutMs: 120_000,
    });
  });

  it("requires Supabase URL and publishable key together", () => {
    expect(() =>
      loadEnvironment("api", {
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it("does not include a secret value in validation errors", () => {
    const secret = "this-value-must-not-appear";

    expect(() =>
      loadEnvironment("worker", {
        NODE_ENV: "production",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SECRET_KEY: secret,
      }),
    ).toThrowError(
      expect.objectContaining({
        message: expect.not.stringContaining(secret),
      }),
    );
  });

  it("requires server-only keys for a production API", () => {
    expect(() =>
      loadEnvironment("api", {
        NODE_ENV: "production",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
      }),
    ).toThrowError(
      expect.objectContaining({
        fields: expect.arrayContaining([
          "COMMAND_FINGERPRINT_KEY",
          "KAKAO_REST_API_KEY",
          "SUPABASE_SECRET_KEY",
        ]),
      }),
    );
  });

  it("loads the server-only Kakao REST API key", () => {
    expect(loadEnvironment("api", {
      KAKAO_REST_API_KEY: "kakao-rest-api-key",
    }).kakaoRestApiKey).toBe("kakao-rest-api-key");
  });

  it("requires a direct database URL for the production worker", () => {
    expect(() =>
      loadEnvironment("worker", {
        NODE_ENV: "production",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SECRET_KEY: "sb_secret_example",
        COMMAND_FINGERPRINT_KEY: "a".repeat(32),
      }),
    ).toThrowError(
      expect.objectContaining({
        fields: expect.arrayContaining(["WORKER_DATABASE_URL"]),
      }),
    );
  });

  it("requires the AI provider key for the production worker", () => {
    expect(() =>
      loadEnvironment("worker", {
        NODE_ENV: "production",
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
        SUPABASE_SECRET_KEY: "sb_secret_example",
        WORKER_DATABASE_URL:
          "postgresql://worker:password@127.0.0.1:54322/postgres",
        COMMAND_FINGERPRINT_KEY: "a".repeat(32),
      }),
    ).toThrowError(
      expect.objectContaining({
        fields: expect.arrayContaining(["OPENAI_API_KEY"]),
      }),
    );
  });

  it("accepts a worker-scoped Postgres connection URL", () => {
    expect(
      loadEnvironment("worker", {
        WORKER_DATABASE_URL:
          "postgresql://worker:password@127.0.0.1:54322/postgres",
      }).workerDatabaseUrl,
    ).toBe("postgresql://worker:password@127.0.0.1:54322/postgres");
  });
});
