import { z } from "zod";

export const BookCatalogSortSchema = z.enum(["recent", "title", "author"]);

export const BookCatalogQuerySchema = z.strictObject({
  query: z.string().trim().max(200).default(""),
  sort: BookCatalogSortSchema.default("recent"),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const BookCatalogItemSchema = z.strictObject({
  packVersionId: z.uuid(),
  bookId: z.uuid(),
  title: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().min(1),
  publicationYear: z.int().min(1).max(9999),
  coverUrl: z.url().nullable(),
  shortDescription: z.string().min(1),
  packVersion: z.int().positive(),
  publishedAt: z.iso.datetime(),
});

export const BookCatalogResponseSchema = z.strictObject({
  items: z.array(BookCatalogItemSchema).max(50),
});

export type BookCatalogSort = z.infer<typeof BookCatalogSortSchema>;
export type BookCatalogQuery = z.infer<typeof BookCatalogQuerySchema>;
export type BookCatalogItem = z.infer<typeof BookCatalogItemSchema>;
export type BookCatalogResponse = z.infer<typeof BookCatalogResponseSchema>;

