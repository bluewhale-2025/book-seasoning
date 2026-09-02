import type { AdminBookContextPackSnapshot } from "@bookseasoning/contracts/admin";

const codes = ["METADATA", "STRUCTURE", "THEMES", "ENTITIES", "SCENES_AND_CLAIMS", "DISCUSSION_ISSUES", "INTERPRETATION_CAUTIONS"] as const;

export function createBookContextPackSnapshot(overrides: Partial<AdminBookContextPackSnapshot["pack"]> = {}): AdminBookContextPackSnapshot {
  const packVersionId = "b1000000-0000-4000-8000-000000000001";
  const updatedAt = "2026-09-02T10:00:00.000Z";
  return {
    pack: {
      packVersionId,
      bookId: "b1000000-0000-4000-8000-000000000002",
      title: "데미안",
      author: "헤르만 헤세",
      version: 1,
      status: "DRAFT",
      revision: 3,
      updatedAt,
      builderRun: {
        runId: "b1000000-0000-4000-8000-000000000003",
        packVersionId,
        stage: "VALIDATE_DRAFT",
        status: "SUCCEEDED",
        completedStageCount: 7,
        errorCode: null,
        updatedAt,
        scope: "INITIAL",
        targetItemId: null,
      },
      ...overrides,
    },
    draft: {
      schemaVersion: "book-builder-draft.v1",
      shortDescription: "자기 자신에게 이르는 성장의 이야기",
      book: { title: "데미안", author: "헤르만 헤세", publisher: "민음사", publicationYear: 2000, genre: "소설", edition: null, translator: null, isbn: null, identityNote: null },
      sections: codes.map((code, displayOrder) => ({
        sectionId: `b1000000-0000-4000-8000-${String(displayOrder + 10).padStart(12, "0")}`,
        code,
        displayOrder,
        coverage: code === "METADATA" ? "READY" : "PARTIAL",
        reviewStatus: "UNREVIEWED",
        items: code === "THEMES" ? [{ itemId: "b1000000-0000-4000-8000-000000000020", displayOrder: 0, kind: "INTERPRETATION", title: "두 세계", content: "밝음과 어둠의 이분법을 흔드는 주제", bookLocator: "1장", evidenceState: "LIMITED", reviewStatus: "UNREVIEWED" }] : [],
      })),
      sources: [],
      itemLinks: [],
      itemSources: [],
    },
    validation: { hardBlockers: [], warnings: [] },
    pendingProposal: null,
  };
}
