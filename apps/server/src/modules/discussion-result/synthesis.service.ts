import { Inject, Injectable } from "@nestjs/common";

import {
  SynthesisOutputV1Schema,
  publicEvidenceRefKey,
  type AiProviderRunV1,
  type PublicEvidenceRef,
  type SynthesisOutputV1,
} from "@bookseasoning/contracts/internal";

import { PublicContextBuilder } from "../ai-context/public-context.builder.js";
import {
  PUBLIC_EVIDENCE_RESOLVER,
  type PublicEvidenceResolver,
} from "../ai-context/public-evidence-reference.resolver.js";
import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { synthesisTask } from "../ai-provider/ai-task.catalog.js";
import { PublicAiOutputSafetyValidator } from "../ai-host/public-ai-output-safety.validator.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  DISCUSSION_RESULT_REPOSITORY,
  type DiscussionResultRepository,
  type SynthesisCommitResult,
} from "./discussion-result.repository.js";

export const DEFAULT_SYNTHESIS_MESSAGE =
  "지금까지 서로 다른 관점과 질문이 오갔습니다. 하나의 결론으로 모으기보다, 오늘 대화를 통해 새롭게 보인 점을 한 문장으로 돌아봐 주세요.";

export class SynthesisApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "SynthesisApplicationError";
  }
}

@Injectable()
export class SynthesisService {
  public constructor(
    @Inject(PublicContextBuilder)
    private readonly contextBuilder: PublicContextBuilder,
    @Inject(AiGenerationService)
    private readonly generation: AiGenerationService,
    @Inject(PublicAiOutputSafetyValidator)
    private readonly safety: PublicAiOutputSafetyValidator,
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
    @Inject(DISCUSSION_RESULT_REPOSITORY)
    private readonly repository: DiscussionResultRepository,
  ) {}

  public async synthesize(job: ClaimedAiJob): Promise<Readonly<{
    output: SynthesisOutputV1;
    fallbackUsed: boolean;
    commit: SynthesisCommitResult;
  }>> {
    const context = await this.contextBuilder.build({
      sessionId: job.sessionId,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
    });
    if (
      job.jobType !== "SYNTHESIS" ||
      job.taskSchemaVersion !== "synthesis-output.v1" ||
      context.session.phase !== "SYNTHESIS"
    ) {
      throw new SynthesisApplicationError("SYNTHESIS_CONTEXT_INVALID", false);
    }

    let output: SynthesisOutputV1;
    let providerRun: AiProviderRunV1 | null = null;
    let fallbackUsed = false;
    try {
      const generated = await this.generation.generate(
        { jobId: job.jobId, attemptNo: job.attemptNo },
        synthesisTask,
        context,
      );
      output = SynthesisOutputV1Schema.parse(generated.output);
      await this.validateOutput(job, context, output);
      providerRun = generated.run;
    } catch (error) {
      if (this.shouldRetry(job, error)) {
        throw new SynthesisApplicationError(this.codeFor(error), true);
      }
      output = SynthesisOutputV1Schema.parse({
        schemaVersion: "synthesis-output.v1",
        packVersionId: context.session.pinnedPackVersionId,
        basedThroughSeq: job.targetThroughSeq,
        message: DEFAULT_SYNTHESIS_MESSAGE,
        perspectiveSummaries: [
          "서로 다른 관점이 함께 제시되었습니다.",
          "아직 남아 있는 질문과 해석의 차이가 있습니다.",
        ],
        reflectionQuestion: "오늘 대화를 통해 새롭게 보인 점은 무엇인가요?",
        supportingEvidenceRefs: [],
      });
      fallbackUsed = true;
    }

    const commit = await this.repository.commitSynthesis({
      job,
      context,
      output,
      providerRun,
      fallbackUsed,
    });
    return { output, fallbackUsed, commit };
  }

  private async validateOutput(
    job: ClaimedAiJob,
    context: Awaited<ReturnType<PublicContextBuilder["build"]>>,
    output: SynthesisOutputV1,
  ): Promise<void> {
    if (
      output.packVersionId !== context.session.pinnedPackVersionId ||
      output.basedThroughSeq !== job.targetThroughSeq
    ) {
      throw new SynthesisApplicationError("SYNTHESIS_ENVELOPE_MISMATCH", true);
    }
    this.safety.assertSafe(output.message, {
      maxLength: 2_000,
      forbiddenProfileNames: context.participants.map((item) => item.profileName),
    });
    const allowed = new Set<string>([
      ...context.messages.map((message) =>
        publicEvidenceRefKey(
          message.kind === "PARTICIPANT"
            ? { type: "MESSAGE", messageId: message.messageId, seqNo: message.seqNo }
            : {
                type: "AI_INTERVENTION",
                messageId: message.messageId,
                seqNo: message.seqNo,
              },
        ),
      ),
      ...context.publicPrep.map((prep) =>
        publicEvidenceRefKey({ type: "PUBLIC_PREP", prepAnswerId: prep.prepAnswerId }),
      ),
      ...context.bookContext.sections.flatMap((section) =>
        section.items.map((item) =>
          publicEvidenceRefKey({
            type: "BOOK_CONTEXT_ITEM",
            packVersionId: context.bookContext.packVersionId,
            itemId: item.itemId,
          }),
        ),
      ),
    ]);
    if (
      output.supportingEvidenceRefs.some(
        (reference) => !allowed.has(publicEvidenceRefKey(reference)),
      )
    ) {
      throw new SynthesisApplicationError("SYNTHESIS_EVIDENCE_NOT_IN_CONTEXT", true);
    }
    await this.evidenceResolver.resolve(
      {
        sessionId: job.sessionId,
        roomId: context.session.roomId,
        pinnedPackVersionId: context.session.pinnedPackVersionId,
        targetThroughSeq: job.targetThroughSeq,
      },
      output.supportingEvidenceRefs as readonly PublicEvidenceRef[],
    );
  }

  private shouldRetry(job: ClaimedAiJob, error: unknown): boolean {
    if (job.attemptNo >= job.maxAttempts) return false;
    if (error instanceof AiGatewayUnavailableError) return false;
    if (error instanceof AiGatewayInvocationError) return error.retryable;
    return true;
  }

  private codeFor(error: unknown): string {
    if (
      error instanceof AiGatewayInvocationError ||
      error instanceof SynthesisApplicationError
    ) {
      return error.code;
    }
    return "SYNTHESIS_GENERATION_FAILED";
  }
}
