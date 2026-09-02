import { z } from "zod";

import {
  AiConfidenceSchema,
  BookContextItemEvidenceRefSchema,
  collectPublicEvidenceRefs,
  DiscussionMetricsV1Schema,
  InterventionNeedSchema,
  PolicyActionSchema,
  PublicAiShortTextSchema,
  PublicEvidenceRefSchema,
} from "./ai-common.js";
import {
  LivingWikiBookGroundingSchema,
  LivingWikiCoverageSchema,
  LivingWikiCurrentTopicSchema,
  LivingWikiIssueOrQuestionSchema,
  LivingWikiKeyChangeSchema,
  LivingWikiPatchV1Schema,
  LivingWikiPatchSchemaVersionSchema,
  LivingWikiPerspectiveRelationSchema,
  LivingWikiPerspectiveSchema,
  LivingWikiPublicParticipantStateSchema,
} from "./living-wiki.js";

export const PublicEvaluatorOutputSchemaVersionSchema = z.literal(
  "public-evaluator-output.v1",
);

/**
 * Provider-facing structural schema. Cross-field and evidence-scope checks are
 * deliberately applied by PublicEvaluatorOutputV1Schema after the server has
 * canonicalized opaque PUBLIC evidence identifiers from the exact context.
 */
const ProviderEvidenceRefsSchema = z.array(PublicEvidenceRefSchema).max(24);
const ProviderRequiredEvidenceRefsSchema = ProviderEvidenceRefsSchema.min(1);
const providerMetricSchema = <
  const Low extends readonly [string, ...string[]],
  const Medium extends readonly [string, ...string[]],
  const High extends readonly [string, ...string[]],
>(codes: { LOW: Low; MEDIUM: Medium; HIGH: High }) =>
  z.discriminatedUnion("level", [
    z.strictObject({
      level: z.literal("LOW"),
      reasonCodes: z.array(z.enum(codes.LOW)).min(1).max(4),
      evidenceRefs: ProviderEvidenceRefsSchema,
    }),
    z.strictObject({
      level: z.literal("MEDIUM"),
      reasonCodes: z.array(z.enum(codes.MEDIUM)).min(1).max(4),
      evidenceRefs: ProviderEvidenceRefsSchema,
    }),
    z.strictObject({
      level: z.literal("HIGH"),
      reasonCodes: z.array(z.enum(codes.HIGH)).min(1).max(4),
      evidenceRefs: ProviderEvidenceRefsSchema,
    }),
  ]);
