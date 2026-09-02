import { useQuery } from "@tanstack/react-query";
import type { BookCatalogQuery } from "@bookseasoning/contracts/public";

import { useAppRuntime } from "../../app/app-runtime";

export const bookCatalogQueryKey = (query: BookCatalogQuery) =>
  ["books", "catalog", query] as const;

export function useBookCatalogQuery(query: BookCatalogQuery, enabled = true) {
  const { books } = useAppRuntime();
  return useQuery({
    queryKey: bookCatalogQueryKey(query),
    queryFn: () => books.getCatalog(query),
    enabled,
  });
}
