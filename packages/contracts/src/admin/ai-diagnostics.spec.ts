import { describe, expect, it } from "vitest";

import { createAiDiagnosticsFixture } from "./ai-diagnostics.fixture.js";
import { AdminAiDiagnosticsSchema } from "./ai-diagnostics.js";

describe("admin AI diagnostics privacy contract", () => {
  it("accepts content-free observations and rejects content at every boundary", () => {
    const fixture = createAiDiagnosticsFixture();
    expect(AdminAiDiagnosticsSchema.safeParse(fixture).success).toBe(true);
    const evaluation = fixture.evaluations[0]!;
    for (const value of [
      { ...fixture, canonicalResult: { aiPrivate: "CANARY" } },
      { ...fixture, evaluations: [{ ...evaluation, summaryState: "CANARY" }] },
      { ...fixture, evaluations: [{ ...evaluation, reasonCodes: ["AI_PRIVATE_CANARY_SECRET"] }] },
      { ...fixture, evaluations: [{ ...evaluation, metrics: {
        ...evaluation.metrics, depth: { ...evaluation.metrics.depth, evidenceRefs: ["CANARY"] },
      } }] },
    ]) {
      expect(AdminAiDiagnosticsSchema.safeParse(value).success).toBe(false);
    }
  });
});
