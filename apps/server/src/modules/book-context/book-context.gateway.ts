import type { BookContextDocumentV1 } from "@bookseasoning/contracts/internal";

export interface BookContextGateway {
  loadPackVersion(packVersionId: string): Promise<BookContextDocumentV1>;
}

export const BOOK_CONTEXT_GATEWAY = Symbol("BOOK_CONTEXT_GATEWAY");

