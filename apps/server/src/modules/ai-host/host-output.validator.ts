import { Inject, Injectable } from "@nestjs/common";

import {
  HostContextV1Schema,
  HostInterventionOutputV1Schema,
  publicEvidenceRefKey,
  type HostInterventionOutputV1,
} from "@bookseasoning/contracts/internal";

import {
  PUBLIC_EVIDENCE_RESOLVER,
  PublicEvidenceResolutionError,
  type PublicEvidenceResolver,
} from "../ai-context/public-evidence-reference.resolver.js";
import { PublicAiOutputSafetyValidator } from "./public-ai-output-safety.validator.js";

export class HostOutputValidationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly causeCode: string | null = null,
  ) {
    super(code);
    this.name = "HostOutputValidationError";
  }
}

@Injectable()
export class HostOutputValidator {
  public constructor(
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
    @Inject(PublicAiOutputSafetyValidator)
    private readonly safety: PublicAiOutputSafetyValidator,
  ) {}

  public async validate(
    rawContext: unknown,
    rawOutput: unknown,
  ): Promise<HostInterventionOutputV1> {
    const contextResult = HostContextV1Schema.safeParse(rawContext);
    if (!contextResult.success) this.fail("HOST_CONTEXT_INVALID");
    const outputResult = HostInterventionOutputV1Schema.safeParse(rawOutput);
    if (!outputResult.success) this.fail("HOST_OUTPUT_INVALID");
    const context = contextResult.data;
    const output = outputResult.data;
    const expectedAttribution =
      context.policy.trigger === "HOST_HELP" ? "HOST_REQUESTED" : "AUTOMATIC";
    if (
      output.packVersionId !== context.session.pinnedPackVersionId ||
      output.basedThroughSeq !== context.session.basedThroughSeq ||
      output.action !== context.policy.action ||
      output.attribution !== expectedAttribution
    ) {
      this.fail("HOST_OUTPUT_ENVELOPE_MISMATCH");
    }
    this.safety.assertSafe(output.message, {
      maxLength: 600,
      forbiddenProfileNames: context.messages.map(
        (message) => message.authorProfileName,
      ),
    });
    const allowed = new Set(
      context.allowedEvidenceRefs.map((reference) =>
        publicEvidenceRefKey(reference),
      ),
    );
    if (
      output.supportingEvidenceRefs.some(
        (reference) => !allowed.has(publicEvidenceRefKey(reference)),
      )
    ) {
      this.fail("HOST_REFERENCE_NOT_IN_CONTEXT");
    }
    try {
      const resolved = await this.evidenceResolver.resolve(
        {
          sessionId: context.session.sessionId,
          roomId: context.session.roomId,
          pinnedPackVersionId: context.session.pinnedPackVersionId,
          targetThroughSeq: context.session.basedThroughSeq,
        },
        output.supportingEvidenceRefs,
      );
      if (resolved.length !== output.supportingEvidenceRefs.length) {
        this.fail("HOST_REFERENCE_INVALID", "PUBLIC_EVIDENCE_RESULT_INCOMPLETE");
      }
    } catch (error) {
      if (error instanceof HostOutputValidationError) throw error;
      this.fail(
        "HOST_REFERENCE_INVALID",
        error instanceof PublicEvidenceResolutionError ? error.code : null,
      );
    }
    return output;
  }

  private fail(code: string, causeCode: string | null = null): never {
    throw new HostOutputValidationError(code, causeCode);
  }
}
