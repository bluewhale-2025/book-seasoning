import { describe, expect, it } from "vitest";

import {
  BookContextDocumentV1Fixture,
  type BookContextDocumentV1,
} from "@bookseasoning/contracts/internal";

import type { BookContextGateway } from "./book-context.gateway.js";
import { BookContextService } from "./book-context.service.js";

const expandedDocument = (): BookContextDocumentV1 => ({
  ...BookContextDocumentV1Fixture,
  sections: BookContextDocumentV1Fixture.sections.map((section, sectionIndex) => ({
    ...section,
    items: Array.from({ length: 5 }, (_, itemIndex) => ({
      itemId: `42${sectionIndex.toString().padStart(2, "0")}0000-0000-4000-8000-${itemIndex.toString().padStart(12, "0")}`,
      sectionCode: section.code,
      displayOrder: itemIndex,
      kind: "INTERPRETATION" as const,
      title:
        section.code === "DISCUSSION_ISSUES" && itemIndex === 4
          ? "자유와 안전의 충돌"
          : `관련 없는 항목 ${sectionIndex}-${itemIndex}`,
      content:
        section.code === "SCENES_AND_CLAIMS" && itemIndex === 3
          ? "도시의 안전을 위해 자유를 포기하는 장면"
          : "서지 정보와 주변 배경",
      bookLocator: null,
      evidenceState: "SUPPORTED" as const,
      reviewStatus: "REVIEWED" as const,
    })),
  })),
  sources: [],
  itemSources: [],
});

describe("BookContextService", () => {
  it("returns a budgeted provider document without dangling evidence", async () => {
    const gateway: BookContextGateway = {
      loadPackVersion: async () => BookContextDocumentV1Fixture,
    };
    const service = new BookContextService(gateway);

    const result = await service.getPackVersion({
      packVersionId: BookContextDocumentV1Fixture.packVersionId,
      consumer: "EVALUATOR",
      sectionAllowList: ["METADATA"],
      maxItems: 1,
    });

    expect(result.sections.flatMap((section) => section.items)).toHaveLength(1);
    expect(result.sources).toHaveLength(1);
    expect(result.itemSources).toHaveLength(1);
  });

  it("returns no sources when the item budget is zero", async () => {
    const service = new BookContextService({
      loadPackVersion: async () => BookContextDocumentV1Fixture,
    });

    const result = await service.getPackVersion({
      packVersionId: BookContextDocumentV1Fixture.packVersionId,
      consumer: "HOST",
      maxItems: 0,
    });

    expect(result.sections.flatMap((section) => section.items)).toEqual([]);
    expect(result.sources).toEqual([]);
  });

  it("ranks current-discussion matches ahead of early unrelated Pack items", async () => {
    const service = new BookContextService({
      loadPackVersion: async () => expandedDocument(),
    });

    const result = await service.getPackVersion({
      packVersionId: BookContextDocumentV1Fixture.packVersionId,
      consumer: "EVALUATOR",
      query: "도시의 안전을 위해 자유를 포기해도 되는가",
      maxItems: 8,
    });
    const items = result.sections.flatMap((section) => section.items);

    expect(items).toHaveLength(8);
    expect(items.map((item) => item.title)).toContain("자유와 안전의 충돌");
    expect(items.map((item) => item.content)).toContain(
      "도시의 안전을 위해 자유를 포기하는 장면",
    );
    expect(new Set(items.map((item) => item.sectionCode)).size).toBeGreaterThan(1);
  });

  it("keeps an existing Wiki grounding item in the bounded selection", async () => {
    const document = expandedDocument();
    const preferredItem = document.sections[0]!.items[4]!;
    const service = new BookContextService({ loadPackVersion: async () => document });

    const result = await service.getPackVersion({
      packVersionId: document.packVersionId,
      consumer: "EVALUATOR",
      preferredItemIds: [preferredItem.itemId],
      query: "자유 안전 도시",
      maxItems: 2,
    });

    expect(result.sections.flatMap((section) => section.items)).toContainEqual(
      preferredItem,
    );
  });
});
