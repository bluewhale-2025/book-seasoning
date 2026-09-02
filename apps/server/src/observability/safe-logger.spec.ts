import { describe, expect, it } from "vitest";

import type { RuntimeEnvironment } from "../config/environment.js";
import { SafeLogger } from "./safe-logger.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "debug",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
};

describe("SafeLogger", () => {
  it("redacts known credentials and email addresses", () => {
    const output: string[] = [];
    const logger = new SafeLogger(environment, (line) => output.push(line));

    logger.log(
      "Bearer abc.def token=top-secret person@example.com ai_private=canary",
    );

    expect(output).toHaveLength(1);
    expect(output[0]).not.toContain("abc.def");
    expect(output[0]).not.toContain("top-secret");
    expect(output[0]).not.toContain("person@example.com");
    expect(output[0]).not.toContain("canary");
  });

  it("does not serialize arbitrary objects", () => {
    const output: string[] = [];
    const logger = new SafeLogger(environment, (line) => output.push(line));

    logger.log({ messageBody: "private conversation" });

    expect(output[0]).toContain("structured_message_omitted");
    expect(output[0]).not.toContain("private conversation");
  });
});
