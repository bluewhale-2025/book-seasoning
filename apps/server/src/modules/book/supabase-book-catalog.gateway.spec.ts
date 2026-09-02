import { describe, expect, it } from "vitest";

import { mapBookCatalogRow } from "./supabase-book-catalog.gateway.js";

describe("mapBookCatalogRow", () => {
  it("maps an allow-listed catalog row to the public contract", () => {
    expect(
      mapBookCatalogRow({
        pack_version_id: "22000000-0000-4000-8000-000000000001",
        book_id: "21000000-0000-4000-8000-000000000001",
        title: "공개된 책",
        author: "공개 작가",
        publisher: "양념 출판사",
        publication_year: 2026,
        cover_url: null,
        short_description: "공개된 소개",
        pack_version: 1,
        published_at: "2026-09-01T00:00:00+00:00",
      }),
    ).toMatchObject({
      title: "공개된 책",
      packVersion: 1,
      publishedAt: "2026-09-01T00:00:00.000Z",
    });
  });

  it("rejects storage-only fields before publication", () => {
    expect(() =>
      mapBookCatalogRow({
        pack_version_id: "22000000-0000-4000-8000-000000000001",
        book_id: "21000000-0000-4000-8000-000000000001",
        title: "초안",
        author: "작가",
        publisher: "출판사",
        publication_year: 2026,
        cover_url: null,
        short_description: "소개",
        pack_version: 1,
        published_at: "2026-09-01T00:00:00+00:00",
        status: "DRAFT",
      }),
    ).toThrow();
  });
});
