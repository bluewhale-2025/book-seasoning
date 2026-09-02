import { Inject, Injectable } from "@nestjs/common";

import {
  DiscussionRecordOutputV1Schema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type DiscussionRecordOutputV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  PUBLIC_EVIDENCE_RESOLVER,
  type PublicEvidenceResolver,
} from "../ai-context/public-evidence-reference.resolver.js";
import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { discussionRecordTask } from "../ai-provider/ai-task.catalog.js";
import { PublicAiOutputSafetyValidator } from "../ai-host/public-ai-output-safety.validator.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  DISCUSSION_RESULT_REPOSITORY,
  type DiscussionRecordCommitResult,
  type DiscussionResultRepository,
} from "./discussion-result.repository.js";

export class DiscussionRecordApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "DiscussionRecordApplicationError";
  }
}

@Injectable()
export class DiscussionRecordService {
  public constructor(
    @Inject(DISCUSSION_RESULT_REPOSITORY)
    private readonly repository: DiscussionResultRepository,
    @Inject(AiGenerationService)
    private readonly generation: AiGenerationService,
    @Inject(PublicAiOutputSafetyValidator)
    private readonly safety: PublicAiOutputSafetyValidator,
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
  ) {}

  public async create(job: ClaimedAiJob): Promise<Readonly<{
    output: DiscussionRecordOutputV1;
    commit: DiscussionRecordCommitResult;
  }>> {
    if (
      job.jobType !== "DISCUSSION_RECORD" ||
      job.taskSchemaVersion !== "discussion-record-output.v1" ||
      job.baseWikiVersion <= 0
    ) {
      throw new DiscussionRecordApplicationError(
        "DISCUSSION_RECORD_JOB_INVALID",
        false,
      );
    }
    const context = await this.repository.loadRecordContext({
      sessionId: job.sessionId,
      finalWikiVersion: job.baseWikiVersion,
    });
    try {
      const generated = await this.generation.generate(
        { jobId: job.jobId, attemptNo: job.attemptNo },
        discussionRecordTask,
        context,
      );
      const output = DiscussionRecordOutputV1Schema.parse(generated.output);
      await this.validate(job, context, output);
      const commit = await this.repository.commitRecord({ job, output });
      return { output, commit };
    } catch (error) {
      if (error instanceof DiscussionRecordApplicationError) throw error;
      if (error instanceof AiGatewayUnavailableError) {
        throw new DiscussionRecordApplicationError(
          "DISCUSSION_RECORD_PROVIDER_NOT_CONFIGURED",
          false,
        );
      }
      if (error instanceof AiGatewayInvocationError) {
        throw new DiscussionRecordApplicationError(error.code, error.retryable);
      }
      throw new DiscussionRecordApplicationError(
        "DISCUSSION_RECORD_VALIDATION_FAILED",
        job.attemptNo < job.maxAttempts,
      );
    }
  }

  private async validate(
    job: ClaimedAiJob,
    context: Awaited<ReturnType<DiscussionResultRepository["loadRecordContext"]>>,
    output: DiscussionRecordOutputV1,
  ): Promise<void> {
    if (
      output.sessionId !== job.sessionId ||
      output.finalWikiVersion !== job.baseWikiVersion ||
      output.basedThroughSeq !== job.targetThroughSeq
    ) {
      throw new DiscussionRecordApplicationError(
        "DISCUSSION_RECORD_ENVELOPE_MISMATCH",
        true,
      );
    }
    this.safety.assertSafe(JSON.stringify(output.record), {
      maxLength: 30_000,
      forbiddenProfileNames: context.messages.map(
        (message) => message.authorProfileName,
      ),
    });
    const allowedReferences = [
      ...collectPublicEvidenceRefs(context.finalWiki),
      ...context.messages.map((message) =>
        message.kind === "PARTICIPANT"
          ? ({
              type: "MESSAGE",
              messageId: message.messageId,
              seqNo: message.seqNo,
            } satisfies PublicEvidenceRef)
          : ({
              type: "AI_INTERVENTION",
              messageId: message.messageId,
              seqNo: message.seqNo,
            } satisfies PublicEvidenceRef),
      ),
    ];
    const allowedKeys = new Set(
      allowedReferences.map((reference) => publicEvidenceRefKey(reference)),
    );
    if (
      output.supportingEvidenceRefs.some(
        (reference) => !allowedKeys.has(publicEvidenceRefKey(reference)),
      )
    ) {
      throw new DiscussionRecordApplicationError(
        "DISCUSSION_RECORD_EVIDENCE_NOT_IN_CONTEXT",
        true,
      );
    }
    await this.evidenceResolver.resolve(
      {
        sessionId: job.sessionId,
        roomId: context.roomId,
        pinnedPackVersionId: context.pinnedPackVersionId,
        targetThroughSeq: job.targetThroughSeq,
      },
      output.supportingEvidenceRefs,
    );
  }
}
