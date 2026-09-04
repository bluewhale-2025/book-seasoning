import { z } from "zod";

import {
  BookCatalogItemSchema,
  type BookCatalogItem,
  type BookCatalogQuery,
} from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { rethrowSupabaseDependencyError } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { BookCatalogGateway } from "./book-catalog.gateway.js";

const BookCatalogRowSchema = z.strictObject({
  pack_version_id: z.uuid(),
  book_id: z.uuid(),
  title: z.string().min(1),
  author: z.string().min(1),
  publisher: z.string().min(1),
  publication_year: z.int().min(1).max(9999),
  cover_url: z.string().nullable(),
  short_description: z.string().min(1),
  pack_version: z.int().positive(),
  published_at: z.iso.datetime({ offset: true }),
});

export function mapBookCatalogRow(row: unknown): BookCatalogItem {
  const parsed = BookCatalogRowSchema.parse(row);
  return BookCatalogItemSchema.parse({
    packVersionId: parsed.pack_version_id,
    bookId: parsed.book_id,
    title: parsed.title,
    author: parsed.author,
    publisher: parsed.publisher,
    publicationYear: parsed.publication_year,
    coverUrl: parsed.cover_url,
    shortDescription: parsed.short_description,
    packVersion: parsed.pack_version,
    publishedAt: new Date(parsed.published_at).toISOString(),
  });
}

export class SupabaseBookCatalogGateway implements BookCatalogGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async search(
    actor: AuthenticatedActor,
    query: BookCatalogQuery,
  ): Promise<readonly BookCatalogItem[]> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("search_published_book_catalog", {
      p_query: query.query,
      p_sort: query.sort,
      p_limit: query.limit,
    });

    if (error !== null) {
      rethrowSupabaseDependencyError(error);
      throw new Error("book_catalog_search_failed");
    }

    return z.array(BookCatalogRowSchema).parse(data).map(mapBookCatalogRow);
  }
}
