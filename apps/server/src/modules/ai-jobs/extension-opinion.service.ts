import { Inject, Injectable } from "@nestjs/common";

import {
  ExtensionRecommendationOutputV1Schema,
  type PolicyDecisionV1,
  type PublicContextV1,
} from "@bookseasoning/contracts/internal";

import {
  AI_ORCHESTRATION_REPOSITORY,
  type AiOrchestrationRepository,
  type ExtensionOpinionCommitResult,
} from "./ai-orchestration.repository.js";
import type { ClaimedAiJob } from "./ai-job.queue.js";

export class ExtensionOpinionApplicationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "ExtensionOpinionApplicationError";
  }
}

@Injectable()
export class ExtensionOpinionService {
  public constructor(
    @Inject(AI_ORCHESTRATION_REPOSITORY)
    private readonly repository: AiOrchestrationRepository,
  ) {}

  public async commit(input: Readonly<{
    job: ClaimedAiJob;
    context: PublicContextV1;
    policyActionId: string;
    policy: PolicyDecisionV1;
  }>): Promise<ExtensionOpinionCommitResult> {
    if (input.policy.trigger !== "EXTENSION_DECISION") {
      throw new ExtensionOpinionApplicationError(
        "EXTENSION_OPINION_TRIGGER_REQUIRED",
      );
    }
    const extend = input.policy.action === "RECOMMEND_EXTENSION";
    const output = ExtensionRecommendationOutputV1Schema.parse({
      schemaVersion: "extension-recommendation-output.v1",
      packVersionId: input.context.session.pinnedPackVersionId,
      basedThroughSeq: input.context.session.targetThroughSeq,
      recommendation: extend ? "EXTEND" : "FINISH",
      reason: extend
        ? "대화가 살아 있고 새로운 관점이 이어지고 있어 조금 더 탐색할 가치가 있습니다."
        : "지금까지 나온 관점을 정리하고 마무리하기 좋은 시점입니다.",
      supportingEvidenceRefs: input.policy.supportingEvidenceRefs,
    });
    return this.repository.commitExtensionOpinion({
      job: input.job,
      expectedPhase: input.context.session.phase,
      expectedPhaseVersion: input.context.session.phaseVersion,
      policyActionId: input.policyActionId,
      policy: input.policy,
      output,
    });
  }
}
