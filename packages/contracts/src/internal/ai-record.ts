import { z } from "zod";

import { DiscussionRecordSchema } from "../public/result.js";
import {
  PublicAiLongTextSchema,
  PublicAiShortTextSchema,
  PublicEvidenceRefsSchema,
} from "./ai-common.js";
import { PublicRawMessageV1Schema } from "./ai-context.js";
import { LivingWikiVersionV1Schema } from "./living-wiki.js";

export const SynthesisOutputV1Schema = z.strictObject({
  schemaVersion: z.literal("synthesis-output.v1"),
  packVersionId: z.uuid(),
  basedThroughSeq: z.int().nonnegative(),
  message: PublicAiLongTextSchema,
  perspectiveSummaries: z.array(PublicAiShortTextSchema).min(2).max(4),
  reflectionQuestion: PublicAiShortTextSchema,
  supportingEvidenceRefs: PublicEvidenceRefsSchema,
});

export const DiscussionRecordContextV1Schema = z.strictObject({
  schemaVersion: z.literal("discussion-record-context.v1"),
  sessionId: z.uuid(),
  roomId: z.uuid(),
  pinnedPackVersionId: z.uuid(),
  finalWiki: LivingWikiVersionV1Schema.safeExtend({ kind: z.literal("FINAL") }),
  messages: z.array(PublicRawMessageV1Schema).max(200),
  closingLines: z
    .array(
      z.strictObject({
        responseId: z.uuid(),
        profileName: z.string().trim().min(1).max(120),
        body: z.string().trim().min(1).max(300),
      }),
    )
    .max(15),
});

export const DiscussionRecordOutputV1Schema = z.strictObject({
  schemaVersion: z.literal("discussion-record-output.v1"),
  sessionId: z.uuid(),
  finalWikiVersion: z.int().positive(),
  basedThroughSeq: z.int().nonnegative(),
  record: DiscussionRecordSchema,
  supportingEvidenceRefs: PublicEvidenceRefsSchema,
});

export type SynthesisOutputV1 = z.infer<typeof SynthesisOutputV1Schema>;
export type DiscussionRecordContextV1 = z.infer<
  typeof DiscussionRecordContextV1Schema
>;
export type DiscussionRecordOutputV1 = z.infer<
  typeof DiscussionRecordOutputV1Schema
>;
