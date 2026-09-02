import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "infrastructure" ? [] : sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("provider SDK import boundary", () => {
  it("keeps OpenAI SDK imports inside infrastructure", () => {
    for (const path of sourceFiles(sourceRoot)) {
      expect(readFileSync(path, "utf8"), path).not.toMatch(
        /from\s+["']openai(?:\/[^"']+)?["']/,
      );
    }
  });
});
