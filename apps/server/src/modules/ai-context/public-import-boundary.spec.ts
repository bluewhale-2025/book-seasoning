import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

describe("PUBLIC AI import boundary", () => {
  it("does not import an AI_PRIVATE repository or context module", () => {
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
        `${sourceFile} crossed the PUBLIC/AI_PRIVATE import boundary`,
      ).not.toEqual(
        expect.arrayContaining([
          expect.stringMatching(/ai[-_/]?private|private[-_/]?(prep|context)/i),
        ]),
      );
    }
  });
});
