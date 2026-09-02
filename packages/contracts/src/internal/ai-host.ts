import { z } from "zod";

import {
  HostInterventionActionSchema,
  PublicAiLongTextSchema,
  PublicAiShortTextSchema,
  PublicEvidenceRefsSchema,
  type PublicEvidenceRef,
} from "./ai-common.js";

export const HostInterventionOutputSchemaVersionSchema = z.literal(
  "host-intervention-output.v1",
);
export const OpeningOutputSchemaVersionSchema = z.literal("opening-output.v1");
export const ExtensionRecommendationOutputSchemaVersionSchema = z.literal(
  "extension-recommendation-output.v1",
);

export const HostInterventionAttributionSchema = z.enum([
  "AUTOMATIC",
  "HOST_REQUESTED",
]);

const addReferenceBoundaryIssues = (
  references: readonly PublicEvidenceRef[],
  packVersionId: string,
  basedThroughSeq: number,
  context: z.RefinementCtx,
): void => {
  for (const [index, reference] of references.entries()) {
    if (
      (reference.type === "MESSAGE" || reference.type === "AI_INTERVENTION") &&
      reference.seqNo > basedThroughSeq
    ) {
      context.addIssue({
        code: "custom",
        message: "Host evidence cannot be newer than basedThroughSeq",
        path: ["supportingEvidenceRefs", index, "seqNo"],
      });
    }
    if (
      reference.type === "BOOK_CONTEXT_ITEM" &&
      reference.packVersionId !== packVersionId
    ) {
      context.addIssue({
        code: "custom",
        message: "Host evidence must use the room-pinned Pack version",
        path: ["supportingEvidenceRefs", index, "packVersionId"],
      });
    }
  }
};

export const HostInterventionOutputV1Schema = z
  .strictObject({
    schemaVersion: HostInterventionOutputSchemaVersionSchema,
    packVersionId: z.uuid(),
    basedThroughSeq: z.int().nonnegative(),
    action: HostInterventionActionSchema,
    attribution: HostInterventionAttributionSchema,
    message: PublicAiLongTextSchema,
    supportingEvidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((output, context) => {
    addReferenceBoundaryIssues(
      output.supportingEvidenceRefs,
      output.packVersionId,
      output.basedThroughSeq,
      context,
    );
  });

export const OpeningOutputV1Schema = z
  .strictObject({
    schemaVersion: OpeningOutputSchemaVersionSchema,
    packVersionId: z.uuid(),
    basedThroughSeq: z.int().nonnegative(),
    message: PublicAiLongTextSchema,
    supportingEvidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((output, context) => {
    addReferenceBoundaryIssues(
      output.supportingEvidenceRefs,
      output.packVersionId,
      output.basedThroughSeq,
      context,
    );
  });

export const ExtensionRecommendationOutputV1Schema = z
  .strictObject({
    schemaVersion: ExtensionRecommendationOutputSchemaVersionSchema,
    packVersionId: z.uuid(),
    basedThroughSeq: z.int().nonnegative(),
    recommendation: z.enum(["EXTEND", "FINISH"]),
    reason: PublicAiShortTextSchema,
    supportingEvidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((output, context) => {
    addReferenceBoundaryIssues(
      output.supportingEvidenceRefs,
      output.packVersionId,
      output.basedThroughSeq,
      context,
    );
  });

export type HostInterventionOutputV1 = z.infer<
  typeof HostInterventionOutputV1Schema
>;
export type OpeningOutputV1 = z.infer<typeof OpeningOutputV1Schema>;
export type ExtensionRecommendationOutputV1 = z.infer<
  typeof ExtensionRecommendationOutputV1Schema
>;
