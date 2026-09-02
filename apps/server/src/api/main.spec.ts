import { afterEach, describe, expect, it } from "vitest";

import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import type { RuntimeEnvironment } from "../config/environment.js";
import { createApiApplication } from "./main.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test-release",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
};

describe("API bootstrap", () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("serves a schema-validated liveness response", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(response.json()).toMatchObject({
      status: "ok",
      service: "bookseasoning",
      runtime: "api",
      release: "test-release",
    });
  });

  it("serves readiness separately from process liveness", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      runtime: "api",
      release: "test-release",
    });
  });

  it("returns a stable public error without framework details", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const response = await app.inject({ method: "GET", url: "/missing" });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body).toMatchObject({
      code: "NOT_FOUND",
      message: "요청한 대상을 찾을 수 없습니다.",
    });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("protects product routes when a bearer token is missing", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const response = await app.inject({ method: "GET", url: "/v1/me/profile" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      code: "AUTH_REQUIRED",
      message: "로그인이 필요합니다.",
    });
  });

  it("protects the published book catalog", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const response = await app.inject({ method: "GET", url: "/v1/books" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("protects room search and commands", async () => {
    app = await createApiApplication(environment);
    await app.init();

    const search = await app.inject({ method: "GET", url: "/v1/rooms" });
    const create = await app.inject({ method: "POST", url: "/v1/rooms" });

    expect(search.statusCode).toBe(401);
    expect(create.statusCode).toBe(401);
  });

  it("protects Slice 2 room detail, join, my rooms and prep routes", async () => {
    app = await createApiApplication(environment);
    await app.init();
    const roomId = "63000000-0000-4000-8000-000000000001";
    const responses = await Promise.all([
      app.inject({ method: "GET", url: "/v1/rooms/mine" }),
      app.inject({ method: "GET", url: `/v1/rooms/${roomId}` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/join` }),
      app.inject({ method: "GET", url: `/v1/rooms/${roomId}/prep` }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401, 401,
    ]);
  });

  it("protects session reads and all session commands", async () => {
    app = await createApiApplication(environment);
    await app.init();
    const roomId = "63000000-0000-4000-8000-000000000001";
    const responses = await Promise.all([
      app.inject({ method: "GET", url: `/v1/rooms/${roomId}/session/sync` }),
      app.inject({ method: "GET", url: `/v1/rooms/${roomId}/session/messages` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/messages` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/heartbeat` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/start` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/ai-help` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/extend` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/synthesis` }),
      app.inject({ method: "POST", url: `/v1/rooms/${roomId}/session/end` }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401, 401,
    ]);
  });
});
