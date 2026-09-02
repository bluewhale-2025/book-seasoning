import {
  BookCatalogQuerySchema,
  BookCatalogResponseSchema,
  type BookCatalogQuery,
  type BookCatalogResponse,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedHttpClient } from "./http-client";

export type BookApi = Readonly<{
  getCatalog(query: BookCatalogQuery): Promise<BookCatalogResponse>;
}>;

export class HttpBookApi implements BookApi {
  public constructor(private readonly http: AuthenticatedHttpClient) {}

  public getCatalog(query: BookCatalogQuery): Promise<BookCatalogResponse> {
    const parsed = BookCatalogQuerySchema.parse(query);
    const parameters = new URLSearchParams({
      query: parsed.query,
      sort: parsed.sort,
      limit: String(parsed.limit),
    });
    return this.http.request(
      `/v1/books?${parameters.toString()}`,
      { method: "GET" },
      BookCatalogResponseSchema,
    );
  }
}
