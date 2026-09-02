import { z } from "zod";

/**
 * Synthetic private-lane values use this prefix in leak tests. Public-lane
 * contracts reject the prefix even when it is hidden inside otherwise valid
 * generated text.
 */
export const AI_PRIVATE_CANARY_PREFIX = "AI_PRIVATE_CANARY_";

const withoutPrivateCanary = <T extends z.ZodString>(schema: T) =>
  schema.refine(
    (value) => !value.includes(AI_PRIVATE_CANARY_PREFIX),
    "AI_PRIVATE canary must not enter a public AI contract",
  );

export const PublicAiLabelSchema = withoutPrivateCanary(
  z.string().trim().min(1).max(120),
);

export const PublicAiShortTextSchema = withoutPrivateCanary(
  z.string().trim().min(1).max(500),
);

export const PublicAiLongTextSchema = withoutPrivateCanary(
  z.string().trim().min(1).max(2000),
);

export const PublicAiPrepTextSchema = withoutPrivateCanary(
  z.string().trim().min(1).max(4000),
);

export const MessageEvidenceRefSchema = z.strictObject({
  type: z.literal("MESSAGE"),
  messageId: z.uuid(),
  seqNo: z.int().positive(),
});

export const PublicPrepEvidenceRefSchema = z.strictObject({
  type: z.literal("PUBLIC_PREP"),
  prepAnswerId: z.uuid(),
});

export const AiInterventionEvidenceRefSchema = z.strictObject({
  type: z.literal("AI_INTERVENTION"),
  messageId: z.uuid(),
  seqNo: z.int().positive(),
});

export const BookContextItemEvidenceRefSchema = z.strictObject({
  type: z.literal("BOOK_CONTEXT_ITEM"),
  packVersionId: z.uuid(),
  itemId: z.uuid(),
});

/**
 * This union intentionally has no AI_PRIVATE variant. Private inputs belong to
 * a different repository, context builder and task contract.
 */
export const PublicEvidenceRefSchema = z.discriminatedUnion("type", [
  MessageEvidenceRefSchema,
  PublicPrepEvidenceRefSchema,
  AiInterventionEvidenceRefSchema,
  BookContextItemEvidenceRefSchema,
]);

export const publicEvidenceRefKey = (reference: PublicEvidenceRef): string => {
  switch (reference.type) {
    case "MESSAGE":
    case "AI_INTERVENTION":
      return `${reference.type}:${reference.messageId}:${reference.seqNo}`;
    case "PUBLIC_PREP":
      return `${reference.type}:${reference.prepAnswerId}`;
    case "BOOK_CONTEXT_ITEM":
      return `${reference.type}:${reference.packVersionId}:${reference.itemId}`;
  }
};

export const PublicEvidenceRefsSchema = z
  .array(PublicEvidenceRefSchema)
  .max(24)
  .superRefine((references, context) => {
    const seen = new Set<string>();
    for (const [index, reference] of references.entries()) {
      const key = publicEvidenceRefKey(reference);
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: "public evidence references must be unique",
          path: [index],
        });
      }
      seen.add(key);
    }
  });

export const RequiredPublicEvidenceRefsSchema = PublicEvidenceRefsSchema.min(1);

export const collectPublicEvidenceRefs = (
  value: unknown,
): PublicEvidenceRef[] => {
  const parsedReference = PublicEvidenceRefSchema.safeParse(value);
  if (parsedReference.success) return [parsedReference.data];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPublicEvidenceRefs(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap((item) =>
      collectPublicEvidenceRefs(item),
    );
  }
  return [];
};

export const DiscussionMetricLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const DiscussionMetricReasonCodeSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const DiscussionMetricObservationSchema = z.strictObject({
  level: DiscussionMetricLevelSchema,
  reasonCodes: z.array(DiscussionMetricReasonCodeSchema).min(1).max(4),
  evidenceRefs: PublicEvidenceRefsSchema,
});

/**
 * An object, rather than a list, makes all seven independent metrics required
 * exactly once and leaves no place for a product-distorting total score.
 */
export const DiscussionMetricsV1Schema = z.strictObject({
  depth: DiscussionMetricObservationSchema,
  expansion: DiscussionMetricObservationSchema,
  bookGrounding: DiscussionMetricObservationSchema,
  saturation: DiscussionMetricObservationSchema,
  participationBalance: DiscussionMetricObservationSchema,
  relevance: DiscussionMetricObservationSchema,
  activity: DiscussionMetricObservationSchema,
});

export const PolicyActionSchema = z.enum([
  "WAIT",
  "DEEPEN",
  "EXPAND",
  "RECONNECT",
  "RECONNECT_TO_BOOK",
  "RECONNECT_AND_REFLECT",
  "INVITE",
  "REVIVE",
  "SUMMARIZE",
  "TRANSITION",
  "RECOMMEND_EXTENSION",
]);

export const HostInterventionActionSchema = PolicyActionSchema.exclude([
  "WAIT",
]);

export const AiConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const InterventionNeedSchema = z.enum([
  "NONE",
  "LOW",
  "MEDIUM",
  "HIGH",
]);

export type PublicEvidenceRef = z.infer<typeof PublicEvidenceRefSchema>;
export type DiscussionMetricLevel = z.infer<
  typeof DiscussionMetricLevelSchema
>;
export type DiscussionMetricsV1 = z.infer<typeof DiscussionMetricsV1Schema>;
export type PolicyAction = z.infer<typeof PolicyActionSchema>;
export type HostInterventionAction = z.infer<
  typeof HostInterventionActionSchema
>;
