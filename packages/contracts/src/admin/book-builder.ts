import { z } from "zod";

import {
  BookBuilderDraftV1Schema,
  BookBuilderScopeSchema,
  BookBuilderStageSchema,
} from "../internal/book-builder.js";

export const AdminPackStatusSchema = z.enum([
  "DRAFT",
  "REVIEW",
  "PUBLISHED",
  "RETIRED",
]);
export const BuilderRunStatusSchema = z.enum([
  "PENDING",
  "RUNNING",
  "RETRYING",
  "SUCCEEDED",
  "FAILED",
]);
export const BuilderRunSchema = z.strictObject({
  runId: z.uuid(),
  packVersionId: z.uuid(),
  stage: BookBuilderStageSchema,
  status: BuilderRunStatusSchema,
  completedStageCount: z.int().nonnegative().max(7),
  errorCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
  scope: BookBuilderScopeSchema,
  targetItemId: z.uuid().nullable(),
});
export const CreateBookContextPackRequestSchema = z.strictObject({
  commandId: z.uuid(),
  title: z.string().trim().min(1).max(300),
  author: z.string().trim().min(1).max(200),
});
export const CreateBookContextPackResponseSchema = z.strictObject({
  packVersionId: z.uuid(),
  status: z.literal("DRAFT"),
  revision: z.int().nonnegative(),
  run: BuilderRunSchema,
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});
export const AdminBookContextPackSummarySchema = z.strictObject({
  packVersionId: z.uuid(),
  bookId: z.uuid(),
  title: z.string().min(1),
  author: z.string().min(1),
  version: z.int().positive(),
  status: AdminPackStatusSchema,
  revision: z.int().nonnegative(),
  updatedAt: z.iso.datetime({ offset: true }),
  builderRun: BuilderRunSchema.nullable(),
});
export const AdminBookContextPackListResponseSchema = z.array(
  AdminBookContextPackSummarySchema,
);
export const AdminBookContextPackSnapshotSchema = z.strictObject({
  pack: AdminBookContextPackSummarySchema,
  draft: BookBuilderDraftV1Schema,
  validation: z.strictObject({
    hardBlockers: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(100),
    warnings: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(100),
  }),
  pendingProposal: z.strictObject({
    proposalId: z.uuid(),
    runId: z.uuid(),
    scope: z.enum(["FULL", "ITEM"]),
    targetItemId: z.uuid().nullable(),
    baseRevision: z.int().nonnegative(),
    draft: BookBuilderDraftV1Schema,
    createdAt: z.iso.datetime({ offset: true }),
  }).nullable(),
});
export const UpdateBookContextDraftRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedRevision: z.int().nonnegative(),
  draft: BookBuilderDraftV1Schema,
});
export const BuilderPackCommandRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedRevision: z.int().nonnegative(),
});
export const PublishBookContextPackRequestSchema =
  BuilderPackCommandRequestSchema.extend({
    acknowledgedWarnings: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(100),
  });
export const RetireBookContextPackRequestSchema =
  BuilderPackCommandRequestSchema.extend({
    reason: z.string().trim().min(1).max(500),
  });
export const RetryBookBuilderRunRequestSchema = z.strictObject({
  commandId: z.uuid(),
});
export const RetryBookBuilderRunResponseSchema = BuilderRunSchema.extend({
  jobId: z.uuid(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});
export const RegenerateBookContextRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedRevision: z.int().nonnegative(),
  scope: z.enum(["FULL", "ITEM"]),
  targetItemId: z.uuid().nullable(),
}).superRefine((value, context) => {
  if ((value.scope === "ITEM") !== (value.targetItemId !== null)) {
    context.addIssue({
      code: "custom",
      message: "ITEM scope requires targetItemId and FULL scope forbids it",
      path: ["targetItemId"],
    });
  }
});
export const RegenerateBookContextResponseSchema = z.strictObject({
  run: BuilderRunSchema,
  jobId: z.uuid(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});
export const ProposalCommandRequestSchema = z.strictObject({
  commandId: z.uuid(),
  expectedRevision: z.int().nonnegative(),
});
export const AdminPackCommandResponseSchema = z.strictObject({
  packVersionId: z.uuid(),
  status: AdminPackStatusSchema,
  revision: z.int().nonnegative(),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});

export type CreateBookContextPackRequest = z.infer<typeof CreateBookContextPackRequestSchema>;
export type CreateBookContextPackResponse = z.infer<typeof CreateBookContextPackResponseSchema>;
export type AdminBookContextPackSummary = z.infer<typeof AdminBookContextPackSummarySchema>;
export type AdminBookContextPackListResponse = z.infer<typeof AdminBookContextPackListResponseSchema>;
export type AdminBookContextPackSnapshot = z.infer<typeof AdminBookContextPackSnapshotSchema>;
export type UpdateBookContextDraftRequest = z.infer<typeof UpdateBookContextDraftRequestSchema>;
export type BuilderPackCommandRequest = z.infer<typeof BuilderPackCommandRequestSchema>;
export type PublishBookContextPackRequest = z.infer<typeof PublishBookContextPackRequestSchema>;
export type RetireBookContextPackRequest = z.infer<typeof RetireBookContextPackRequestSchema>;
export type RetryBookBuilderRunRequest = z.infer<typeof RetryBookBuilderRunRequestSchema>;
export type RetryBookBuilderRunResponse = z.infer<typeof RetryBookBuilderRunResponseSchema>;
export type RegenerateBookContextRequest = z.infer<typeof RegenerateBookContextRequestSchema>;
export type RegenerateBookContextResponse = z.infer<typeof RegenerateBookContextResponseSchema>;
export type ProposalCommandRequest = z.infer<typeof ProposalCommandRequestSchema>;
export type AdminPackCommandResponse = z.infer<typeof AdminPackCommandResponseSchema>;
