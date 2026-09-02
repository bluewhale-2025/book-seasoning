import { describe, expect, it } from "vitest";

import {
  bookBuilderDraftTask,
  bookBuilderResearchTask,
} from "./book-builder.tasks.js";

describe("book builder tasks", () => {
  it("keeps web research bounded for the worker request budget", () => {
    expect(bookBuilderResearchTask).toMatchObject({
      webSearch: true,
      reasoningEffort: "low",
      maxOutputTokens: 9_000,
    });

    const result = bookBuilderResearchTask.outputSchema.safeParse({
      schemaVersion: "book-builder-research.v1",
      book: {
        title: "책",
        author: "저자",
        publisher: null,
        publicationYear: null,
        genre: null,
        edition: null,
        translator: null,
        isbn: null,
        identityNote: null,
      },
      sources: Array.from({ length: 9 }, (_, index) => ({
        sourceId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        tier: "A",
        sourceType: "publisher",
        title: `출처 ${index}`,
        authorOrPublisher: null,
        url: null,
        bibliographicLocator: null,
        publishedAt: null,
        researchedAt: "2026-09-02T00:00:00.000Z",
        unavailableAt: null,
        usageNote: null,
        rightsNote: null,
      })),
      claims: [],
    });

    expect(result.success).toBe(false);
  });

  it("bounds draft generation separately from research", () => {
    expect(bookBuilderDraftTask).toMatchObject({
      reasoningEffort: "low",
      maxOutputTokens: 12_000,
    });
  });
});
