import type {
  BookContextDocumentV1,
  BookContextSectionCode,
} from "@bookseasoning/contracts/internal";

export type BookContextConsumer =
  | "EVALUATOR"
  | "HOST"
  | "OPENING"
  | "FINAL_RECORD";

export type GetBookContextInput = Readonly<{
  packVersionId: string;
  consumer: BookContextConsumer;
  sectionAllowList?: readonly BookContextSectionCode[];
  itemIds?: readonly string[];
  query?: string;
  maxItems: number;
}>;

export interface BookContextProvider {
  getPackVersion(input: GetBookContextInput): Promise<BookContextDocumentV1>;
}

export const BOOK_CONTEXT_PROVIDER = Symbol("BOOK_CONTEXT_PROVIDER");

