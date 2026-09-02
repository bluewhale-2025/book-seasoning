import type {
  ExtensionRecommendationOutputV1,
  HostHelpReason,
  PolicyDecisionV1,
  PolicyTrigger,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "./ai-job.queue.js";

export const AI_ORCHESTRATION_REPOSITORY = Symbol(
  "AI_ORCHESTRATION_REPOSITORY",
);

export type AiOrchestrationDirective = Readonly<{
  trigger: PolicyTrigger;
  hostHelpReason: HostHelpReason | null;
  extensionPhaseVersion: number | null;
  refreshNo: number;
}>;

export type ExtensionOpinionCommitResult = Readonly<{
  status: "COMMITTED" | "SUPPRESSED_STALE";
  suppressionReason: string | null;
  duplicate: boolean;
}>;

export interface AiOrchestrationRepository {
  readDirective(job: ClaimedAiJob): Promise<AiOrchestrationDirective | null>;
  refreshStaleJob(job: ClaimedAiJob): Promise<boolean>;
  commitExtensionOpinion(input: Readonly<{
    job: ClaimedAiJob;
    expectedPhase: string;
    expectedPhaseVersion: number;
    policyActionId: string;
    policy: PolicyDecisionV1;
    output: ExtensionRecommendationOutputV1;
  }>): Promise<ExtensionOpinionCommitResult>;
}
