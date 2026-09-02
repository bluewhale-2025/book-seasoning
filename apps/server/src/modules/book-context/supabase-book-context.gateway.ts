import {
  BookContextDocumentV1Schema,
  type BookContextDocumentV1,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { createSecretSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { BookContextGateway } from "./book-context.gateway.js";

export function mapBookContextDocument(value: unknown): BookContextDocumentV1 {
  return BookContextDocumentV1Schema.parse(value);
}

export class SupabaseBookContextGateway implements BookContextGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async loadPackVersion(packVersionId: string): Promise<BookContextDocumentV1> {
    const client = createSecretSupabaseClient(this.environment);
    const { data, error } = await client.rpc("get_book_context_pack_document", {
      p_pack_version_id: packVersionId,
    });

    if (error !== null || data === null) {
      throw new Error("book_context_pack_not_found");
    }
    return mapBookContextDocument(data);
  }
}

