import { z } from "zod";

export const AiJobEnvelopeSchemaVersionSchema = z.literal("ai-job.v1");

export const AiQueueNameSchema = z.enum([
  "ai-session",
  "ai-record",
  "book-builder",
]);

export const AiSessionJobTypeSchema = z.enum([
  "OPENING",
  "PUBLIC_EVALUATION",
  "TOPIC_CHECKPOINT",
  "HOST_HELP",
  "EXTENSION_RECOMMENDATION",
  "SYNTHESIS",
  "FINAL_WIKI",
  "DISCUSSION_RECORD",
]);

export const AiJobStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "RETRY_SCHEDULED",
  "SUCCEEDED",
  "SUPPRESSED",
  "FAILED",
]);

export const AiJobAttemptOutcomeSchema = z.enum([
  "SUCCEEDED",
  "SUPPRESSED",
  "RETRYABLE_FAILURE",
  "TERMINAL_FAILURE",
]);

export const AiTaskSchemaVersionSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);

/**
 * The queue carries references and freshness coordinates only. Discussion,
 * prep, prompt and model output content must be loaded through the worker's
 * least-privilege repositories after claim.
 */
export const AiJobEnvelopeV1Schema = z.strictObject({
  schemaVersion: AiJobEnvelopeSchemaVersionSchema,
  jobId: z.uuid(),
  jobType: AiSessionJobTypeSchema,
  sessionId: z.uuid(),
  baseWikiVersion: z.int().nonnegative(),
  targetThroughSeq: z.int().nonnegative(),
  taskSchemaVersion: AiTaskSchemaVersionSchema,
});

export type AiQueueName = z.infer<typeof AiQueueNameSchema>;
export type AiSessionJobType = z.infer<typeof AiSessionJobTypeSchema>;
export type AiJobStatus = z.infer<typeof AiJobStatusSchema>;
export type AiJobAttemptOutcome = z.infer<typeof AiJobAttemptOutcomeSchema>;
export type AiJobEnvelopeV1 = z.infer<typeof AiJobEnvelopeV1Schema>;
