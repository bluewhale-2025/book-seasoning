import { Inject, Injectable } from "@nestjs/common";

import {
  BookCatalogResponseSchema,
  type BookCatalogQuery,
  type BookCatalogResponse,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  BOOK_CATALOG_GATEWAY,
  type BookCatalogGateway,
} from "./book-catalog.gateway.js";

@Injectable()
export class BookCatalogService {
  public constructor(
    @Inject(BOOK_CATALOG_GATEWAY)
    private readonly gateway: BookCatalogGateway,
  ) {}

  public async search(
    actor: AuthenticatedActor,
    query: BookCatalogQuery,
  ): Promise<BookCatalogResponse> {
    return BookCatalogResponseSchema.parse({
      items: await this.gateway.search(actor, query),
    });
  }
}
