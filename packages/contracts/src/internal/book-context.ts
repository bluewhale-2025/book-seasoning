import { z } from "zod";

export const BookContextSchemaVersionSchema = z.literal("1");

export const BookContextPackStatusSchema = z.enum(["PUBLISHED", "RETIRED"]);

export const BookContextSectionCodeSchema = z.enum([
  "METADATA",
  "STRUCTURE",
  "THEMES",
  "ENTITIES",
  "SCENES_AND_CLAIMS",
  "DISCUSSION_ISSUES",
  "INTERPRETATION_CAUTIONS",
]);

export const BookContextSectionCoverageSchema = z.enum([
  "MISSING",
  "PARTIAL",
  "READY",
]);

export const BookContextReviewStatusSchema = z.enum([
  "UNREVIEWED",
  "REVIEWED",
]);

export const BookContextItemKindSchema = z.enum([
  "FACT",
  "AUTHOR_STATEMENT",
  "INTERPRETATION",
  "DISCUSSION_SIGNAL",
]);

export const BookContextEvidenceStateSchema = z.enum([
  "SUPPORTED",
  "LIMITED",
  "CONFLICT",
  "INSUFFICIENT",
]);

export const BookContextSourceTierSchema = z.enum(["A", "B", "C", "D", "E"]);

export const BookContextEvidenceRelationSchema = z.enum([
  "SUPPORTS",
  "CONTRADICTS",
  "CONTEXT_ONLY",
]);

export const BookContextItemLinkTypeSchema = z.enum([
  "RELATED_TO",
  "SUPPORTS",
  "CONTRASTS",
  "LOCATED_IN",
]);

export const BookContextBookIdentitySchema = z.strictObject({
  bookId: z.uuid(),
  title: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().min(1),
  publicationYear: z.int().min(1).max(9999),
  genre: z.string().min(1).nullable(),
  edition: z.string().min(1).nullable(),
  translator: z.string().min(1).nullable(),
  isbn: z.string().min(1).nullable(),
  coverUrl: z.url().nullable(),
  identityNote: z.string().min(1).nullable(),
});

export const BookContextItemSchema = z.strictObject({
  itemId: z.uuid(),
  sectionCode: BookContextSectionCodeSchema,
  displayOrder: z.int().nonnegative(),
  kind: BookContextItemKindSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  bookLocator: z.string().min(1).nullable(),
  evidenceState: BookContextEvidenceStateSchema,
  reviewStatus: BookContextReviewStatusSchema,
});

export const BookContextSectionSchema = z.strictObject({
  sectionId: z.uuid(),
  code: BookContextSectionCodeSchema,
  displayOrder: z.int().nonnegative(),
  coverage: BookContextSectionCoverageSchema,
  reviewStatus: BookContextReviewStatusSchema,
  items: z.array(BookContextItemSchema),
});

export const BookContextItemLinkSchema = z.strictObject({
  fromItemId: z.uuid(),
  toItemId: z.uuid(),
  relation: BookContextItemLinkTypeSchema,
});

export const BookContextSourceSchema = z.strictObject({
  sourceId: z.uuid(),
  tier: BookContextSourceTierSchema,
  sourceType: z.string().min(1),
  title: z.string().min(1),
  authorOrPublisher: z.string().min(1).nullable(),
  url: z.url().nullable(),
  bibliographicLocator: z.string().min(1).nullable(),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  researchedAt: z.iso.datetime({ offset: true }),
  unavailableAt: z.iso.datetime({ offset: true }).nullable(),
  usageNote: z.string().min(1).nullable(),
  rightsNote: z.string().min(1).nullable(),
});

export const BookContextItemSourceSchema = z.strictObject({
  itemId: z.uuid(),
  sourceId: z.uuid(),
  relation: BookContextEvidenceRelationSchema,
  evidenceLocator: z.string().min(1),
  crossValidationGroup: z.string().min(1).nullable(),
});

const requiredSectionCodes = BookContextSectionCodeSchema.options;

export const BookContextDocumentV1Schema = z
  .strictObject({
    schemaVersion: BookContextSchemaVersionSchema,
    packVersionId: z.uuid(),
    packVersion: z.int().positive(),
    status: BookContextPackStatusSchema,
    checksum: z.string().min(1).nullable(),
    publishedAt: z.iso.datetime({ offset: true }),
    retiredAt: z.iso.datetime({ offset: true }).nullable(),
    book: BookContextBookIdentitySchema,
    sections: z.array(BookContextSectionSchema).length(requiredSectionCodes.length),
    itemLinks: z.array(BookContextItemLinkSchema),
    sources: z.array(BookContextSourceSchema),
    itemSources: z.array(BookContextItemSourceSchema),
  })
  .superRefine((document, context) => {
    const sectionCodes = new Set(document.sections.map((section) => section.code));
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
    for (const [sectionIndex, section] of document.sections.entries()) {
      for (const [itemIndex, item] of section.items.entries()) {
        if (item.sectionCode !== section.code) {
          context.addIssue({
            code: "custom",
            message: "item sectionCode must match its containing section",
            path: ["sections", sectionIndex, "items", itemIndex, "sectionCode"],
          });
        }
        if (itemIds.has(item.itemId)) {
          context.addIssue({
            code: "custom",
            message: "itemId must be unique inside a pack version",
            path: ["sections", sectionIndex, "items", itemIndex, "itemId"],
          });
        }
        itemIds.add(item.itemId);
      }
    }

    const sourceIds = new Set(document.sources.map((source) => source.sourceId));
    for (const [index, link] of document.itemLinks.entries()) {
      if (!itemIds.has(link.fromItemId) || !itemIds.has(link.toItemId)) {
        context.addIssue({
          code: "custom",
          message: "item link must reference items in the same pack version",
          path: ["itemLinks", index],
        });
      }
    }
    for (const [index, evidence] of document.itemSources.entries()) {
      if (!itemIds.has(evidence.itemId) || !sourceIds.has(evidence.sourceId)) {
        context.addIssue({
          code: "custom",
          message: "item evidence must reference an item and source in the document",
          path: ["itemSources", index],
        });
      }
    }
  });

export type BookContextSectionCode = z.infer<typeof BookContextSectionCodeSchema>;
export type BookContextItem = z.infer<typeof BookContextItemSchema>;
export type BookContextDocumentV1 = z.infer<typeof BookContextDocumentV1Schema>;
