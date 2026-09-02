import { Inject, Injectable } from "@nestjs/common";

import { OpeningContextBuildError } from "../ai-context/opening-context.builder.js";
import { PublicContextBuildError } from "../ai-context/public-context.builder.js";
import {
  HostInterventionApplicationError,
  HostInterventionService,
} from "../ai-host/host-intervention.service.js";
import {
  OpeningApplicationError,
  OpeningService,
} from "../ai-host/opening.service.js";
import {
  DiscussionRecordApplicationError,
  DiscussionRecordService,
} from "../discussion-result/discussion-record.service.js";
import { FinalWikiService } from "../discussion-result/final-wiki.service.js";
import {
  SynthesisApplicationError,
  SynthesisService,
} from "../discussion-result/synthesis.service.js";
import {
  PublicEvaluationService,
} from "../public-evaluator/public-evaluation.service.js";
import { LivingWikiCommitError } from "../living-wiki/living-wiki-commit.service.js";
import { LivingWikiEvaluatorConsistencyError } from "../living-wiki/living-wiki-evaluator-consistency.validator.js";
import { LivingWikiPatchError } from "../living-wiki/living-wiki-patch.engine.js";
import { TopicCheckpointValidationError } from "../living-wiki/topic-checkpoint.validator.js";
import { DeterministicPolicyError } from "../policy/deterministic-policy.engine.js";
import {
  PolicyApplicationError,
  PolicyApplicationService,
} from "../policy/policy-application.service.js";
import {
  PublicEvaluatorInvocationError,
  PublicEvaluatorUnavailableError,
} from "../public-evaluator/public-evaluator.js";
import { PublicEvaluatorValidationError } from "../public-evaluator/public-evaluator-output.validator.js";
import {
  RetryableAiJobError,
  TerminalAiJobError,
  type AiJobHandler,
  type AiJobHandlerResult,
} from "./ai-job.handler.js";
import type { ClaimedAiJob } from "./ai-job.queue.js";
import {
  AI_ORCHESTRATION_REPOSITORY,
  type AiOrchestrationRepository,
} from "./ai-orchestration.repository.js";
import {
  ExtensionOpinionApplicationError,
  ExtensionOpinionService,
} from "./extension-opinion.service.js";

@Injectable()
export class AiJobRoutingHandler implements AiJobHandler {
  public constructor(
    @Inject(PublicEvaluationService)
    private readonly publicEvaluationService: PublicEvaluationService,
    @Inject(PolicyApplicationService)
    private readonly policyApplicationService: PolicyApplicationService,
    @Inject(OpeningService)
    private readonly openingService: OpeningService,
    @Inject(HostInterventionService)
    private readonly hostInterventionService: HostInterventionService,
    @Inject(AI_ORCHESTRATION_REPOSITORY)
    private readonly orchestrationRepository: AiOrchestrationRepository,
    @Inject(ExtensionOpinionService)
    private readonly extensionOpinionService: ExtensionOpinionService,
    @Inject(SynthesisService)
    private readonly synthesisService: SynthesisService,
    @Inject(FinalWikiService)
    private readonly finalWikiService: FinalWikiService,
    @Inject(DiscussionRecordService)
    private readonly discussionRecordService: DiscussionRecordService,
  ) {}

