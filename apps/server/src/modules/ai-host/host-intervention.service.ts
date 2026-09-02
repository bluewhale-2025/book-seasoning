import { Inject, Injectable } from "@nestjs/common";

import type {
  HostInterventionOutputV1,
  LivingWikiDocumentV1,
  PolicyDecisionV1,
  PublicContextV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import type { AiGatewayResult } from "../ai-provider/ai-gateway.js";
import { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { hostInterventionTask } from "../ai-provider/ai-task.catalog.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  AI_PUBLIC_MESSAGE_REPOSITORY,
  type AiPublicMessageCommitResult,
  type AiPublicMessageRepository,
} from "./ai-public-message.repository.js";
import { HostContextBuilder } from "./host-context.builder.js";
import {
  HostOutputValidationError,
  HostOutputValidator,
} from "./host-output.validator.js";
import { PublicAiOutputSafetyError } from "./public-ai-output-safety.validator.js";

export type GenerateHostInterventionInput = Readonly<{
  job: ClaimedAiJob;
  publicContext: PublicContextV1;
  evaluation: PublicEvaluatorOutputV1;
  committedWiki: LivingWikiDocumentV1;
  policyActionId: string;
  policy: PolicyDecisionV1;
}>;

export type HostInterventionApplicationResult = Readonly<{
  commit: AiPublicMessageCommitResult;
}>;

export class HostInterventionApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "HostInterventionApplicationError";
  }
}

@Injectable()
export class HostInterventionService {
  public constructor(
    @Inject(HostContextBuilder)
    private readonly contextBuilder: HostContextBuilder,
    @Inject(AiGenerationService)
    private readonly generation: AiGenerationService,
    @Inject(HostOutputValidator)
    private readonly outputValidator: HostOutputValidator,
    @Inject(AI_PUBLIC_MESSAGE_REPOSITORY)
    private readonly repository: AiPublicMessageRepository,
  ) {}

  public async generate(
    input: GenerateHostInterventionInput,
  ): Promise<HostInterventionApplicationResult> {
    const context = this.contextBuilder.build({
      publicContext: input.publicContext,
      evaluation: input.evaluation,
      committedWiki: input.committedWiki,
      policy: input.policy,
    });
    let generated: AiGatewayResult<HostInterventionOutputV1>;
    let output: HostInterventionOutputV1;
    try {
      generated = await this.generation.generate(
        { jobId: input.job.jobId, attemptNo: input.job.attemptNo },
        hostInterventionTask,
        context,
      );
      output = await this.outputValidator.validate(
        context,
        generated.output,
      );
    } catch (error) {
      const code = this.codeFor(error);
      await this.repository.failHostIntervention({
        job: input.job,
        policyActionId: input.policyActionId,
        errorCode: code,
      });
      throw new HostInterventionApplicationError(
        code,
        error instanceof AiGatewayInvocationError ? error.retryable : false,
      );
    }
    try {
      const commit = await this.repository.commitHostIntervention({
        job: input.job,
        expectedPhase: context.session.phase,
        expectedPhaseVersion: context.session.phaseVersion,
        policyActionId: input.policyActionId,
        policy: input.policy,
        output,
        providerRun: generated.run,
      });
      return { commit };
    } catch (error) {
      throw new HostInterventionApplicationError(
        this.codeFor(error),
        error instanceof AiGatewayInvocationError ? error.retryable : false,
      );
    }
  }

  private codeFor(error: unknown): string {
    if (
      error instanceof AiGatewayInvocationError ||
      error instanceof HostOutputValidationError ||
      error instanceof PublicAiOutputSafetyError
    ) {
      return error.code;
    }
    if (error instanceof AiGatewayUnavailableError) {
      return "AI_PROVIDER_NOT_CONFIGURED";
    }
    return "HOST_INTERVENTION_FAILED";
  }
}
