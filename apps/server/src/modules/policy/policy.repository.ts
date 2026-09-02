import type { PolicyDecisionV1 } from "@bookseasoning/contracts/internal";

export const POLICY_REPOSITORY = Symbol("POLICY_REPOSITORY");

export type CommitPolicyDecisionInput = Readonly<{
  jobId: string;
  attemptNo: number;
  sessionId: string;
  expectedPhase: string;
  expectedPhaseVersion: number;
  decision: PolicyDecisionV1;
}>;

export type PolicyCommitResult = Readonly<{
  policyActionId: string | null;
  status: "COMMITTED" | "SUPPRESSED_STALE";
  action: PolicyDecisionV1["action"];
  suppressionReason: string | null;
  duplicate: boolean;
}>;

export interface PolicyRepository {
  commitDecision(input: CommitPolicyDecisionInput): Promise<PolicyCommitResult>;
}
