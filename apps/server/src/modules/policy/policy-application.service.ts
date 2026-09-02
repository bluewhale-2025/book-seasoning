import { Inject, Injectable } from "@nestjs/common";

import type {
  HostHelpReason,
  PolicyTrigger,
  PublicContextV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  DeterministicPolicyEngine,
  type DeterministicPolicyInput,
} from "./deterministic-policy.engine.js";
import {
  POLICY_REPOSITORY,
  type PolicyCommitResult,
  type PolicyRepository,
} from "./policy.repository.js";

export type DecidePolicyInput = Readonly<{
  job: ClaimedAiJob;
  evaluationId: string;
  committedWikiVersion: number;
  context: PublicContextV1;
  evaluation: PublicEvaluatorOutputV1;
  trigger?: PolicyTrigger;
  hostHelpReason?: HostHelpReason | null;
}>;

export type PolicyApplicationResult = Readonly<{
  decision: ReturnType<DeterministicPolicyEngine["decide"]>;
  commit: PolicyCommitResult;
}>;

export class PolicyApplicationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PolicyApplicationError";
  }
}

@Injectable()
export class PolicyApplicationService {
  public constructor(
    @Inject(DeterministicPolicyEngine)
    private readonly engine: DeterministicPolicyEngine,
    @Inject(POLICY_REPOSITORY)
    private readonly repository: PolicyRepository,
  ) {}

  public async decideAndCommit(
    input: DecidePolicyInput,
  ): Promise<PolicyApplicationResult> {
    if (input.committedWikiVersion <= 0) {
      throw new PolicyApplicationError("POLICY_COMMITTED_EVALUATION_REQUIRED");
    }
    const trigger = input.trigger ?? this.inferTrigger(input);
    const engineInput: DeterministicPolicyInput = {
      evaluationId: input.evaluationId,
      committedWikiVersion: input.committedWikiVersion,
      context: input.context,
      evaluation: input.evaluation,
      trigger,
      hostHelpReason: input.hostHelpReason ?? null,
    };
    const decision = this.engine.decide(engineInput);
    const commit = await this.repository.commitDecision({
      jobId: input.job.jobId,
      attemptNo: input.job.attemptNo,
      sessionId: input.job.sessionId,
      expectedPhase: input.context.session.phase,
      expectedPhaseVersion: input.context.session.phaseVersion,
      decision,
    });
    return { decision, commit };
  }

  private inferTrigger(input: DecidePolicyInput): PolicyTrigger {
    if (input.job.jobType === "TOPIC_CHECKPOINT") return "TOPIC_DURATION";
    if (input.context.session.extensionPromptedAt !== null) {
      return "EXTENSION_DECISION";
    }
    if (
      input.evaluation.metrics.activity.level === "LOW" &&
      input.context.objectiveMetrics.silenceSeconds >= 60
    ) {
      return "SILENCE";
    }
    if (
      input.evaluation.metrics.participationBalance.level === "LOW" &&
      input.context.objectiveMetrics.actualParticipantCount > 1 &&
      input.context.objectiveMetrics.recentSpeakerCount <
        input.context.objectiveMetrics.actualParticipantCount
    ) {
      return "PARTICIPATION_THRESHOLD";
    }
    return "MESSAGE_BATCH";
  }
}
