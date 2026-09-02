import { z } from "zod";

import type { AdminBookSelection } from "@bookseasoning/contracts/admin";

import type { RuntimeEnvironment } from "../../config/environment.js";

export type BookCatalogSearchPage = Readonly<{
  page: number;
  isEnd: boolean;
  results: readonly AdminBookSelection[];
}>;

export interface BookCatalogSearchProvider {
  search(input: Readonly<{
    query: string;
    page: number;
    size: number;
  }>): Promise<BookCatalogSearchPage>;
}

export const BOOK_CATALOG_SEARCH_PROVIDER = Symbol("BOOK_CATALOG_SEARCH_PROVIDER");

export class BookCatalogSearchProviderError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "BookCatalogSearchProviderError";
  }
}

const KakaoBookResponseSchema = z.object({
  meta: z.object({
    is_end: z.boolean(),
  }),
  documents: z.array(z.object({
    title: z.string(),
    contents: z.string(),
    url: z.string(),
    isbn: z.string(),
    datetime: z.string(),
    authors: z.array(z.string()),
    publisher: z.string(),
    translators: z.array(z.string()),
    thumbnail: z.string(),
  })),
});

const cleanText = (value: string, max: number): string =>
  value
    .replace(/<[^>]*>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const optionalText = (value: string, max: number): string | null => {
  const normalized = cleanText(value, max);
  return normalized.length === 0 ? null : normalized;
};

const normalizeIsbn = (value: string) => {
  const identifiers = value
    .toUpperCase()
    .split(/\s+/)
    .map((candidate) => candidate.replaceAll("-", ""));
  return {
    isbn10: identifiers.find((candidate) => /^\d{9}[\dX]$/.test(candidate)) ?? null,
    isbn13: identifiers.find((candidate) => /^\d{13}$/.test(candidate)) ?? null,
  };
};

const validUrl = (value: string): string | null => {
  if (value.length === 0) return null;
  return z.url().safeParse(value).success ? value : null;
};

export class KakaoBookCatalogSearchProvider implements BookCatalogSearchProvider {
  private readonly apiKey: string | undefined;

  public constructor(
    environment: RuntimeEnvironment,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = environment.kakaoRestApiKey;
  }

  public async search(input: Readonly<{ query: string; page: number; size: number }>): Promise<BookCatalogSearchPage> {
    if (this.apiKey === undefined) {
      throw new BookCatalogSearchProviderError("BOOK_SEARCH_NOT_CONFIGURED");
    }

    const url = new URL("https://dapi.kakao.com/v3/search/book");
    url.searchParams.set("query", input.query);
    url.searchParams.set("sort", "accuracy");
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("size", String(input.size));

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { Authorization: `KakaoAK ${this.apiKey}` },
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new BookCatalogSearchProviderError("BOOK_SEARCH_UNAVAILABLE");
    }
    if (!response.ok) {
      throw new BookCatalogSearchProviderError(
        response.status === 429 ? "BOOK_SEARCH_RATE_LIMITED" : "BOOK_SEARCH_UNAVAILABLE",
      );
    }

    const parsed = KakaoBookResponseSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new BookCatalogSearchProviderError("BOOK_SEARCH_RESPONSE_INVALID");
    }

    const results = parsed.data.documents.flatMap((document): AdminBookSelection[] => {
      const title = cleanText(document.title, 300);
      const authors = document.authors.map((author) => cleanText(author, 200)).filter(Boolean).slice(0, 20);
      if (title.length === 0 || authors.length === 0) return [];
      const { isbn10, isbn13 } = normalizeIsbn(document.isbn);
      const detailUrl = validUrl(document.url);
      const externalBookId = isbn13 === null
        ? isbn10 === null
          ? detailUrl
          : `isbn10:${isbn10}`
        : `isbn13:${isbn13}`;
      if (externalBookId === null) return [];
      const date = document.datetime.slice(0, 10);
      return [{
        provider: "KAKAO",
        externalBookId,
        title,
        authors,
        translators: document.translators.map((translator) => cleanText(translator, 200)).filter(Boolean).slice(0, 20),
        publisher: optionalText(document.publisher, 200),
        publishedDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        isbn10,
        isbn13,
        thumbnailUrl: validUrl(document.thumbnail),
        description: optionalText(document.contents, 1000),
        detailUrl,
      }];
    });

    return { page: input.page, isEnd: parsed.data.meta.is_end, results };
  }
}
