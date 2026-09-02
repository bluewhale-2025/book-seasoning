import { Inject, Injectable } from "@nestjs/common";

import {
  OpeningContextV1Schema,
  OpeningOutputV1Schema,
  publicEvidenceRefKey,
  type OpeningContextV1,
  type OpeningOutputV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  PUBLIC_EVIDENCE_RESOLVER,
  PublicEvidenceResolutionError,
  type PublicEvidenceResolver,
} from "../ai-context/public-evidence-reference.resolver.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import { PublicAiOutputSafetyValidator } from "./public-ai-output-safety.validator.js";

export class OpeningOutputValidationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly causeCode: string | null = null,
  ) {
    super(code);
    this.name = "OpeningOutputValidationError";
  }
}

@Injectable()
export class OpeningOutputValidator {
  public constructor(
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
    @Inject(PublicAiOutputSafetyValidator)
    private readonly safety: PublicAiOutputSafetyValidator,
  ) {}

  public assertContext(job: ClaimedAiJob, rawContext: unknown): OpeningContextV1 {
    const result = OpeningContextV1Schema.safeParse(rawContext);
    if (!result.success) this.fail("OPENING_CONTEXT_INVALID");
    const context = result.data;
    if (
      job.jobType !== "OPENING" ||
      job.taskSchemaVersion !== "opening-output.v1"
    ) {
      this.fail("OPENING_JOB_INVALID");
    }
    if (
      job.sessionId !== context.session.sessionId ||
      job.targetThroughSeq !== context.session.basedThroughSeq ||
      job.baseWikiVersion !== 0
    ) {
      this.fail("OPENING_CONTEXT_JOB_MISMATCH");
    }
    return context;
  }

  public async validate(
    job: ClaimedAiJob,
    context: OpeningContextV1,
    rawOutput: unknown,
  ): Promise<OpeningOutputV1> {
    this.assertContext(job, context);
    const result = OpeningOutputV1Schema.safeParse(rawOutput);
    if (!result.success) this.fail("OPENING_OUTPUT_INVALID");
    const output = result.data;
    if (
      output.packVersionId !== context.session.pinnedPackVersionId ||
      output.basedThroughSeq !== context.session.basedThroughSeq
    ) {
      this.fail("OPENING_OUTPUT_ENVELOPE_MISMATCH");
    }
    this.safety.assertSafe(output.message, { maxLength: 400 });
    const allowed = this.allowedEvidence(context);
    if (
      output.supportingEvidenceRefs.some(
        (reference) => !allowed.has(publicEvidenceRefKey(reference)),
      )
    ) {
      this.fail("OPENING_REFERENCE_NOT_IN_CONTEXT");
    }
    await this.resolveEvidence(context, output.supportingEvidenceRefs);
    return output;
  }

  private allowedEvidence(context: OpeningContextV1): Set<string> {
    const references: PublicEvidenceRef[] = [
      ...context.publicPrep.map((answer) => ({
        type: "PUBLIC_PREP" as const,
        prepAnswerId: answer.prepAnswerId,
      })),
      ...context.bookContext.sections.flatMap((section) =>
        section.items.map((item) => ({
          type: "BOOK_CONTEXT_ITEM" as const,
          packVersionId: context.bookContext.packVersionId,
          itemId: item.itemId,
        })),
      ),
    ];
    return new Set(references.map(publicEvidenceRefKey));
  }

  private async resolveEvidence(
    context: OpeningContextV1,
    references: readonly PublicEvidenceRef[],
  ): Promise<void> {
    try {
      const resolved = await this.evidenceResolver.resolve(
        {
          sessionId: context.session.sessionId,
          roomId: context.session.roomId,
          pinnedPackVersionId: context.session.pinnedPackVersionId,
          targetThroughSeq: context.session.basedThroughSeq,
        },
        references,
      );
      if (resolved.length !== references.length) {
        this.fail("OPENING_REFERENCE_INVALID", "PUBLIC_EVIDENCE_RESULT_INCOMPLETE");
      }
    } catch (error) {
      if (error instanceof OpeningOutputValidationError) throw error;
      this.fail(
        "OPENING_REFERENCE_INVALID",
        error instanceof PublicEvidenceResolutionError ? error.code : null,
      );
    }
  }

  private fail(code: string, causeCode: string | null = null): never {
    throw new OpeningOutputValidationError(code, causeCode);
  }
}
