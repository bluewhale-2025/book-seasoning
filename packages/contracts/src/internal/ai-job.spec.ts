import { describe, expect, it } from "vitest";

import {
  AiJobContentLeakFixture,
  AiJobEnvelopeV1Fixture,
  AiJobPrivateLeakFixture,
} from "./ai-job.fixture.js";
import { AiJobEnvelopeV1Schema } from "./ai-job.js";

describe("AiJobEnvelopeV1Schema", () => {
  it("accepts the canonical reference-only job envelope", () => {
    expect(AiJobEnvelopeV1Schema.parse(AiJobEnvelopeV1Fixture)).toEqual(
      AiJobEnvelopeV1Fixture,
    );
  });

  it("rejects discussion and AI_PRIVATE content in queue payloads", () => {
    expect(AiJobEnvelopeV1Schema.safeParse(AiJobContentLeakFixture).success).toBe(
      false,
    );
    expect(AiJobEnvelopeV1Schema.safeParse(AiJobPrivateLeakFixture).success).toBe(
      false,
    );
  });

  it("rejects unknown task types and invalid freshness coordinates", () => {
    expect(
      AiJobEnvelopeV1Schema.safeParse({
        ...AiJobEnvelopeV1Fixture,
        jobType: "ARBITRARY_PROMPT",
      }).success,
    ).toBe(false);
    expect(
      AiJobEnvelopeV1Schema.safeParse({
        ...AiJobEnvelopeV1Fixture,
        targetThroughSeq: -1,
      }).success,
    ).toBe(false);
  });
});
