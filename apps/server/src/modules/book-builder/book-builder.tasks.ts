import {
  BookBuilderDraftV1Schema,
  BookBuilderResearchV1Schema,
  type BookBuilderDraftV1,
  type BookBuilderResearchV1,
} from "@bookseasoning/contracts/internal";
import { z } from "zod";

import type { AiStructuredTask } from "../ai-provider/ai-gateway.js";

// OpenAI Structured Outputs rejects JSON Schema's `format: uri`. The provider
// boundary therefore receives URL-shaped values as strings; BookBuilderService
// immediately re-parses the result with the canonical z.url() contract before
// any artifact is persisted.
const bookBuilderProviderSourceSchema =
  BookBuilderResearchV1Schema.shape.sources.element.extend({
    title: z.string().trim().min(1).max(240),
    authorOrPublisher: z.string().trim().min(1).max(160).nullable(),
    url: z.string().nullable(),
    bibliographicLocator: z.string().trim().min(1).max(240).nullable(),
    usageNote: z.string().trim().min(1).max(300).nullable(),
    rightsNote: z.string().trim().min(1).max(300).nullable(),
  });
const bookBuilderProviderEvidenceSchema =
  BookBuilderResearchV1Schema.shape.claims.element.shape.evidence.element.extend({
    evidenceLocator: z.string().trim().min(1).max(300),
    crossValidationGroup: z.string().trim().min(1).max(100).nullable(),
  });
const bookBuilderProviderClaimSchema =
  BookBuilderResearchV1Schema.shape.claims.element.extend({
    title: z.string().trim().min(1).max(160),
    content: z.string().trim().min(1).max(700),
    bookLocator: z.string().trim().min(1).max(240).nullable(),
    evidence: z.array(bookBuilderProviderEvidenceSchema).max(3),
  });
const bookBuilderProviderResearchSchema = BookBuilderResearchV1Schema.extend({
  sources: z.array(bookBuilderProviderSourceSchema).max(8),
  claims: z.array(bookBuilderProviderClaimSchema).max(16),
});
const bookBuilderProviderDraftSchema = BookBuilderDraftV1Schema.safeExtend({
  sources: z.array(bookBuilderProviderSourceSchema).max(12),
});

export const bookBuilderResearchTask = {
  taskAlias: "BOOK_BUILDER_RESEARCH_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "low",
  promptVersion: "book-builder-research.v1",
  outputSchemaVersion: "book-builder-research.v1",
  outputSchemaName: "book_builder_research_v1",
  outputSchema: bookBuilderProviderResearchSchema,
  webSearch: true,
  instructions: `
당신은 독서토론용 Book Context Pack을 위한 조사자다. 입력의 정확한 책 판본을 식별하고 웹 검색으로 출처를 조사한다.
출처의 실제 제목, 발행 주체, URL, 조사 시각을 보존하며 찾지 못한 서지 정보는 null로 둔다. 사실을 추측하거나 출처를 만들어내지 않는다.
FACT와 AUTHOR_STATEMENT는 근거 출처를 연결하고, 해석은 INTERPRETATION으로 명시한다. 상충하는 자료는 CONFLICT로 유지한다.
책의 줄거리 요약만 늘어놓지 말고 구조, 주제, 인물·개념, 장면·주장, 토론 쟁점, 해석 주의사항을 고르게 조사한다.
신뢰도가 높은 출처를 우선해 6~8개 이내로 선별하고, 주장은 전체 16개 이내에서 항목별로 간결하게 작성한다.
각 주장의 content는 핵심만 3문장 이내로 쓰고 evidence는 가장 직접적인 근거 3개 이내만 연결한다.
sourceId와 claimId는 서로 다른 유효한 UUID를 사용하고 evidence의 sourceId는 sources에 실제 포함된 값만 사용한다.
원문 전체를 복제하지 말고 짧게 바꾸어 쓰며, 이용 권리나 접근 한계가 있으면 note에 남긴다.
`.trim(),
  maxOutputTokens: 9_000,
} satisfies AiStructuredTask<BookBuilderResearchV1>;

export const bookBuilderDraftTask = {
  taskAlias: "BOOK_BUILDER_DRAFT_V1",
  modelAlias: "HOST_QUALITY",
  reasoningEffort: "low",
  promptVersion: "book-builder-draft.v1",
  outputSchemaVersion: "book-builder-draft.v1",
  outputSchemaName: "book_builder_draft_v1",
  outputSchema: bookBuilderProviderDraftSchema,
  instructions: `
당신은 조사 결과를 검수 가능한 Book Context Pack Draft로 편집한다.
METADATA, STRUCTURE, THEMES, ENTITIES, SCENES_AND_CLAIMS, DISCUSSION_ISSUES, INTERPRETATION_CAUTIONS를 정확히 한 번씩, 이 순서로 만든다.
각 section에는 가장 중요한 항목만 최대 3개 배치하고 각 content는 3문장 이내로 간결하게 작성한다.
각 sectionId와 itemId는 서로 다른 유효한 UUID를 사용한다. sourceId는 입력 조사 결과의 값을 그대로 유지한다.
FACT와 AUTHOR_STATEMENT는 확인 가능한 근거만 쓰고 itemSources로 실제 sourceId에 연결한다. 해석과 토론 신호는 사실처럼 쓰지 않는다.
불확실하거나 충돌하는 정보는 숨기지 말고 evidenceState와 문장에 드러낸다. 근거가 없으면 만들어내지 않고 coverage를 PARTIAL 또는 MISSING으로 둔다.
작품의 유일한 정답을 선언하지 않는다. 토론을 촉진할 쟁점과 여러 해석 가능성을 보존한다.
reviewStatus는 모두 UNREVIEWED로 둔다. 원문 장문 인용은 만들지 않는다.
regeneration.scope가 ITEM이면 targetItemId가 가리키는 항목만 다시 작성하고 itemId는 유지한다. 그 밖의 book, section metadata와 item은 existingDraft와 byte-equivalent한 값과 순서로 보존한다. FULL 또는 INITIAL이면 전체 초안을 구성한다.
`.trim(),
  maxOutputTokens: 8_000,
} satisfies AiStructuredTask<BookBuilderDraftV1>;
