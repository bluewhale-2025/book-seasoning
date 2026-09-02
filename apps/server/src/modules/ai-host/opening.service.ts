import { Inject, Injectable } from "@nestjs/common";

import {
  OpeningOutputV1Schema,
  type AiProviderRunV1,
  type OpeningOutputV1,
} from "@bookseasoning/contracts/internal";

import { OpeningContextBuilder } from "../ai-context/opening-context.builder.js";
import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { openingTask } from "../ai-provider/ai-task.catalog.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  AI_PUBLIC_MESSAGE_REPOSITORY,
  type AiPublicMessageCommitResult,
  type AiPublicMessageRepository,
} from "./ai-public-message.repository.js";
import {
  OpeningOutputValidationError,
  OpeningOutputValidator,
} from "./opening-output.validator.js";
import { PublicAiOutputSafetyError } from "./public-ai-output-safety.validator.js";

export const DEFAULT_OPENING_MESSAGE =
  "이 책을 읽고 가장 오래 마음에 남은 생각은 무엇이었나요? 그 생각에 동의하거나 망설였던 이유도 함께 들려주세요.";

export type OpeningApplicationResult = Readonly<{
  output: OpeningOutputV1;
  fallbackUsed: boolean;
  commit: AiPublicMessageCommitResult;
}>;

export class OpeningApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "OpeningApplicationError";
  }
}

@Injectable()
export class OpeningService {
  public constructor(
    @Inject(OpeningContextBuilder)
    private readonly contextBuilder: OpeningContextBuilder,
    @Inject(AiGenerationService)
    private readonly generation: AiGenerationService,
    @Inject(OpeningOutputValidator)
    private readonly outputValidator: OpeningOutputValidator,
    @Inject(AI_PUBLIC_MESSAGE_REPOSITORY)
    private readonly repository: AiPublicMessageRepository,
  ) {}

  public async open(job: ClaimedAiJob): Promise<OpeningApplicationResult> {
    const context = await this.contextBuilder.build({
      sessionId: job.sessionId,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
    });
    this.outputValidator.assertContext(job, context);

    let output: OpeningOutputV1;
    let providerRun: AiProviderRunV1 | null = null;
    let fallbackUsed = false;
    try {
      const generated = await this.generation.generate(
        { jobId: job.jobId, attemptNo: job.attemptNo },
        openingTask,
        context,
      );
      output = await this.outputValidator.validate(
        job,
        context,
        generated.output,
      );
      providerRun = generated.run;
    } catch (error) {
      if (this.shouldRetry(job, error)) {
        throw new OpeningApplicationError(this.codeFor(error), true);
      }
      output = await this.outputValidator.validate(
        job,
        context,
        OpeningOutputV1Schema.parse({
          schemaVersion: "opening-output.v1",
          packVersionId: context.session.pinnedPackVersionId,
          basedThroughSeq: context.session.basedThroughSeq,
          message: DEFAULT_OPENING_MESSAGE,
          supportingEvidenceRefs: [],
        }),
      );
      fallbackUsed = true;
    }

    const commit = await this.repository.commitOpening({
      job,
      context,
      output,
      providerRun,
      fallbackUsed,
    });
    return { output, fallbackUsed, commit };
  }

  private shouldRetry(job: ClaimedAiJob, error: unknown): boolean {
    if (job.attemptNo >= job.maxAttempts) return false;
    if (error instanceof AiGatewayUnavailableError) return false;
    if (error instanceof AiGatewayInvocationError) return error.retryable;
    return (
      error instanceof OpeningOutputValidationError ||
      error instanceof PublicAiOutputSafetyError ||
      !(error instanceof OpeningApplicationError)
    );
  }

  private codeFor(error: unknown): string {
    if (
      error instanceof AiGatewayInvocationError ||
      error instanceof OpeningOutputValidationError ||
      error instanceof PublicAiOutputSafetyError
    ) {
      return error.code;
    }
    return "OPENING_GENERATION_FAILED";
  }
}
