import type {
  AiProviderRunV1,
  HostInterventionOutputV1,
  OpeningContextV1,
  OpeningOutputV1,
  PolicyDecisionV1,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";

export const AI_PUBLIC_MESSAGE_REPOSITORY = Symbol(
  "AI_PUBLIC_MESSAGE_REPOSITORY",
);

export type AiPublicMessageCommitResult = Readonly<{
  status: "COMMITTED" | "SUPPRESSED_STALE";
  messageId: string | null;
  messageSeq: number | null;
  suppressionReason: string | null;
  duplicate: boolean;
  phaseTransitioned: boolean;
}>;

export type CommitOpeningInput = Readonly<{
  job: ClaimedAiJob;
  context: OpeningContextV1;
  output: OpeningOutputV1;
  providerRun: AiProviderRunV1 | null;
  fallbackUsed: boolean;
}>;

export type CommitHostInterventionInput = Readonly<{
  job: ClaimedAiJob;
  expectedPhase: string;
  expectedPhaseVersion: number;
  policyActionId: string;
  policy: PolicyDecisionV1;
  output: HostInterventionOutputV1;
  providerRun: AiProviderRunV1;
}>;

export type FailHostInterventionInput = Readonly<{
  job: ClaimedAiJob;
  policyActionId: string;
  errorCode: string;
}>;

export interface AiPublicMessageRepository {
  commitOpening(input: CommitOpeningInput): Promise<AiPublicMessageCommitResult>;
  commitHostIntervention(
    input: CommitHostInterventionInput,
  ): Promise<AiPublicMessageCommitResult>;
  failHostIntervention(input: FailHostInterventionInput): Promise<void>;
}
