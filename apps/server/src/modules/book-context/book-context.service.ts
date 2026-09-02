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

const QUERY_TOKEN_LIMIT = 40;
const MAX_ITEMS_PER_SECTION_BEFORE_FILL = 3;
const KOREAN_PARTICLE_PATTERN =
  /(으로|에서|에게|한테|처럼|보다|까지|부터|은|는|이|가|을|를|의|에|로|와|과|도|만)$/u;
const QUERY_STOP_WORDS = new Set([
  "그리고",
  "그러나",
  "그래서",
  "대한",
  "대해",
  "어떻게",
  "무엇",
  "같아요",
  "있어요",
  "합니다",
  "했다",
  "하는",
  "있는",
  "없는",
  "생각",
  "관점",
  "질문",
]);

type BookContextItem = BookContextDocumentV1["sections"][number]["items"][number];

type RankedItem = Readonly<{
  item: BookContextItem;
  sectionIndex: number;
  itemIndex: number;
  score: number;
}>;

const normalizedText = (value: string): string =>
  value.normalize("NFKC").toLocaleLowerCase("ko-KR");

const queryTokens = (query: string | undefined): string[] => {
  if (query === undefined) return [];
  const unique = new Set<string>();
  for (const raw of normalizedText(query).match(/[\p{L}\p{N}]+/gu) ?? []) {
    const withoutParticle = raw.replace(KOREAN_PARTICLE_PATTERN, "");
    const token = withoutParticle.length >= 2 ? withoutParticle : raw;
    if (token.length < 2 || QUERY_STOP_WORDS.has(token)) continue;
    unique.add(token);
    if (unique.size >= QUERY_TOKEN_LIMIT) break;
  }
  return [...unique];
};

const sectionWeight = (sectionCode: BookContextItem["sectionCode"]): number => {
  switch (sectionCode) {
    case "DISCUSSION_ISSUES":
      return 5;
    case "SCENES_AND_CLAIMS":
    case "THEMES":
      return 4;
    case "INTERPRETATION_CAUTIONS":
      return 3;
    case "ENTITIES":
      return 2;
    case "STRUCTURE":
      return 1;
    case "METADATA":
      return 0;
  }
};

const relevanceScore = (
  item: BookContextItem,
  tokens: readonly string[],
  preferredItemIds: ReadonlySet<string>,
): number => {
  let score = preferredItemIds.has(item.itemId) ? 10_000 : 0;
  const title = normalizedText(item.title);
  const content = normalizedText(item.content);
  const locator = normalizedText(item.bookLocator ?? "");
  for (const token of tokens) {
    if (title.includes(token)) score += 12;
    if (content.includes(token)) score += 4;
    if (locator.includes(token)) score += 2;
  }
  return score + sectionWeight(item.sectionCode);
};

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
    const preferredItemIds = new Set(input.preferredItemIds ?? []);
    const tokens = queryTokens(input.query);
    const budget = Math.max(0, input.maxItems);
    const ranked = document.sections.flatMap((section, sectionIndex) =>
      section.items
        .map((item, itemIndex): RankedItem => ({
          item,
          sectionIndex,
          itemIndex,
          score: relevanceScore(item, tokens, preferredItemIds),
        }))
        .filter(
          ({ item }) =>
            allowedSections.has(section.code) &&
            (allowedItems === undefined || allowedItems.has(item.itemId)),
        ),
    );
    ranked.sort(
      (left, right) =>
        right.score - left.score ||
        left.sectionIndex - right.sectionIndex ||
        left.itemIndex - right.itemIndex,
    );

    const selected = new Set<string>();
    const sectionCounts = new Map<string, number>();
    for (const candidate of ranked) {
      if (selected.size >= budget) break;
      const sectionCount = sectionCounts.get(candidate.item.sectionCode) ?? 0;
      if (sectionCount >= MAX_ITEMS_PER_SECTION_BEFORE_FILL) continue;
      selected.add(candidate.item.itemId);
      sectionCounts.set(candidate.item.sectionCode, sectionCount + 1);
    }
    for (const candidate of ranked) {
      if (selected.size >= budget) break;
      selected.add(candidate.item.itemId);
    }
    const includedItemIds = new Set<string>();

    const sections = document.sections.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const include = selected.has(item.itemId);
        if (include) includedItemIds.add(item.itemId);
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
