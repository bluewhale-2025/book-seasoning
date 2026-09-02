import { describe, expect, it, vi } from "vitest";

import { HttpBookBuilderAdminApi } from "./book-builder-admin-api";
import { AuthenticatedHttpClient } from "./http-client";

const packVersionId = "a1000000-0000-4000-8000-000000000001";
const runId = "a1000000-0000-4000-8000-000000000002";
const serverTime = "2026-09-02T10:00:00.000Z";
const run = {
  runId,
  packVersionId,
  stage: "IDENTIFY_BOOK",
  status: "PENDING",
  completedStageCount: 0,
  errorCode: null,
  updatedAt: serverTime,
  scope: "INITIAL",
  targetItemId: null,
};

function createApi(fetcher: typeof fetch) {
  return new HttpBookBuilderAdminApi(new AuthenticatedHttpClient({
    apiBaseUrl: "http://api.test",
    getAccessToken: async () => "token",
    fetcher,
  }));
}

describe("HttpBookBuilderAdminApi", () => {
  it("searches the external book catalog through the server", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      query: "데미안",
      page: 1,
      isEnd: true,
      results: [{
        provider: "KAKAO",
        externalBookId: "isbn13:9788937460449",
        title: "데미안",
        authors: ["헤르만 헤세"],
        translators: ["전영애"],
        publisher: "민음사",
        publishedDate: "2000-12-20",
        isbn10: "8937460440",
        isbn13: "9788937460449",
        thumbnailUrl: "https://example.test/demian.jpg",
        description: "자기 자신에게 이르는 길",
        detailUrl: "https://example.test/demian",
        selectionProof: "opaque.selection-proof",
      }],
    }), { status: 200 }));
    const api = createApi(fetcher);

    await expect(api.searchBooks("데미안")).resolves.toMatchObject({ query: "데미안" });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/admin/book-context/books/search?q=%EB%8D%B0%EB%AF%B8%EC%95%88&page=1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("creates a Pack with the public admin contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packVersionId, status: "DRAFT", revision: 0, run, outcome: "CREATED", duplicate: false, serverTime }), { status: 201 }));
    const api = createApi(fetcher);

    await expect(api.createPack({ commandId: "a1000000-0000-4000-8000-000000000003", selectionProof: "opaque.selection-proof" })).resolves.toMatchObject({ packVersionId, status: "DRAFT" });
    expect(fetcher).toHaveBeenCalledWith("http://api.test/v1/admin/book-context/packs", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ commandId: "a1000000-0000-4000-8000-000000000003", selectionProof: "opaque.selection-proof" }),
    }));
  });

  it("uses the current revision for lifecycle commands", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ packVersionId, status: "REVIEW", revision: 4, duplicate: false, serverTime }), { status: 200 }));
    const api = createApi(fetcher);
    await api.requestReview(packVersionId, { commandId: "a1000000-0000-4000-8000-000000000004", expectedRevision: 3, acknowledgedWarnings: [] });
    expect(fetcher).toHaveBeenCalledWith(`http://api.test/v1/admin/book-context/packs/${packVersionId}/review`, expect.objectContaining({ method: "POST", body: expect.stringContaining('"expectedRevision":3') }));
  });
});
