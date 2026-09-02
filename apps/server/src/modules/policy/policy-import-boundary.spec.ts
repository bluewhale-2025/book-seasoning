import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const policySources = [
  "deterministic-policy.engine.ts",
  "policy-application.service.ts",
  "policy.repository.ts",
  "postgres-policy.repository.ts",
  "policy.module.ts",
];

describe("Policy PUBLIC-lane import boundary", () => {
  it("does not import AI_PRIVATE repositories, private context or Host generation", async () => {
    const contents = await Promise.all(
      policySources.map((file) => readFile(join(moduleDirectory, file), "utf8")),
    );
    const combined = contents.join("\n");

    expect(combined).not.toMatch(/ai-private|private-evaluator|private-context/i);
    expect(combined).not.toMatch(/host-intervention|ai-host/i);
  });
});
