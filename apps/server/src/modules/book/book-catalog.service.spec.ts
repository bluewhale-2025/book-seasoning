import { describe, expect, it, vi } from "vitest";

import type {
  BookCatalogItem,
  BookCatalogQuery,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { BookCatalogGateway } from "./book-catalog.gateway.js";
import { BookCatalogService } from "./book-catalog.service.js";

const actor: AuthenticatedActor = {
  userId: "20000000-0000-4000-8000-000000000001",
  accessToken: "private-token",
};
const query: BookCatalogQuery = { query: "작가", sort: "author", limit: 20 };
const item: BookCatalogItem = {
  packVersionId: "22000000-0000-4000-8000-000000000001",
  bookId: "21000000-0000-4000-8000-000000000001",
  title: "공개된 책",
  author: "공개 작가",
  publisher: "양념 출판사",
  publicationYear: 2026,
  coverUrl: null,
  shortDescription: "공개된 소개",
  packVersion: 1,
  publishedAt: "2026-09-01T00:00:00.000Z",
};

describe("BookCatalogService", () => {
  it("passes the actor and normalized query to the catalog gateway", async () => {
    const gateway: BookCatalogGateway = {
      search: vi.fn().mockResolvedValue([item]),
    };
    const service = new BookCatalogService(gateway);

    await expect(service.search(actor, query)).resolves.toEqual({ items: [item] });
    expect(gateway.search).toHaveBeenCalledWith(actor, query);
  });
});
