import { z } from "zod";

import {
  HostInterventionActionSchema,
  PublicAiLongTextSchema,
  PublicAiPrepTextSchema,
  PublicEvidenceRefsSchema,
} from "./ai-common.js";
import {
  PublicContextSessionPhaseSchema,
  PublicRawMessageV1Schema,
} from "./ai-context.js";
import { BookContextDocumentV1Schema } from "./book-context.js";
import {
  LivingWikiBookGroundingSchema,
  LivingWikiCurrentTopicSchema,
  LivingWikiIssueOrQuestionSchema,
  LivingWikiPerspectiveSchema,
} from "./living-wiki.js";
import { PolicyDecisionV1Schema } from "./ai-policy.js";

export const AiTaskAliasSchema = z.enum([
  "PUBLIC_EVALUATOR_INCREMENTAL_V1",
  "PUBLIC_EVALUATOR_TOPIC_CHECKPOINT_V1",
  "PUBLIC_EVALUATOR_FINAL_V1",
  "OPENING_V1",
  "HOST_INTERVENTION_V1",
  "SYNTHESIS_V1",
  "DISCUSSION_RECORD_V1",
  "BOOK_BUILDER_RESEARCH_V1",
  "BOOK_BUILDER_DRAFT_V1",
]);

export const AiReasoningEffortSchema = z.enum(["none", "low", "medium"]);

export const AiProviderRequestMetricsV1Schema = z.strictObject({
  inputBytes: z.int().nonnegative(),
  instructionsBytes: z.int().nonnegative(),
  outputSchemaBytes: z.int().nonnegative(),
  totalRequestBytes: z.int().nonnegative(),
  maxOutputTokens: z.int().positive(),
});

export const AiProviderRunV1Schema = z.strictObject({
  schemaVersion: z.literal("ai-provider-run.v1"),
  taskAlias: AiTaskAliasSchema,
  promptVersion: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  outputSchemaVersion: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9][a-z0-9._-]*$/),
  provider: z.literal("OPENAI"),
  model: z.string().min(1).max(100),
  reasoningEffort: AiReasoningEffortSchema,
  responseId: z.string().min(1).max(200),
  latencyMs: z.int().nonnegative(),
  requestMetrics: AiProviderRequestMetricsV1Schema,
  usage: z
    .strictObject({
      inputTokens: z.int().nonnegative(),
      cachedInputTokens: z.int().nonnegative().optional(),
      outputTokens: z.int().nonnegative(),
      reasoningTokens: z.int().nonnegative(),
      totalTokens: z.int().nonnegative(),
    })
    .nullable(),
});

export const OpeningContextV1Schema = z.strictObject({
  schemaVersion: z.literal("opening-context.v1"),
  session: z.strictObject({
    sessionId: z.uuid(),
    roomId: z.uuid(),
    pinnedPackVersionId: z.uuid(),
    phase: z.literal("OPENING"),
    phaseVersion: z.int().nonnegative(),
    basedThroughSeq: z.int().nonnegative(),
  }),
  publicPrep: z.array(
    z.strictObject({
      prepAnswerId: z.uuid(),
      promptType: z.enum([
        "QUOTE_THOUGHT",
        "IMPRESSIVE_PART",
        "DISCUSSION_QUESTION",
      ]),
      body: PublicAiPrepTextSchema,
    }),
  ),
  bookContext: BookContextDocumentV1Schema,
});

export const HostContextV1Schema = z
  .strictObject({
    schemaVersion: z.literal("host-context.v1"),
    session: z.strictObject({
      sessionId: z.uuid(),
      roomId: z.uuid(),
      pinnedPackVersionId: z.uuid(),
      phase: PublicContextSessionPhaseSchema,
      phaseVersion: z.int().nonnegative(),
      basedThroughSeq: z.int().nonnegative(),
    }),
    policy: PolicyDecisionV1Schema.safeExtend({
      action: HostInterventionActionSchema,
    }),
    discussionState: z.strictObject({
      summary: PublicAiLongTextSchema,
      currentTopic: LivingWikiCurrentTopicSchema.nullable(),
      majorPerspectives: z.array(LivingWikiPerspectiveSchema).max(20),
      bookGrounding: z.array(LivingWikiBookGroundingSchema).max(20),
      openIssues: z.array(LivingWikiIssueOrQuestionSchema).max(30),
    }),
    messages: z.array(PublicRawMessageV1Schema).max(40),
    bookContext: BookContextDocumentV1Schema,
    allowedEvidenceRefs: PublicEvidenceRefsSchema,
  })
  .superRefine((contextValue, context) => {
    const bookReferences = contextValue.policy.supportingEvidenceRefs.filter(
      (reference) => reference.type === "BOOK_CONTEXT_ITEM",
    );
    if (
      contextValue.session.pinnedPackVersionId !==
        contextValue.bookContext.packVersionId ||
      bookReferences.some(
        (reference) =>
          reference.packVersionId !==
          contextValue.session.pinnedPackVersionId,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Host context must use only the room-pinned Pack version",
        path: ["bookContext", "packVersionId"],
      });
    }
    if (
      contextValue.policy.evaluationTargetThroughSeq !==
      contextValue.session.basedThroughSeq
    ) {
      context.addIssue({
        code: "custom",
        message: "Host policy and context cursor must match",
        path: ["policy", "evaluationTargetThroughSeq"],
      });
    }
  });

export type AiTaskAlias = z.infer<typeof AiTaskAliasSchema>;
export type AiReasoningEffort = z.infer<typeof AiReasoningEffortSchema>;
export type AiProviderRequestMetricsV1 = z.infer<
  typeof AiProviderRequestMetricsV1Schema
>;
export type AiProviderRunV1 = z.infer<typeof AiProviderRunV1Schema>;
export type OpeningContextV1 = z.infer<typeof OpeningContextV1Schema>;
export type HostContextV1 = z.infer<typeof HostContextV1Schema>;
