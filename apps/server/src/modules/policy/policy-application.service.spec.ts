import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  PublicEvaluatorOutputV1Fixture,
} from "@bookseasoning/contracts/internal";

import { evaluatorContext, evaluatorJob } from "../public-evaluator/public-evaluator.fixture.js";
import { DeterministicPolicyEngine } from "./deterministic-policy.engine.js";
import { PolicyApplicationService } from "./policy-application.service.js";
import type {
  CommitPolicyDecisionInput,
  PolicyCommitResult,
  PolicyRepository,
} from "./policy.repository.js";

class FakePolicyRepository implements PolicyRepository {
  public readonly calls: CommitPolicyDecisionInput[] = [];

  public constructor(
    private readonly result: PolicyCommitResult = {
      policyActionId: "a6000000-0000-4000-8000-000000000001",
      status: "COMMITTED",
      action: "WAIT",
      suppressionReason: null,
      duplicate: false,
    },
  ) {}

  public commitDecision(input: CommitPolicyDecisionInput) {
    this.calls.push(input);
    return Promise.resolve({ ...this.result, action: input.decision.action });
  }
}

describe("PolicyApplicationService", () => {
  it("infers the trigger, decides and persists against evaluation freshness coordinates", async () => {
    const repository = new FakePolicyRepository();
    const subject = new PolicyApplicationService(
      new DeterministicPolicyEngine(),
      repository,
    );

    await expect(
      subject.decideAndCommit({
        job: evaluatorJob,
        evaluationId: AiEngineFixtureIds.evaluationId,
        committedWikiVersion: 2,
        context: evaluatorContext,
        evaluation: PublicEvaluatorOutputV1Fixture,
      }),
    ).resolves.toMatchObject({
      decision: { trigger: "MESSAGE_BATCH", action: "WAIT" },
      commit: { status: "COMMITTED" },
    });
    expect(repository.calls[0]).toMatchObject({
      jobId: evaluatorJob.jobId,
      attemptNo: evaluatorJob.attemptNo,
      sessionId: evaluatorJob.sessionId,
      expectedPhase: "CORE",
      expectedPhaseVersion: 2,
    });
  });

  it("infers SILENCE and passes through a commit-time stale suppression", async () => {
    const repository = new FakePolicyRepository({
      policyActionId: null,
      status: "SUPPRESSED_STALE",
      action: "REVIVE",
      suppressionReason: "POLICY_CURSOR_ADVANCED",
      duplicate: false,
    });
    const subject = new PolicyApplicationService(
      new DeterministicPolicyEngine(),
      repository,
    );
    const evaluation = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        activity: {
          level: "LOW" as const,
          reasonCodes: ["SILENCE_WITHOUT_RESPONSE"],
          evidenceRefs:
            PublicEvaluatorOutputV1Fixture.metrics.activity.evidenceRefs,
        },
      },
    };

    await expect(
      subject.decideAndCommit({
        job: evaluatorJob,
        evaluationId: AiEngineFixtureIds.evaluationId,
        committedWikiVersion: 2,
        context: { ...evaluatorContext, objectiveMetrics: {
          ...evaluatorContext.objectiveMetrics,
          silenceSeconds: 90,
        } },
        evaluation,
      }),
    ).resolves.toMatchObject({
      decision: { trigger: "SILENCE", action: "REVIVE" },
      commit: {
        status: "SUPPRESSED_STALE",
        suppressionReason: "POLICY_CURSOR_ADVANCED",
      },
    });
  });
});
