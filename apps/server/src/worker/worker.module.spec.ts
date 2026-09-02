import { NestFactory } from "@nestjs/core";
import { describe, expect, it } from "vitest";

import type { RuntimeEnvironment } from "../config/environment.js";
import { WorkerModule } from "./worker.module.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "worker",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-32-bytes",
};

describe("WorkerModule", () => {
  it("boots without opening an HTTP listener when the queue is disabled", async () => {
    const app = await NestFactory.createApplicationContext(
      WorkerModule.register(environment),
      { logger: false },
    );

    expect(app).toBeDefined();
    await app.close();
  });
});
