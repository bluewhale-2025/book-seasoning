import { Inject, Injectable } from "@nestjs/common";

import {
  BookContextDocumentV1Schema,
  type BookContextDocumentV1,
} from "@bookseasoning/contracts/internal";

import {
  BOOK_CONTEXT_GATEWAY,
  type BookContextGateway,
} from "./book-context.gateway.js";
import type {
  BookContextProvider,
  GetBookContextInput,
} from "./book-context.provider.js";

@Injectable()
export class BookContextService implements BookContextProvider {
  public constructor(
    @Inject(BOOK_CONTEXT_GATEWAY)
    private readonly gateway: BookContextGateway,
  ) {}

  public async getPackVersion(
    input: GetBookContextInput,
  ): Promise<BookContextDocumentV1> {
    const document = await this.gateway.loadPackVersion(input.packVersionId);
    const allowedSections = new Set(
      input.sectionAllowList ?? document.sections.map((section) => section.code),
    );
    const allowedItems = input.itemIds === undefined ? undefined : new Set(input.itemIds);
    const normalizedQuery = input.query?.trim().toLocaleLowerCase("ko-KR");
    let remainingItems = Math.max(0, input.maxItems);
    const includedItemIds = new Set<string>();

    const sections = document.sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const queryMatches =
          normalizedQuery === undefined ||
          normalizedQuery.length === 0 ||
          item.title.toLocaleLowerCase("ko-KR").includes(normalizedQuery) ||
          item.content.toLocaleLowerCase("ko-KR").includes(normalizedQuery);
        const include =
          remainingItems > 0 &&
          allowedSections.has(section.code) &&
          (allowedItems === undefined || allowedItems.has(item.itemId)) &&
          queryMatches;

        if (include) {
          remainingItems -= 1;
          includedItemIds.add(item.itemId);
        }
        return include;
      }),
    }));
    const sourceIds = new Set(
      document.itemSources
        .filter((evidence) => includedItemIds.has(evidence.itemId))
        .map((evidence) => evidence.sourceId),
    );

    return BookContextDocumentV1Schema.parse({
      ...document,
      sections,
      itemLinks: document.itemLinks.filter(
        (link) =>
          includedItemIds.has(link.fromItemId) && includedItemIds.has(link.toItemId),
      ),
      sources: document.sources.filter((source) => sourceIds.has(source.sourceId)),
      itemSources: document.itemSources.filter((evidence) =>
        includedItemIds.has(evidence.itemId),
      ),
    });
  }
}

