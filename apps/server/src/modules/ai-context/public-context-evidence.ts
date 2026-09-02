import {
  PublicEvidenceRefSchema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type PublicContextV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

export type PublicEvaluatorPromptInput = Readonly<{
  context: PublicContextV1;
  requiredOutputEnvelope: Readonly<{
    packVersionId: string;
    baseWikiVersion: number;
    targetThroughSeq: number;
  }>;
  allowedEvidenceCatalog: readonly Readonly<{
    index: number;
    reference: PublicEvidenceRef;
  }>[];
}>;

export class PublicEvidenceIndexError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "PublicEvidenceIndexError";
  }
}

export function publicContextEvidenceRefs(
  context: PublicContextV1,
): PublicEvidenceRef[] {
  const references: PublicEvidenceRef[] = [
    ...collectPublicEvidenceRefs(context.baseWiki),
    ...collectPublicEvidenceRefs(context.recentPolicyAction),
    ...context.messages.map((message) =>
      message.kind === "PARTICIPANT"
        ? {
            type: "MESSAGE" as const,
            messageId: message.messageId,
            seqNo: message.seqNo,
          }
        : {
            type: "AI_INTERVENTION" as const,
            messageId: message.messageId,
            seqNo: message.seqNo,
          },
    ),
    ...context.publicPrep.map((prep) => ({
      type: "PUBLIC_PREP" as const,
      prepAnswerId: prep.prepAnswerId,
    })),
    ...context.bookContext.sections.flatMap((section) =>
      section.items.map((item) => ({
        type: "BOOK_CONTEXT_ITEM" as const,
        packVersionId: context.bookContext.packVersionId,
        itemId: item.itemId,
      })),
    ),
  ];
  const unique = new Map<string, PublicEvidenceRef>();
  for (const reference of references) {
    unique.set(publicEvidenceRefKey(reference), reference);
  }
  return [...unique.values()];
}

export function publicEvaluatorPromptInput(
  context: PublicContextV1,
): PublicEvaluatorPromptInput {
  return {
    context,
    requiredOutputEnvelope: {
      packVersionId: context.session.pinnedPackVersionId,
      baseWikiVersion: context.baseWiki?.version ?? 0,
      targetThroughSeq: context.session.targetThroughSeq,
    },
    allowedEvidenceCatalog: publicContextEvidenceRefs(context).map(
      (reference, index) => ({ index, reference }),
    ),
  };
}

/**
 * Provider output uses indexes into the exact PUBLIC evidence catalog so it
 * never has to repeat opaque UUID-bearing reference objects. The canonical
 * application result still contains full references and passes the unchanged
 * allow-list and database materialization checks.
 */
export function expandPublicEvaluatorEvidenceIndexes<T>(
  value: T,
  context: PublicContextV1,
): T {
  const allowed = publicContextEvidenceRefs(context);
  const referenceAt = (candidate: unknown): PublicEvidenceRef => {
    if (!Number.isInteger(candidate) || (candidate as number) < 0) {
      throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_INDEX_INVALID");
    }
    const reference = allowed[candidate as number];
    if (reference === undefined) {
      throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_INDEX_OUT_OF_RANGE");
    }
    return reference;
  };

  const visit = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) {
      return candidate.map(visit);
    }
    if (candidate !== null && typeof candidate === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(candidate)) {
        if (key === "evidenceRefIndexes") {
          if (!Array.isArray(nested)) {
            throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_INDEX_INVALID");
          }
          const unique = new Map<string, PublicEvidenceRef>();
          for (const index of nested) {
            const reference = referenceAt(index);
            unique.set(publicEvidenceRefKey(reference), reference);
          }
          result.evidenceRefs = [...unique.values()];
        } else if (key === "bookContextItemRefIndex") {
          const reference = referenceAt(nested);
          if (reference.type !== "BOOK_CONTEXT_ITEM") {
            throw new PublicEvidenceIndexError(
              "PUBLIC_BOOK_EVIDENCE_INDEX_TYPE_INVALID",
            );
          }
          result.bookContextItemRef = reference;
        } else {
          result[key] = visit(nested);
        }
      }
      return result;
    }
    return candidate;
  };

  return visit(value) as T;
}

/** Test/eval helper for verifying the provider-index round trip. */
export function indexPublicEvaluatorEvidenceRefs<T>(
  value: T,
  context: PublicContextV1,
): T {
  const indexByKey = new Map(
    publicContextEvidenceRefs(context).map((reference, index) => [
      publicEvidenceRefKey(reference),
      index,
    ]),
  );
  const indexOf = (candidate: unknown): number => {
    const parsed = PublicEvidenceRefSchema.safeParse(candidate);
    if (!parsed.success) {
      throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_REFERENCE_INVALID");
    }
    const index = indexByKey.get(publicEvidenceRefKey(parsed.data));
    if (index === undefined) {
      throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_REFERENCE_NOT_ALLOWED");
    }
    return index;
  };
  const visit = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(visit);
    if (candidate !== null && typeof candidate === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(candidate)) {
        if (key === "evidenceRefs") {
          if (!Array.isArray(nested)) {
            throw new PublicEvidenceIndexError("PUBLIC_EVIDENCE_REFERENCE_INVALID");
          }
          result.evidenceRefIndexes = nested.map(indexOf);
        } else if (key === "bookContextItemRef") {
          result.bookContextItemRefIndex = indexOf(nested);
        } else {
          result[key] = visit(nested);
        }
      }
      return result;
    }
    return candidate;
  };
  return visit(value) as T;
}