const ProviderMetricsSchema = z.strictObject({
  depth: providerMetricSchema({
    LOW: ["REACTIONS_OR_ASSERTIONS_ONLY"],
    MEDIUM: ["REASONS_OR_BOOK_EVIDENCE_PRESENT"],
    HIGH: [
      "REASONS_AND_ASSUMPTIONS_COMPARED",
      "COUNTERARGUMENTS_OR_REVISIONS_PRESENT",
    ],
  }),
  expansion: providerMetricSchema({
    LOW: ["VIEWPOINTS_REPEAT_WITHOUT_CONNECTION"],
    MEDIUM: ["NEW_VIEW_WITH_WEAK_CONNECTION"],
    HIGH: ["PERSPECTIVES_CONNECTED_AND_CONTRASTED", "NEW_ISSUE_EMERGED"],
  }),
  bookGrounding: providerMetricSchema({
    LOW: ["BOOK_CONNECTION_NOT_OBSERVED"],
    MEDIUM: ["BOOK_ORIGINATED_EXTENSION_CONTINUES", "BOOK_IDEA_REMAINS_ANCHOR"],
    HIGH: ["SPECIFIC_BOOK_EVIDENCE_USED"],
  }),
  saturation: providerMetricSchema({
    LOW: ["NEW_QUESTIONS_STILL_EMERGING"],
    MEDIUM: ["EXPLORATION_REMAINS"],
    HIGH: ["CLAIMS_AND_REASONS_REPEAT", "LITTLE_NEW_VALUE_OBSERVED"],
  }),
  participationBalance: providerMetricSchema({
    LOW: ["ONE_MEANINGFUL_VIEW_DOMINATES"],
    MEDIUM: ["SOME_ACTIVE_VIEWS_MISSING", "MULTIPLE_MEANINGFUL_VIEWS_PRESENT"],
    HIGH: ["ACTIVE_VIEWS_BROADLY_REPRESENTED"],
  }),
  relevance: providerMetricSchema({
    LOW: ["CURRENT_ISSUE_CONNECTION_WEAK"],
    MEDIUM: ["RELATED_TANGENT_HAS_VALUE", "NEW_TOPIC_CANDIDATE_EMERGED"],
    HIGH: ["CURRENT_ISSUE_REMAINS_FOCUSED"],
  }),
  activity: providerMetricSchema({
    LOW: ["SILENCE_WITHOUT_RESPONSE", "FEW_RECENT_RESPONSES"],
    MEDIUM: ["THINKING_PAUSE_PLAUSIBLE"],
    HIGH: ["RESPONSES_ARE_CONTINUING"],
  }),
});
const ProviderCurrentTopicSchema = z.strictObject({
  ...LivingWikiCurrentTopicSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderPerspectiveRelationSchema = z.strictObject({
  ...LivingWikiPerspectiveRelationSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderPerspectiveSchema = z.strictObject({
  ...LivingWikiPerspectiveSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
  relations: z.array(ProviderPerspectiveRelationSchema).max(20),
});
const ProviderBookGroundingSchema = z.strictObject({
  ...LivingWikiBookGroundingSchema.shape,
  bookContextItemRef: BookContextItemEvidenceRefSchema,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderIssueOrQuestionSchema = z.strictObject({
  ...LivingWikiIssueOrQuestionSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderCoverageSchema = z.strictObject({
  ...LivingWikiCoverageSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderParticipantStateSchema = z.strictObject({
  ...LivingWikiPublicParticipantStateSchema.shape,
  evidenceRefs: ProviderEvidenceRefsSchema,
});
const ProviderKeyChangeSchema = z.strictObject({
  ...LivingWikiKeyChangeSchema.shape,
  evidenceRefs: ProviderRequiredEvidenceRefsSchema,
});
const ProviderMetricsAndKeyChangesSchema = z.strictObject({
  metrics: ProviderMetricsSchema,
  summary: PublicAiShortTextSchema,
  keyChanges: z.array(ProviderKeyChangeSchema).max(30),
});
const ProviderPatchOperationSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("SET_CURRENT_TOPIC"),
    baseVersion: z.int().nonnegative(),
    topic: ProviderCurrentTopicSchema,
  }),
  z.strictObject({
    operation: z.literal("UPSERT_PERSPECTIVE"),
    baseVersion: z.int().nonnegative(),
    perspective: ProviderPerspectiveSchema,
  }),
  z.strictObject({
    operation: z.literal("REMOVE_PERSPECTIVE"),
    baseVersion: z.int().nonnegative(),
    perspectiveId: z.uuid(),
    evidenceRefs: ProviderRequiredEvidenceRefsSchema,
  }),
  z.strictObject({
    operation: z.literal("UPSERT_BOOK_GROUNDING"),
    baseVersion: z.int().nonnegative(),
    grounding: ProviderBookGroundingSchema,
  }),
  z.strictObject({
    operation: z.literal("REMOVE_BOOK_GROUNDING"),
    baseVersion: z.int().nonnegative(),
    groundingId: z.uuid(),
    evidenceRefs: ProviderRequiredEvidenceRefsSchema,
  }),
  z.strictObject({
    operation: z.literal("UPSERT_ISSUE_OR_QUESTION"),
    baseVersion: z.int().nonnegative(),
    issueOrQuestion: ProviderIssueOrQuestionSchema,
  }),
  z.strictObject({
    operation: z.literal("UPDATE_COVERAGE"),
    baseVersion: z.int().nonnegative(),
    coverage: ProviderCoverageSchema,
  }),
  z.strictObject({
    operation: z.literal("UPSERT_PUBLIC_PARTICIPANT_STATE"),
    baseVersion: z.int().nonnegative(),
    participantState: ProviderParticipantStateSchema,
  }),
  z.strictObject({
    operation: z.literal("SET_METRICS_AND_KEY_CHANGES"),
    baseVersion: z.int().nonnegative(),
    metricsAndKeyChanges: ProviderMetricsAndKeyChangesSchema,
  }),
]);
const ProviderPatchSchema = z.strictObject({
  schemaVersion: LivingWikiPatchSchemaVersionSchema,
  baseVersion: z.int().nonnegative(),
  basedThroughSeq: z.int().nonnegative(),
  operations: z.array(ProviderPatchOperationSchema).max(100),
});

export const PublicEvaluatorProviderOutputV1Schema = z.strictObject({
  schemaVersion: PublicEvaluatorOutputSchemaVersionSchema,
  packVersionId: z.uuid(),
  baseWikiVersion: z.int().nonnegative(),
  targetThroughSeq: z.int().nonnegative(),
  metrics: ProviderMetricsSchema,
  summaryState: PublicAiShortTextSchema,
  currentTopic: ProviderCurrentTopicSchema.nullable(),
  majorPerspectives: z.array(ProviderPerspectiveSchema).max(20),
  bookGrounding: z.array(ProviderBookGroundingSchema).max(20),
  participation: z.array(ProviderParticipantStateSchema).max(15),
  interventionNeed: InterventionNeedSchema,
  confidence: AiConfidenceSchema,
  suggestedAction: PolicyActionSchema,
  wikiPatch: ProviderPatchSchema,
});

export const PublicEvaluatorOutputV1Schema = z
  .strictObject({
    schemaVersion: PublicEvaluatorOutputSchemaVersionSchema,
    packVersionId: z.uuid(),
    baseWikiVersion: z.int().nonnegative(),
    targetThroughSeq: z.int().nonnegative(),
    metrics: DiscussionMetricsV1Schema,
    summaryState: PublicAiShortTextSchema,
    currentTopic: LivingWikiCurrentTopicSchema.nullable(),
    majorPerspectives: z.array(LivingWikiPerspectiveSchema).max(20),
    bookGrounding: z.array(LivingWikiBookGroundingSchema).max(20),
    participation: z.array(LivingWikiPublicParticipantStateSchema).max(15),
    interventionNeed: InterventionNeedSchema,
    confidence: AiConfidenceSchema,
    suggestedAction: PolicyActionSchema,
    wikiPatch: LivingWikiPatchV1Schema,
  })
  .superRefine((output, context) => {
    if (output.wikiPatch.baseVersion !== output.baseWikiVersion) {
      context.addIssue({
        code: "custom",
        message: "Wiki patch must use the evaluated base Wiki version",
        path: ["wikiPatch", "baseVersion"],
      });
    }
    if (output.wikiPatch.basedThroughSeq !== output.targetThroughSeq) {
      context.addIssue({
        code: "custom",
        message: "Wiki patch cursor must match the evaluation target cursor",
        path: ["wikiPatch", "basedThroughSeq"],
      });
    }

    for (const reference of collectPublicEvidenceRefs(output)) {
      if (
        (reference.type === "MESSAGE" ||
          reference.type === "AI_INTERVENTION") &&
        reference.seqNo > output.targetThroughSeq
      ) {
        context.addIssue({
          code: "custom",
          message: "evaluation evidence cannot be newer than targetThroughSeq",
          path: ["targetThroughSeq"],
        });
      }
      if (
        reference.type === "BOOK_CONTEXT_ITEM" &&
        reference.packVersionId !== output.packVersionId
      ) {
        context.addIssue({
          code: "custom",
          message: "evaluation can reference only its pinned Pack version",
          path: ["packVersionId"],
        });
      }
    }
  });

export type PublicEvaluatorOutputV1 = z.infer<
  typeof PublicEvaluatorOutputV1Schema
>;
