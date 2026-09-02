import { describe, expect, it, vi } from "vitest";

import type { RuntimeEnvironment } from "../../config/environment.js";
import {
  BookCatalogSearchProviderError,
  KakaoBookCatalogSearchProvider,
} from "./book-catalog-search.provider.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
  kakaoRestApiKey: "kakao-test-key",
};

describe("KakaoBookCatalogSearchProvider", () => {
  it("normalizes edition-identifying metadata", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      meta: { total_count: 1, pageable_count: 1, is_end: true },
      documents: [{
        title: "데미안",
        contents: "자기 자신에게 이르는 길",
        url: "https://book.example.test/demian",
        isbn: "8937460440 9788937460449",
        datetime: "2000-12-20T00:00:00.000+09:00",
        authors: ["헤르만 헤세"],
        publisher: "민음사",
        translators: ["전영애"],
        price: 0,
        sale_price: 0,
        thumbnail: "https://book.example.test/demian.jpg",
        status: "정상판매",
      }],
    }), { status: 200 }));
    const provider = new KakaoBookCatalogSearchProvider(environment, fetcher);

    const page = await provider.search({ query: "데미안", page: 1, size: 12 });

    expect(page.results[0]).toMatchObject({
      provider: "KAKAO",
      externalBookId: "isbn13:9788937460449",
      authors: ["헤르만 헤세"],
      translators: ["전영애"],
      isbn13: "9788937460449",
      publishedDate: "2000-12-20",
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.objectContaining({ href: expect.stringContaining("query=%EB%8D%B0%EB%AF%B8%EC%95%88") }),
      expect.objectContaining({ headers: { Authorization: "KakaoAK kakao-test-key" } }),
    );
  });

  it("fails closed when the server credential is missing", async () => {
    const { kakaoRestApiKey: _omitted, ...environmentWithoutKakao } = environment;
    expect(_omitted).toBe("kakao-test-key");
    const provider = new KakaoBookCatalogSearchProvider(environmentWithoutKakao);
    await expect(provider.search({ query: "데미안", page: 1, size: 12 }))
      .rejects.toEqual(new BookCatalogSearchProviderError("BOOK_SEARCH_NOT_CONFIGURED"));
  });
});
