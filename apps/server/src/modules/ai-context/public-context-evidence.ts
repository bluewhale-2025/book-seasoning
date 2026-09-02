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
  allowedEvidenceRefs: readonly PublicEvidenceRef[];
}>;

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
    allowedEvidenceRefs: publicContextEvidenceRefs(context),
  };
}

/**
 * Evidence UUIDs are opaque database identifiers, not semantic model output.
 * The model selects evidence by the stable locator it can reason about (message
 * sequence or Book item id); the server restores the exact reference from the
 * already validated PUBLIC context. Unknown locators remain untouched and are
 * rejected by the normal allow-list and database resolver checks.
 */
export function canonicalizePublicEvidenceRefs<T>(
  value: T,
  context: PublicContextV1,
): T {
  const allowed = publicContextEvidenceRefs(context);
  const messagesBySeq = new Map(
    allowed.flatMap((reference) =>
      reference.type === "MESSAGE" || reference.type === "AI_INTERVENTION"
        ? [[reference.seqNo, reference] as const]
        : [],
    ),
  );
  const bookItemsById = new Map(
    allowed.flatMap((reference) =>
      reference.type === "BOOK_CONTEXT_ITEM"
        ? [[reference.itemId, reference] as const]
        : [],
    ),
  );

  const visit = (candidate: unknown): unknown => {
    const parsed = PublicEvidenceRefSchema.safeParse(candidate);
    if (parsed.success) {
      const reference = parsed.data;
      if (
        reference.type === "MESSAGE" ||
        reference.type === "AI_INTERVENTION"
      ) {
        return messagesBySeq.get(reference.seqNo) ?? reference;
      }
      if (reference.type === "BOOK_CONTEXT_ITEM") {
        return bookItemsById.get(reference.itemId) ?? reference;
      }
      return reference;
    }
    if (Array.isArray(candidate)) {
      const visited = candidate.map(visit);
      const references = visited.map((item) =>
        PublicEvidenceRefSchema.safeParse(item),
      );
      if (references.every((item) => item.success)) {
        const unique = new Map<string, PublicEvidenceRef>();
        for (const reference of references) {
          unique.set(
            publicEvidenceRefKey(reference.data),
            reference.data,
          );
        }
        return [...unique.values()];
      }
      return visited;
    }
    if (candidate !== null && typeof candidate === "object") {
      return Object.fromEntries(
        Object.entries(candidate).map(([key, nested]) => [key, visit(nested)]),
      );
    }
    return candidate;
  };

  return visit(value) as T;
}
