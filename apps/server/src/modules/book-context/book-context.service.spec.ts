import { describe, expect, it } from "vitest";

import { BookContextDocumentV1Fixture } from "@bookseasoning/contracts/internal";

import type { BookContextGateway } from "./book-context.gateway.js";
import { BookContextService } from "./book-context.service.js";

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
});

