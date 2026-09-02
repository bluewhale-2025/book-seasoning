import { describe, expect, it, vi } from "vitest";

import type {
  AiProviderRunV1,
  BookBuilderDraftV1,
  BookBuilderInputV1,
  BookBuilderResearchV1,
} from "@bookseasoning/contracts/internal";

import type { AiGateway } from "../ai-provider/ai-gateway.js";
import type { ClaimedBookBuilderJob } from "./book-builder.queue.js";
import { BookBuilderService } from "./book-builder.service.js";

const ids = {
  job: "10000000-0000-4000-8000-000000000001",
  run: "10000000-0000-4000-8000-000000000002",
  pack: "10000000-0000-4000-8000-000000000003",
  source: "10000000-0000-4000-8000-000000000004",
  missingSource: "10000000-0000-4000-8000-000000000005",
  target: "10000000-0000-4000-8000-000000000006",
  other: "10000000-0000-4000-8000-000000000007",
} as const;

const sectionCodes = [
  "METADATA",
  "STRUCTURE",
  "THEMES",
  "ENTITIES",
  "SCENES_AND_CLAIMS",
  "DISCUSSION_ISSUES",
  "INTERPRETATION_CAUTIONS",
] as const;

const book = {
  title: "데미안",
  author: "헤르만 헤세",
  publisher: null,
  publicationYear: null,
  genre: null,
  edition: null,
  translator: null,
  isbn: null,
  identityNote: null,
};

const source = {
  sourceId: ids.source,
  tier: "A" as const,
  sourceType: "publisher",
  title: "출판사 도서 정보",
  authorOrPublisher: "출판사",
  url: "https://example.com/book",
  bibliographicLocator: null,
  publishedAt: null,
  researchedAt: "2026-09-02T00:00:00.000Z",
  unavailableAt: null,
  usageNote: null,
  rightsNote: null,
};

const draft = (): BookBuilderDraftV1 => ({
  schemaVersion: "book-builder-draft.v1",
  shortDescription: "검수용 초안",
  book,
  sections: sectionCodes.map((code, index) => ({
    sectionId: `20000000-0000-4000-8000-00000000000${index + 1}`,
    code,
    displayOrder: index,
    coverage: "PARTIAL",
    reviewStatus: "UNREVIEWED",
    items:
      index === 0
        ? [
            {
              itemId: ids.target,
              displayOrder: 0,
              kind: "FACT",
              title: "대상",
              content: "대상 내용",
              bookLocator: null,
              evidenceState: "SUPPORTED",
              reviewStatus: "UNREVIEWED",
            },
            {
              itemId: ids.other,
              displayOrder: 1,
              kind: "INTERPRETATION",
              title: "보존 대상",
              content: "바뀌면 안 되는 내용",
              bookLocator: null,
              evidenceState: "LIMITED",
              reviewStatus: "UNREVIEWED",
            },
          ]
        : [],
  })),
  sources: [source],
  itemLinks: [],
  itemSources: [
    {
      itemId: ids.target,
      sourceId: ids.source,
      relation: "SUPPORTS",
      evidenceLocator: "도서 정보",
      crossValidationGroup: null,
    },
  ],
});

const research = (sourceId: string = ids.source): BookBuilderResearchV1 => ({
  schemaVersion: "book-builder-research.v1",
  book,
  sources: [source],
  claims: [
    {
      claimId: "30000000-0000-4000-8000-000000000001",
      suggestedSection: "METADATA",
      kind: "FACT",
      title: "책 정보",
      content: "검증된 정보",
      bookLocator: null,
      evidenceState: "SUPPORTED",
      evidence: [
        {
          sourceId,
          relation: "SUPPORTS",
          evidenceLocator: "도서 정보",
          crossValidationGroup: null,
        },
      ],
    },
  ],
});

