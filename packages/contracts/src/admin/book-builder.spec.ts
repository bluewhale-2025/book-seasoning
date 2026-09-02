import { describe, expect, it } from "vitest";

import {
  AdminBookSearchResponseSchema,
  CompleteBookContextReviewRequestSchema,
  CreateBookContextPackRequestSchema,
  CreateBookContextPackResponseSchema,
} from "./book-builder.js";

describe("admin Book Context contracts", () => {
  it("accepts a normalized external book result with an opaque selection proof", () => {
    expect(AdminBookSearchResponseSchema.parse({
      query: "데미안",
      page: 1,
      isEnd: true,
      results: [{
        provider: "KAKAO",
        externalBookId: "isbn13:9788937460449",
        title: "데미안",
        authors: ["헤르만 헤세"],
        translators: ["전영애"],
        publisher: "민음사",
        publishedDate: "2000-12-20",
        isbn10: "8937460440",
        isbn13: "9788937460449",
        thumbnailUrl: "https://example.test/demian.jpg",
        description: "한 인간이 자기 자신에게 이르는 길을 그린 소설",
        detailUrl: "https://example.test/books/demian",
        selectionProof: "opaque.selection-proof",
      }],
    }).results).toHaveLength(1);
  });

  it("creates a Pack only from a server-issued selection proof", () => {
    expect(CreateBookContextPackRequestSchema.safeParse({
      commandId: "b1000000-0000-4000-8000-000000000001",
      title: "데미안",
      author: "헤르만 헤세",
    }).success).toBe(false);
    expect(CreateBookContextPackRequestSchema.safeParse({
      commandId: "b1000000-0000-4000-8000-000000000001",
      selectionProof: "opaque.selection-proof",
    }).success).toBe(true);
  });

  it("normalizes the database UTC server time before exposing it", () => {
    const parsed = CreateBookContextPackResponseSchema.parse({
      packVersionId: "b2000000-0000-4000-8000-000000000001",
      status: "DRAFT",
      revision: 0,
      run: null,
      outcome: "CREATED",
      duplicate: false,
      serverTime: "2026-09-02T16:40:35.392158",
    });

    expect(parsed.serverTime).toBe("2026-09-02T16:40:35.392158Z");
  });

  it("acknowledges attention items once when completing the whole review", () => {
    expect(CompleteBookContextReviewRequestSchema.parse({
      commandId: "b1000000-0000-4000-8000-000000000002",
      expectedRevision: 4,
      acknowledgedWarnings: ["LIMITED_OR_INSUFFICIENT_EVIDENCE"],
    }).acknowledgedWarnings).toHaveLength(1);
  });
});
