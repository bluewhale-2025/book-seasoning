import { describe, expect, it } from "vitest";

import {
  AiJobEnvelopeV1Fixture,
  PolicyWaitDecisionV1Fixture,
} from "@bookseasoning/contracts/internal";

import { evaluatorContext } from "../public-evaluator/public-evaluator.fixture.js";
import type { AiOrchestrationRepository } from "./ai-orchestration.repository.js";
import type { ClaimedAiJob } from "./ai-job.queue.js";
import { ExtensionOpinionService } from "./extension-opinion.service.js";

const job: ClaimedAiJob = {
  ...AiJobEnvelopeV1Fixture,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T04:01:00.000Z",
};

describe("ExtensionOpinionService", () => {
  it("maps the extension Policy action to a safe public recommendation", async () => {
    let committed: unknown;
    const repository = {
      commitExtensionOpinion: (input: unknown) => {
        committed = input;
        return Promise.resolve({
          status: "COMMITTED" as const,
          suppressionReason: null,
          duplicate: false,
        });
      },
    } as unknown as AiOrchestrationRepository;
    const subject = new ExtensionOpinionService(repository);
    const policy = {
      ...PolicyWaitDecisionV1Fixture,
      trigger: "EXTENSION_DECISION" as const,
      action: "RECOMMEND_EXTENSION" as const,
    };

    await expect(
      subject.commit({
        job,
        context: evaluatorContext,
        policyActionId: "a6000000-0000-4000-8000-000000000001",
        policy,
      }),
    ).resolves.toMatchObject({ status: "COMMITTED" });
    expect(committed).toMatchObject({
      output: {
        schemaVersion: "extension-recommendation-output.v1",
        recommendation: "EXTEND",
        packVersionId: evaluatorContext.session.pinnedPackVersionId,
        basedThroughSeq: evaluatorContext.session.targetThroughSeq,
      },
    });
    expect(JSON.stringify(committed)).not.toContain("AI_PRIVATE");
    expect(JSON.stringify(committed)).not.toContain("Discussion Metrics");
  });

  it("maps WAIT at the decision window to a finish opinion", async () => {
    let recommendation: unknown;
    const repository = {
      commitExtensionOpinion: (input: { output: { recommendation: unknown } }) => {
        recommendation = input.output.recommendation;
        return Promise.resolve({
          status: "COMMITTED" as const,
          suppressionReason: null,
          duplicate: false,
        });
      },
    } as unknown as AiOrchestrationRepository;
    const subject = new ExtensionOpinionService(repository);

    await subject.commit({
      job,
      context: evaluatorContext,
      policyActionId: "a6000000-0000-4000-8000-000000000001",
      policy: {
        ...PolicyWaitDecisionV1Fixture,
        trigger: "EXTENSION_DECISION",
      },
    });
    expect(recommendation).toBe("FINISH");
  });

  it("rejects use outside the extension-decision trigger", async () => {
    const subject = new ExtensionOpinionService({} as AiOrchestrationRepository);
    await expect(
      subject.commit({
        job,
        context: evaluatorContext,
        policyActionId: "a6000000-0000-4000-8000-000000000001",
        policy: PolicyWaitDecisionV1Fixture,
      }),
    ).rejects.toMatchObject({
      code: "EXTENSION_OPINION_TRIGGER_REQUIRED",
    });
  });
});
