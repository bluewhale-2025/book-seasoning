import { z } from "zod";

import {
  BookContextEvidenceRelationSchema,
  BookContextEvidenceStateSchema,
  BookContextItemKindSchema,
  BookContextItemLinkTypeSchema,
  BookContextReviewStatusSchema,
  BookContextSectionCodeSchema,
  BookContextSectionCoverageSchema,
  BookContextSourceTierSchema,
} from "./book-context.js";

export const BookBuilderStageSchema = z.enum([
  "IDENTIFY_BOOK",
  "DISCOVER_SOURCES",
  "CAPTURE_SOURCE_METADATA",
  "EXTRACT_CLAIMS",
  "CROSS_VALIDATE",
  "BUILD_SECTIONS",
  "VALIDATE_DRAFT",
]);
export const BookBuilderScopeSchema = z.enum(["INITIAL", "FULL", "ITEM"]);

export const BookBuilderResearchV1Schema = z.strictObject({
  schemaVersion: z.literal("book-builder-research.v1"),
  book: z.strictObject({
    title: z.string().trim().min(1).max(300),
    author: z.string().trim().min(1).max(200),
    publisher: z.string().trim().min(1).max(200).nullable(),
    publicationYear: z.int().min(1).max(9999).nullable(),
    genre: z.string().trim().min(1).max(120).nullable(),
    edition: z.string().trim().min(1).max(200).nullable(),
    translator: z.string().trim().min(1).max(200).nullable(),
    isbn: z.string().trim().min(1).max(40).nullable(),
    identityNote: z.string().trim().min(1).max(1000).nullable(),
  }),
  sources: z.array(z.strictObject({
    sourceId: z.uuid(),
    tier: BookContextSourceTierSchema,
    sourceType: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(500),
    authorOrPublisher: z.string().trim().min(1).max(300).nullable(),
    url: z.url().nullable(),
    bibliographicLocator: z.string().trim().min(1).max(500).nullable(),
    publishedAt: z.iso.datetime({ offset: true }).nullable(),
    researchedAt: z.iso.datetime({ offset: true }),
    unavailableAt: z.iso.datetime({ offset: true }).nullable(),
    usageNote: z.string().trim().min(1).max(1000).nullable(),
    rightsNote: z.string().trim().min(1).max(1000).nullable(),
  })).max(30),
  claims: z.array(z.strictObject({
    claimId: z.uuid(),
    suggestedSection: BookContextSectionCodeSchema,
    kind: BookContextItemKindSchema,
    title: z.string().trim().min(1).max(300),
    content: z.string().trim().min(1).max(3000),
    bookLocator: z.string().trim().min(1).max(500).nullable(),
    evidenceState: BookContextEvidenceStateSchema,
    evidence: z.array(z.strictObject({
      sourceId: z.uuid(),
      relation: BookContextEvidenceRelationSchema,
      evidenceLocator: z.string().trim().min(1).max(1000),
      crossValidationGroup: z.string().trim().min(1).max(200).nullable(),
    })).max(10),
  })).max(80),
});

const requiredSectionCodes = BookContextSectionCodeSchema.options;

export const BookBuilderDraftV1Schema = z.strictObject({
  schemaVersion: z.literal("book-builder-draft.v1"),
  shortDescription: z.string().trim().min(1).max(1000),
  book: BookBuilderResearchV1Schema.shape.book,
  sections: z.array(z.strictObject({
    sectionId: z.uuid(),
    code: BookContextSectionCodeSchema,
    displayOrder: z.int().nonnegative(),
    coverage: BookContextSectionCoverageSchema,
    reviewStatus: BookContextReviewStatusSchema,
    items: z.array(z.strictObject({
      itemId: z.uuid(),
      displayOrder: z.int().nonnegative(),
      kind: BookContextItemKindSchema,
      title: z.string().trim().min(1).max(300),
      content: z.string().trim().min(1).max(3000),
      bookLocator: z.string().trim().min(1).max(500).nullable(),
      evidenceState: BookContextEvidenceStateSchema,
      reviewStatus: BookContextReviewStatusSchema,
    })).max(80),
  })).length(7),
  sources: BookBuilderResearchV1Schema.shape.sources,
  itemLinks: z.array(z.strictObject({
    fromItemId: z.uuid(),
    toItemId: z.uuid(),
    relation: BookContextItemLinkTypeSchema,
  })).max(300),
  itemSources: z.array(z.strictObject({
    itemId: z.uuid(),
    sourceId: z.uuid(),
    relation: BookContextEvidenceRelationSchema,
    evidenceLocator: z.string().trim().min(1).max(1000),
    crossValidationGroup: z.string().trim().min(1).max(200).nullable(),
  })).max(300),
}).superRefine((draft, context) => {
  const sectionCodes = new Set(draft.sections.map((section) => section.code));
  for (const code of requiredSectionCodes) {
    if (!sectionCodes.has(code)) {
      context.addIssue({
        code: "custom",
        message: `missing section ${code}`,
        path: ["sections"],
      });
    }
  }

  const itemIds = new Set<string>();
  for (const [sectionIndex, section] of draft.sections.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      if (itemIds.has(item.itemId)) {
        context.addIssue({
          code: "custom",
          message: "itemId must be unique inside a draft",
          path: ["sections", sectionIndex, "items", itemIndex, "itemId"],
        });
      }
      itemIds.add(item.itemId);
    }
  }
  const sourceIds = new Set(draft.sources.map((source) => source.sourceId));
  for (const [index, link] of draft.itemLinks.entries()) {
    if (
      link.fromItemId === link.toItemId ||
      !itemIds.has(link.fromItemId) ||
      !itemIds.has(link.toItemId)
    ) {
      context.addIssue({
        code: "custom",
        message: "item link must reference two different draft items",
        path: ["itemLinks", index],
      });
    }
  }
  for (const [index, evidence] of draft.itemSources.entries()) {
    if (!itemIds.has(evidence.itemId) || !sourceIds.has(evidence.sourceId)) {
      context.addIssue({
        code: "custom",
        message: "item evidence must reference a draft item and source",
        path: ["itemSources", index],
      });
    }
  }
});

export const BookBuilderJobEnvelopeV1Schema = z.strictObject({
  schemaVersion: z.literal("book-builder-job.v1"),
  jobId: z.uuid(),
  runId: z.uuid(),
  packVersionId: z.uuid(),
  stage: BookBuilderStageSchema,
  generationNo: z.int().positive(),
  expectedRevision: z.int().nonnegative(),
});

export const BookBuilderInputV1Schema = z.strictObject({
  jobId: z.uuid(),
  runId: z.uuid(),
  packVersionId: z.uuid(),
  stage: BookBuilderStageSchema,
  expectedRevision: z.int().nonnegative(),
  scope: BookBuilderScopeSchema,
  targetItemId: z.uuid().nullable(),
  draft: BookBuilderDraftV1Schema,
  artifacts: z.array(z.record(z.string(), z.unknown())).max(7),
});

export type BookBuilderStage = z.infer<typeof BookBuilderStageSchema>;
export type BookBuilderResearchV1 = z.infer<typeof BookBuilderResearchV1Schema>;
export type BookBuilderDraftV1 = z.infer<typeof BookBuilderDraftV1Schema>;
export type BookBuilderJobEnvelopeV1 = z.infer<typeof BookBuilderJobEnvelopeV1Schema>;
export type BookBuilderInputV1 = z.infer<typeof BookBuilderInputV1Schema>;
export type BookBuilderScope = z.infer<typeof BookBuilderScopeSchema>;
