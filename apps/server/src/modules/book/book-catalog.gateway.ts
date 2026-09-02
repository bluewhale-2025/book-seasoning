import type {
  BookCatalogItem,
  BookCatalogQuery,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export interface BookCatalogGateway {
  search(
    actor: AuthenticatedActor,
    query: BookCatalogQuery,
  ): Promise<readonly BookCatalogItem[]>;
}

export const BOOK_CATALOG_GATEWAY = Symbol("BOOK_CATALOG_GATEWAY");
