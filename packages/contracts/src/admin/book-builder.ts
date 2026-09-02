import { z } from "zod";

import {
  BookBuilderDraftV1Schema,
  BookBuilderScopeSchema,
  BookBuilderStageSchema,
} from "../internal/book-builder.js";

const UtcServerTimeSchema = z.preprocess(
  (value) =>
    typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
      ? `${value}Z`
      : value,
  z.iso.datetime({ offset: true }),
);

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

export const BookCatalogSearchProviderSchema = z.literal("KAKAO");
export const AdminBookSelectionSchema = z.strictObject({
  provider: BookCatalogSearchProviderSchema,
  externalBookId: z.string().trim().min(1).max(1000),
  title: z.string().trim().min(1).max(300),
  authors: z.array(z.string().trim().min(1).max(200)).min(1).max(20),
  translators: z.array(z.string().trim().min(1).max(200)).max(20),
  publisher: z.string().trim().min(1).max(200).nullable(),
  publishedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isbn10: z.string().regex(/^\d{9}[\dX]$/).nullable(),
  isbn13: z.string().regex(/^\d{13}$/).nullable(),
  thumbnailUrl: z.url().nullable(),
  description: z.string().trim().min(1).max(1000).nullable(),
  detailUrl: z.url().nullable(),
});
export const AdminBookSearchResultSchema = AdminBookSelectionSchema.extend({
  selectionProof: z.string().min(1).max(12_000),
});
export const AdminBookSearchResponseSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  page: z.int().min(1).max(50),
  isEnd: z.boolean(),
  results: z.array(AdminBookSearchResultSchema).max(20),
});
export const AdminBookSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  page: z.coerce.number().int().min(1).max(50).default(1),
});
export const CreateBookContextPackRequestSchema = z.strictObject({
  commandId: z.uuid(),
  selectionProof: z.string().min(1).max(12_000),
});
export const CreateBookContextPackResponseSchema = z.strictObject({
  packVersionId: z.uuid(),
  status: AdminPackStatusSchema,
  revision: z.int().nonnegative(),
  run: BuilderRunSchema.nullable(),
  outcome: z.enum(["CREATED", "EXISTING"]),
  duplicate: z.boolean(),
  serverTime: UtcServerTimeSchema,
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
export const CompleteBookContextReviewRequestSchema =
  BuilderPackCommandRequestSchema.extend({
    acknowledgedWarnings: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).max(100),
  });
export const PublishBookContextPackRequestSchema = BuilderPackCommandRequestSchema;
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
  serverTime: UtcServerTimeSchema,
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
  serverTime: UtcServerTimeSchema,
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
  serverTime: UtcServerTimeSchema,
});

export type CreateBookContextPackRequest = z.infer<typeof CreateBookContextPackRequestSchema>;
export type CreateBookContextPackResponse = z.infer<typeof CreateBookContextPackResponseSchema>;
export type AdminBookSelection = z.infer<typeof AdminBookSelectionSchema>;
export type AdminBookSearchResult = z.infer<typeof AdminBookSearchResultSchema>;
export type AdminBookSearchResponse = z.infer<typeof AdminBookSearchResponseSchema>;
export type AdminBookSearchQuery = z.infer<typeof AdminBookSearchQuerySchema>;
export type AdminBookContextPackSummary = z.infer<typeof AdminBookContextPackSummarySchema>;
export type AdminBookContextPackListResponse = z.infer<typeof AdminBookContextPackListResponseSchema>;
export type AdminBookContextPackSnapshot = z.infer<typeof AdminBookContextPackSnapshotSchema>;
export type UpdateBookContextDraftRequest = z.infer<typeof UpdateBookContextDraftRequestSchema>;
export type BuilderPackCommandRequest = z.infer<typeof BuilderPackCommandRequestSchema>;
export type CompleteBookContextReviewRequest = z.infer<typeof CompleteBookContextReviewRequestSchema>;
export type PublishBookContextPackRequest = z.infer<typeof PublishBookContextPackRequestSchema>;
export type RetireBookContextPackRequest = z.infer<typeof RetireBookContextPackRequestSchema>;
export type RetryBookBuilderRunRequest = z.infer<typeof RetryBookBuilderRunRequestSchema>;
export type RetryBookBuilderRunResponse = z.infer<typeof RetryBookBuilderRunResponseSchema>;
export type RegenerateBookContextRequest = z.infer<typeof RegenerateBookContextRequestSchema>;
export type RegenerateBookContextResponse = z.infer<typeof RegenerateBookContextResponseSchema>;
export type ProposalCommandRequest = z.infer<typeof ProposalCommandRequestSchema>;
export type AdminPackCommandResponse = z.infer<typeof AdminPackCommandResponseSchema>;
