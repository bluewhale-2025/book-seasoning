import { describe, expect, it } from "vitest";

import {
  BookCatalogQuerySchema,
  BookCatalogResponseSchema,
} from "./book.js";

describe("book catalog contracts", () => {
  it("normalizes defaults for a catalog query", () => {
    expect(BookCatalogQuerySchema.parse({})).toEqual({
      query: "",
      sort: "recent",
      limit: 20,
    });
  });

  it("rejects unpublished state and private fields in a public item", () => {
    expect(() =>
      BookCatalogResponseSchema.parse({
        items: [
          {
            packVersionId: "22000000-0000-4000-8000-000000000001",
            bookId: "21000000-0000-4000-8000-000000000001",
            title: "책",
            author: "작가",
            publisher: "출판사",
            publicationYear: 2026,
            coverUrl: null,
            shortDescription: "소개",
            packVersion: 1,
            publishedAt: "2026-09-01T00:00:00.000Z",
            status: "DRAFT",
          },
        ],
      }),
    ).toThrow();
  });
});

