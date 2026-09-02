import { describe, expect, it } from "vitest";

import { PublicEvaluatorOutputV1Fixture } from "@bookseasoning/contracts/internal";

import type { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { evaluatorContext, evaluatorJob } from "./public-evaluator.fixture.js";
import { GatewayPublicEvaluator } from "./gateway-public-evaluator.js";

describe("GatewayPublicEvaluator", () => {
  it("sends an exact evidence catalog and output envelope to the provider", async () => {
    const calls: unknown[][] = [];
    const generation = {
      generate: (...args: unknown[]) => {
        calls.push(args);
        return Promise.resolve({ output: PublicEvaluatorOutputV1Fixture });
      },
    } as unknown as AiGenerationService;
    const subject = new GatewayPublicEvaluator(generation);

    await expect(
      subject.evaluate({
        jobId: evaluatorJob.jobId,
        attemptNo: 1,
        task: "INCREMENTAL",
        context: evaluatorContext,
      }),
    ).resolves.toEqual(PublicEvaluatorOutputV1Fixture);

    expect(calls[0]?.[1]).toMatchObject({
      promptVersion: "public-evaluator.v7",
      outputSchemaVersion: "public-evaluator-provider-observation.v3",
    });
    expect(calls[0]?.[2]).toMatchObject({
      context: evaluatorContext,
      requiredOutputEnvelope: {
        packVersionId: evaluatorContext.session.pinnedPackVersionId,
        baseWikiVersion: evaluatorContext.baseWiki?.version,
        targetThroughSeq: evaluatorContext.session.targetThroughSeq,
      },
      allowedEvidenceCatalog: expect.arrayContaining([
        expect.objectContaining({
          index: expect.any(Number),
          reference: {
            type: "MESSAGE",
            messageId: evaluatorContext.messages[1]?.messageId,
            seqNo: 4,
          },
        }),
      ]),
    });
  });
});