  public async handle(job: ClaimedAiJob): Promise<AiJobHandlerResult> {
    if (job.jobType === "OPENING") return this.handleOpening(job);
    if (job.jobType === "SYNTHESIS") return this.handleSynthesis(job);
    if (job.jobType === "FINAL_WIKI") return this.handleFinalWiki(job);
    if (job.jobType === "DISCUSSION_RECORD") {
      return this.handleDiscussionRecord(job);
    }
    if (
      job.jobType !== "PUBLIC_EVALUATION" &&
      job.jobType !== "TOPIC_CHECKPOINT"
    ) {
      return {
        outcome: "SUPPRESSED",
        reasonCode: "S5_HANDLER_NOT_CONNECTED",
      };
    }

    try {
      const directive = await this.orchestrationRepository.readDirective(job);
      const result = await this.publicEvaluationService.evaluate(job);
      if (result.commit.status === "SUPPRESSED_STALE_BASE") {
        if (result.commit.shouldRequeue) {
          await this.orchestrationRepository.refreshStaleJob(job);
        }
        return {
          outcome: "SUPPRESSED",
          reasonCode: result.commit.shouldRequeue
            ? "SUPPRESSED_STALE_BASE_REQUEUE_REQUIRED"
            : "SUPPRESSED_STALE_BASE",
        };
      }
      if (result.commit.committedWikiVersion === null) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: "POLICY_COMMITTED_EVALUATION_REQUIRED",
        };
      }
      if (result.commit.evaluationId === null) {
        throw new TerminalAiJobError("POLICY_EVALUATION_ID_REQUIRED");
      }
      const policy = await this.policyApplicationService.decideAndCommit({
        job,
        evaluationId: result.commit.evaluationId,
        committedWikiVersion: result.commit.committedWikiVersion,
        context: result.context,
        evaluation: result.output,
        ...(directive === null
          ? {}
          : {
              trigger: directive.trigger,
              hostHelpReason: directive.hostHelpReason,
            }),
      });
      if (policy.commit.status === "SUPPRESSED_STALE") {
        if (directive !== null) {
          await this.orchestrationRepository.refreshStaleJob(job);
        }
        return {
          outcome: "SUPPRESSED",
          reasonCode:
            policy.commit.suppressionReason ?? "POLICY_SUPPRESSED_STALE",
        };
      }
      if (directive?.trigger === "EXTENSION_DECISION") {
        if (policy.commit.policyActionId === null) {
          return {
            outcome: "SUPPRESSED",
            reasonCode: "EXTENSION_POLICY_ACTION_ID_REQUIRED",
          };
        }
        const opinion = await this.extensionOpinionService.commit({
          job,
          context: result.context,
          policyActionId: policy.commit.policyActionId,
          policy: policy.decision,
        });
        if (opinion.status === "SUPPRESSED_STALE") {
          await this.orchestrationRepository.refreshStaleJob(job);
          return {
            outcome: "SUPPRESSED",
            reasonCode:
              opinion.suppressionReason ?? "EXTENSION_OPINION_SUPPRESSED_STALE",
          };
        }
        return { outcome: "SUCCEEDED" };
      }
      if (
        policy.decision.action !== "WAIT" &&
        policy.decision.action !== "RECOMMEND_EXTENSION"
      ) {
        if (policy.commit.policyActionId === null) {
          return {
            outcome: "SUPPRESSED",
            reasonCode: "HOST_POLICY_ACTION_ID_REQUIRED",
          };
        }
        const intervention = await this.hostInterventionService.generate({
          job,
          publicContext: result.context,
          evaluation: result.output,
          committedWiki: result.commit.document,
          policyActionId: policy.commit.policyActionId,
          policy: policy.decision,
        });
        if (intervention.commit.status === "SUPPRESSED_STALE") {
          return {
            outcome: "SUPPRESSED",
            reasonCode:
              intervention.commit.suppressionReason ?? "HOST_SUPPRESSED_STALE",
          };
        }
      }
      return { outcome: "SUCCEEDED" };
    } catch (error) {
      if (error instanceof PublicEvaluatorUnavailableError) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: "EVALUATOR_PROVIDER_NOT_CONFIGURED",
        };
      }
      if (
        error instanceof PublicEvaluatorValidationError &&
        error.code === "PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED"
      ) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: "EVALUATION_PHASE_NOT_ALLOWED",
        };
      }
      if (error instanceof PublicEvaluatorInvocationError) {
        if (error.retryable) throw new RetryableAiJobError(error.code);
        throw new TerminalAiJobError(error.code);
      }
      if (error instanceof PublicEvaluatorValidationError) {
        throw new RetryableAiJobError(error.code);
      }
      if (error instanceof PublicContextBuildError) {
        throw new RetryableAiJobError(error.code);
      }
      if (
        error instanceof LivingWikiCommitError ||
        error instanceof LivingWikiPatchError ||
        error instanceof LivingWikiEvaluatorConsistencyError ||
        error instanceof TopicCheckpointValidationError
      ) {
        throw new RetryableAiJobError(error.code);
      }
      if (
        error instanceof DeterministicPolicyError ||
        error instanceof PolicyApplicationError
      ) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: "POLICY_FAILED_CLOSED_WAIT",
        };
      }
      if (error instanceof HostInterventionApplicationError) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: "HOST_INTERVENTION_FAILED_SAFE",
        };
      }
      if (error instanceof ExtensionOpinionApplicationError) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: error.code,
        };
      }
      throw error;
    }
  }

  private async handleOpening(job: ClaimedAiJob): Promise<AiJobHandlerResult> {
    try {
      const result = await this.openingService.open(job);
      if (result.commit.status === "SUPPRESSED_STALE") {
        return {
          outcome: "SUPPRESSED",
          reasonCode:
            result.commit.suppressionReason ?? "OPENING_SUPPRESSED_STALE",
        };
      }
      return { outcome: "SUCCEEDED" };
    } catch (error) {
      if (error instanceof OpeningApplicationError && error.retryable) {
        throw new RetryableAiJobError(error.code);
      }
      if (error instanceof OpeningApplicationError) {
        throw new TerminalAiJobError(error.code);
      }
      if (error instanceof PublicContextBuildError) {
        throw new RetryableAiJobError(error.code);
      }
      if (
        error instanceof OpeningContextBuildError &&
        error.code === "OPENING_PHASE_NOT_ALLOWED"
      ) {
        return {
          outcome: "SUPPRESSED",
          reasonCode: error.code,
        };
      }
      if (error instanceof OpeningContextBuildError) {
        throw new RetryableAiJobError(error.code);
      }
      throw error;
    }
  }

  private async handleSynthesis(job: ClaimedAiJob): Promise<AiJobHandlerResult> {
    try {
      const result = await this.synthesisService.synthesize(job);
      return result.commit.status === "SUPPRESSED_STALE"
        ? {
            outcome: "SUPPRESSED",
            reasonCode:
              result.commit.suppressionReason ?? "SYNTHESIS_SUPPRESSED_STALE",
          }
        : { outcome: "SUCCEEDED" };
    } catch (error) {
      if (error instanceof SynthesisApplicationError) {
        if (error.retryable) throw new RetryableAiJobError(error.code);
        throw new TerminalAiJobError(error.code);
      }
      if (error instanceof PublicContextBuildError) {
        throw new RetryableAiJobError(error.code);
      }
      throw error;
    }
  }

  private async handleFinalWiki(job: ClaimedAiJob): Promise<AiJobHandlerResult> {
    try {
      await this.finalWikiService.finalize(job);
      return { outcome: "SUCCEEDED" };
    } catch (error) {
      if (error instanceof PublicEvaluatorUnavailableError) {
        throw new TerminalAiJobError("FINAL_WIKI_PROVIDER_NOT_CONFIGURED");
      }
      if (error instanceof PublicEvaluatorInvocationError) {
        if (error.retryable) throw new RetryableAiJobError(error.code);
        throw new TerminalAiJobError(error.code);
      }
      if (
        error instanceof PublicEvaluatorValidationError ||
        error instanceof PublicContextBuildError ||
        error instanceof LivingWikiCommitError ||
        error instanceof LivingWikiPatchError ||
        error instanceof LivingWikiEvaluatorConsistencyError
      ) {
        throw new RetryableAiJobError(error.code);
      }
      throw error;
    }
  }

  private async handleDiscussionRecord(
    job: ClaimedAiJob,
  ): Promise<AiJobHandlerResult> {
    try {
      await this.discussionRecordService.create(job);
      return { outcome: "SUCCEEDED" };
    } catch (error) {
      if (error instanceof DiscussionRecordApplicationError) {
        if (error.retryable) throw new RetryableAiJobError(error.code);
        throw new TerminalAiJobError(error.code);
      }
      throw error;
    }
  }
}