const providerRun: AiProviderRunV1 = {
  schemaVersion: "ai-provider-run.v1",
  taskAlias: "BOOK_BUILDER_RESEARCH_V1",
  promptVersion: "book-builder-research.v1",
  outputSchemaVersion: "book-builder-research.v1",
  provider: "OPENAI",
  model: "test-model",
  reasoningEffort: "medium",
  responseId: "response-1",
  latencyMs: 1,
  requestMetrics: {
    inputBytes: 10,
    instructionsBytes: 5,
    outputSchemaBytes: 20,
    totalRequestBytes: 35,
    maxOutputTokens: 12_000,
  },
  usage: null,
};

const job = (stage: ClaimedBookBuilderJob["stage"]): ClaimedBookBuilderJob => ({
  schemaVersion: "book-builder-job.v1",
  jobId: ids.job,
  runId: ids.run,
  packVersionId: ids.pack,
  stage,
  generationNo: 1,
  expectedRevision: 0,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T00:03:00.000Z",
});

const input = (
  stage: ClaimedBookBuilderJob["stage"],
  overrides: Partial<BookBuilderInputV1> = {},
): BookBuilderInputV1 => ({
  jobId: ids.job,
  runId: ids.run,
  packVersionId: ids.pack,
  stage,
  expectedRevision: 0,
  scope: "INITIAL",
  targetItemId: null,
  draft: draft(),
  artifacts: [],
  ...overrides,
});

const gateway = (output: unknown): AiGateway => ({
  configured: true,
  generate: vi.fn().mockResolvedValue({ output, run: providerRun }),
});

describe("BookBuilderService", () => {
  it("rejects a queue envelope and durable input mismatch before calling AI", async () => {
    const ai = gateway(research());
    const service = new BookBuilderService(ai);

    await expect(
      service.run(job("DISCOVER_SOURCES"), input("DISCOVER_SOURCES", { runId: ids.pack })),
    ).rejects.toMatchObject({
      code: "BOOK_BUILDER_INPUT_MISMATCH",
      retryable: false,
    });
    expect(ai.generate).not.toHaveBeenCalled();
  });

  it("rejects evidence that references a source absent from research", async () => {
    const service = new BookBuilderService(gateway(research(ids.missingSource)));

    await expect(
      service.run(job("DISCOVER_SOURCES"), input("DISCOVER_SOURCES")),
    ).rejects.toMatchObject({
      code: "BOOK_BUILDER_EVIDENCE_REFERENCE_INVALID",
      retryable: true,
    });
  });

  it("requires a validated research artifact before deterministic middle stages", async () => {
    const service = new BookBuilderService(gateway(research()));

    await expect(
      service.run(job("EXTRACT_CLAIMS"), input("EXTRACT_CLAIMS")),
    ).rejects.toMatchObject({
      code: "BOOK_BUILDER_RESEARCH_MISSING",
      retryable: false,
    });
  });

  it("prevents item regeneration from changing a non-target item", async () => {
    const proposed = draft();
    const other = proposed.sections[0]?.items[1];
    if (other === undefined) throw new Error("fixture invalid");
    other.content = "범위를 벗어난 변경";
    const service = new BookBuilderService(gateway({
      ...proposed,
    }));

    await expect(
      service.run(
        job("BUILD_SECTIONS"),
        input("BUILD_SECTIONS", {
          scope: "ITEM",
          targetItemId: ids.target,
          artifacts: [research()],
        }),
      ),
    ).rejects.toMatchObject({
      code: "BOOK_BUILDER_ITEM_SCOPE_VIOLATION",
      retryable: true,
    });
  });

  it("returns only the validated final draft during the validation stage", async () => {
    const service = new BookBuilderService(gateway(research()));
    const finalDraft = draft();

    await expect(
      service.run(
        job("VALIDATE_DRAFT"),
        input("VALIDATE_DRAFT", { artifacts: [finalDraft] }),
      ),
    ).resolves.toMatchObject({
      schemaVersion: "book-builder-draft.v1",
      artifact: finalDraft,
      providerRun: null,
    });
  });
});
