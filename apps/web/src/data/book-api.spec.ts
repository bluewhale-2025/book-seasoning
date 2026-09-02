import { describe, expect, it, vi } from "vitest";

import { HttpBookApi } from "./book-api";
import { AuthenticatedHttpClient } from "./http-client";

const catalog = {
  items: [{
    packVersionId: "91000000-0000-4000-8000-000000000001",
    bookId: "92000000-0000-4000-8000-000000000001",
    title: "채식주의자",
    author: "한강",
    publisher: "창비",
    publicationYear: 2007,
    coverUrl: null,
    shortDescription: "한 사람의 선택을 둘러싼 이야기",
    packVersion: 1,
    publishedAt: "2026-09-02T10:00:00.000Z",
  }],
};

describe("HttpBookApi", () => {
  it("serializes the parsed catalog query and validates the response", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(catalog), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const api = new HttpBookApi(new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      fetcher,
    }));

    await expect(api.getCatalog({ query: "  채식  ", sort: "title", limit: 20 })).resolves.toEqual(catalog);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/books?query=%EC%B1%84%EC%8B%9D&sort=title&limit=20",
      expect.objectContaining({ method: "GET" }),
    );
  });
});
