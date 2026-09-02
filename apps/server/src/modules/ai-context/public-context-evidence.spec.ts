import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  BookContextDocumentV1Fixture,
} from "@bookseasoning/contracts/internal";

import { evaluatorContext } from "../public-evaluator/public-evaluator.fixture.js";
import {
  expandPublicEvaluatorEvidenceIndexes,
  indexPublicEvaluatorEvidenceRefs,
  publicEvaluatorPromptInput,
} from "./public-context-evidence.js";

describe("PUBLIC Evaluator evidence input", () => {
  it("supplies exact output envelope and PUBLIC evidence references", () => {
    const input = publicEvaluatorPromptInput(evaluatorContext);

    expect(input.requiredOutputEnvelope).toEqual({
      packVersionId: evaluatorContext.session.pinnedPackVersionId,
      baseWikiVersion: evaluatorContext.baseWiki?.version,
      targetThroughSeq: evaluatorContext.session.targetThroughSeq,
    });
    expect(input.allowedEvidenceCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: expect.any(Number),
          reference: {
            type: "MESSAGE",
            messageId: AiEngineFixtureIds.secondMessageId,
            seqNo: 4,
          },
        }),
        expect.objectContaining({
          index: expect.any(Number),
          reference: expect.objectContaining({
            type: "BOOK_CONTEXT_ITEM",
            packVersionId: BookContextDocumentV1Fixture.packVersionId,
          }),
        }),
      ]),
    );
  });

  it("round-trips canonical evidence through compact provider indexes", () => {
    const canonical = {
      evidenceRefs: [{
        type: "MESSAGE" as const,
        messageId: AiEngineFixtureIds.secondMessageId,
        seqNo: 4,
      }],
      bookContextItemRef: {
        type: "BOOK_CONTEXT_ITEM" as const,
        packVersionId: BookContextDocumentV1Fixture.packVersionId,
        itemId: BookContextDocumentV1Fixture.sections[0]!.items[0]!.itemId,
      },
    };
    const indexed = indexPublicEvaluatorEvidenceRefs(canonical, evaluatorContext);

    expect(indexed).toEqual({
      evidenceRefIndexes: [expect.any(Number)],
      bookContextItemRefIndex: expect.any(Number),
    });
    expect(
      expandPublicEvaluatorEvidenceIndexes(indexed, evaluatorContext),
    ).toEqual(canonical);
  });

  it("rejects an out-of-range provider evidence index", () => {
    expect(() =>
      expandPublicEvaluatorEvidenceIndexes(
        { evidenceRefIndexes: [999] },
        evaluatorContext,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "PUBLIC_EVIDENCE_INDEX_OUT_OF_RANGE" }),
    );
  });

  it("rejects a message index where a Book Context item is required", () => {
    const messageIndex = publicEvaluatorPromptInput(
      evaluatorContext,
    ).allowedEvidenceCatalog.find(
      ({ reference }) => reference.type === "MESSAGE",
    )!.index;

    expect(() =>
      expandPublicEvaluatorEvidenceIndexes(
        { bookContextItemRefIndex: messageIndex },
        evaluatorContext,
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "PUBLIC_BOOK_EVIDENCE_INDEX_TYPE_INVALID",
      }),
    );
  });
});
