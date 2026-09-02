import { z } from "zod";

export const ClosingResponseStatusSchema = z.enum([
  "PENDING",
  "SUBMITTED",
  "SKIPPED",
]);

export const ClosingActorResponseSchema = z.strictObject({
  status: ClosingResponseStatusSchema,
  revision: z.int().nonnegative(),
  body: z.string().min(1).max(300).nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export const SessionClosingStateSchema = z.strictObject({
  eligibleParticipantCount: z.int().nonnegative().max(15),
  completedParticipantCount: z.int().nonnegative().max(15),
  actorResponse: ClosingActorResponseSchema.nullable(),
});

export const UpsertClosingResponseRequestSchema = z
  .strictObject({
    commandId: z.uuid(),
    expectedPhaseVersion: z.int().positive(),
    expectedRevision: z.int().nonnegative(),
    status: z.enum(["SUBMITTED", "SKIPPED"]),
    body: z.string().max(300).nullable(),
  })
  .superRefine((request, context) => {
    const trimmed = request.body?.trim() ?? "";
    if (request.status === "SUBMITTED" && trimmed.length === 0) {
      context.addIssue({
        code: "custom",
        message: "a submitted closing response requires a non-blank body",
        path: ["body"],
      });
    }
    if (request.status === "SKIPPED" && request.body !== null) {
      context.addIssue({
        code: "custom",
        message: "a skipped closing response cannot include a body",
        path: ["body"],
      });
    }
  });

export const DeleteClosingResponseRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedPhaseVersion: z.int().positive(),
  expectedRevision: z.int().positive(),
});

export const ClosingResponseCommandResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  closing: SessionClosingStateSchema,
  aggregateVersion: z.int().positive(),
  eventCursor: z.int().positive(),
  duplicate: z.boolean(),
  officiallyEnded: z.boolean(),
  serverTime: z.iso.datetime(),
});

export const DiscussionResultStatusSchema = z.enum([
  "NOT_STARTED",
  "PENDING",
  "PROCESSING",
  "RETRYING",
  "READY",
  "FAILED",
  "INSUFFICIENT",
]);

export const SessionResultStateSchema = z.strictObject({
  status: DiscussionResultStatusSchema,
  canRetry: z.boolean(),
});

export const DiscussionRecordPerspectiveSchema = z.strictObject({
  summary: z.string().trim().min(1).max(500),
});

export const DiscussionRecordIssueSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  perspectives: z.array(DiscussionRecordPerspectiveSchema).min(1).max(6),
  connections: z.array(z.string().trim().min(1).max(500)).max(6),
});

export const DiscussionRecordSchema = z.strictObject({
  schemaVersion: z.literal("discussion-record.v1"),
  keyIssues: z.array(DiscussionRecordIssueSchema).min(2).max(4),
  changesAndExpansions: z.array(z.string().trim().min(1).max(500)).max(12),
  remainingQuestions: z.array(z.string().trim().min(1).max(500)).max(12),
});

export const DiscussionClosingLineSchema = z.strictObject({
  responseId: z.uuid(),
  profileName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(300),
});

export const GetDiscussionResultResponseSchema = z
  .strictObject({
    roomId: z.uuid(),
    sessionId: z.uuid(),
    status: DiscussionResultStatusSchema,
    canRetry: z.boolean(),
    record: DiscussionRecordSchema.nullable(),
    closingLines: z.array(DiscussionClosingLineSchema).max(15),
    readyAt: z.iso.datetime().nullable(),
    serverTime: z.iso.datetime(),
  })
  .superRefine((result, context) => {
    if ((result.status === "READY") !== (result.record !== null)) {
      context.addIssue({
        code: "custom",
        message: "only a READY result may expose a discussion record",
        path: ["record"],
      });
    }
    if (result.status !== "READY" && result.closingLines.length > 0) {
      context.addIssue({
        code: "custom",
        message: "closing lines are published only with a READY result",
        path: ["closingLines"],
      });
    }
  });

export const RetryDiscussionResultRequestSchema = z.strictObject({
  commandId: z.uuid(),
});

export const RetryDiscussionResultResponseSchema = z.strictObject({
  roomId: z.uuid(),
  sessionId: z.uuid(),
  jobId: z.uuid(),
  status: z.enum(["PENDING", "PROCESSING", "RETRYING"]),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime(),
});

export type ClosingResponseStatus = z.infer<typeof ClosingResponseStatusSchema>;
export type ClosingActorResponse = z.infer<typeof ClosingActorResponseSchema>;
export type SessionClosingState = z.infer<typeof SessionClosingStateSchema>;
export type UpsertClosingResponseRequest = z.infer<
  typeof UpsertClosingResponseRequestSchema
>;
export type DeleteClosingResponseRequest = z.infer<
  typeof DeleteClosingResponseRequestSchema
>;
export type ClosingResponseCommandResponse = z.infer<
  typeof ClosingResponseCommandResponseSchema
>;
export type DiscussionResultStatus = z.infer<
  typeof DiscussionResultStatusSchema
>;
export type SessionResultState = z.infer<typeof SessionResultStateSchema>;
export type DiscussionRecord = z.infer<typeof DiscussionRecordSchema>;
export type DiscussionClosingLine = z.infer<typeof DiscussionClosingLineSchema>;
export type GetDiscussionResultResponse = z.infer<
  typeof GetDiscussionResultResponseSchema
>;
export type RetryDiscussionResultRequest = z.infer<
  typeof RetryDiscussionResultRequestSchema
>;
export type RetryDiscussionResultResponse = z.infer<
  typeof RetryDiscussionResultResponseSchema
>;
