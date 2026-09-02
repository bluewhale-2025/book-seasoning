import { z } from "zod";

import {
  AiConfidenceSchema,
  collectPublicEvidenceRefs,
  DiscussionMetricsV1Schema,
  InterventionNeedSchema,
  PolicyActionSchema,
  PublicAiShortTextSchema,
} from "./ai-common.js";
import {
  LivingWikiBookGroundingSchema,
  LivingWikiCurrentTopicSchema,
  LivingWikiPatchV1Schema,
  LivingWikiPerspectiveSchema,
  LivingWikiPublicParticipantStateSchema,
} from "./living-wiki.js";

export const PublicEvaluatorOutputSchemaVersionSchema = z.literal(
  "public-evaluator-output.v1",
);

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
