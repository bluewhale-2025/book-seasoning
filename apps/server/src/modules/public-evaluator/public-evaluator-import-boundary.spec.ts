import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

describe("PUBLIC Evaluator import boundary", () => {
  it("cannot import AI_PRIVATE or user-facing Host modules", () => {
    const sourceFiles = readdirSync(moduleDirectory).filter(
      (name) => name.endsWith(".ts") && !name.endsWith(".spec.ts"),
    );

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(join(moduleDirectory, sourceFile), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (match) => match[1] ?? "",
      );

      expect(
        imports,
        `${sourceFile} crossed the PUBLIC Evaluator boundary`,
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(
            /ai[-_/]?private|private[-_/]?(prep|context)|ai-host|host-context/i,
          ),
        ]),
      );
    }
  });
});
