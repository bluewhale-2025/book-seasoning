import type { BookContextDocumentV1 } from "./book-context.js";

const sectionIds = [
  "41000000-0000-4000-8000-000000000001",
  "41000000-0000-4000-8000-000000000002",
  "41000000-0000-4000-8000-000000000003",
  "41000000-0000-4000-8000-000000000004",
  "41000000-0000-4000-8000-000000000005",
  "41000000-0000-4000-8000-000000000006",
  "41000000-0000-4000-8000-000000000007",
] as const;

const sectionCodes = [
  "METADATA",
  "STRUCTURE",
  "THEMES",
  "ENTITIES",
  "SCENES_AND_CLAIMS",
  "DISCUSSION_ISSUES",
  "INTERPRETATION_CAUTIONS",
] as const;

export const BookContextDocumentV1Fixture = {
  schemaVersion: "1",
  packVersionId: "40000000-0000-4000-8000-000000000002",
  packVersion: 1,
  status: "PUBLISHED",
  checksum: "fixture-v1",
  publishedAt: "2026-09-01T00:00:00.000Z",
  retiredAt: null,
  book: {
    bookId: "40000000-0000-4000-8000-000000000001",
    title: "질문이 자라는 책",
    author: "책은양념",
    publisher: "책은양념 출판부",
    publicationYear: 2026,
    genre: "에세이",
    edition: "초판",
    translator: null,
    isbn: null,
    coverUrl: null,
    identityNote: "S2 contract 검증을 위한 합성 도서 fixture",
  },
  sections: sectionCodes.map((code, index) => ({
    sectionId: sectionIds[index]!,
    code,
    displayOrder: index,
    coverage: index === 0 ? "READY" : "PARTIAL",
    reviewStatus: "REVIEWED",
    items:
      index === 0
        ? [
            {
              itemId: "42000000-0000-4000-8000-000000000001",
              sectionCode: "METADATA",
              displayOrder: 0,
              kind: "FACT",
              title: "도서 식별",
              content: "이 항목은 합성 fixture임을 명시한다.",
              bookLocator: null,
              evidenceState: "SUPPORTED",
              reviewStatus: "REVIEWED",
            },
          ]
        : [],
  })),
  itemLinks: [],
  sources: [
    {
      sourceId: "43000000-0000-4000-8000-000000000001",
      tier: "A",
      sourceType: "INTERNAL_FIXTURE",
      title: "S2 Book Context contract fixture",
      authorOrPublisher: "책은양념",
      url: null,
      bibliographicLocator: "packages/contracts/src/internal/book-context.fixture.ts",
      publishedAt: null,
      researchedAt: "2026-09-01T00:00:00.000Z",
      unavailableAt: null,
      usageNote: "자동 테스트에서만 사용",
      rightsNote: "합성 데이터",
    },
  ],
  itemSources: [
    {
      itemId: "42000000-0000-4000-8000-000000000001",
      sourceId: "43000000-0000-4000-8000-000000000001",
      relation: "SUPPORTS",
      evidenceLocator: "fixture declaration",
      crossValidationGroup: null,
    },
  ],
} satisfies BookContextDocumentV1;
