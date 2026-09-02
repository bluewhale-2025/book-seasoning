import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  BookContextDocumentV1Fixture,
} from "@bookseasoning/contracts/internal";

import { evaluatorContext } from "../public-evaluator/public-evaluator.fixture.js";
import {
  canonicalizePublicEvidenceRefs,
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
    expect(input.allowedEvidenceRefs).toEqual(
      expect.arrayContaining([
        {
          type: "MESSAGE",
          messageId: AiEngineFixtureIds.secondMessageId,
          seqNo: 4,
        },
        expect.objectContaining({
          type: "BOOK_CONTEXT_ITEM",
          packVersionId: BookContextDocumentV1Fixture.packVersionId,
        }),
      ]),
    );
  });

  it("canonicalizes known locators and leaves unknown locators fail-closed", () => {
    const known = canonicalizePublicEvidenceRefs(
      {
        message: {
          type: "AI_INTERVENTION",
          messageId: "b9000000-0000-4000-8000-000000000099",
          seqNo: 4,
        },
        book: {
          type: "BOOK_CONTEXT_ITEM",
          packVersionId: "b9000000-0000-4000-8000-000000000099",
          itemId: BookContextDocumentV1Fixture.sections[0]?.items[0]?.itemId,
        },
        unknown: {
          type: "MESSAGE",
          messageId: "b9000000-0000-4000-8000-000000000098",
          seqNo: 99,
        },
      },
      evaluatorContext,
    );

    expect(known.message).toEqual({
      type: "MESSAGE",
      messageId: AiEngineFixtureIds.secondMessageId,
      seqNo: 4,
    });
    expect(known.book).toEqual(
      expect.objectContaining({
        type: "BOOK_CONTEXT_ITEM",
        packVersionId: BookContextDocumentV1Fixture.packVersionId,
      }),
    );
    expect(known.unknown).toEqual({
      type: "MESSAGE",
      messageId: "b9000000-0000-4000-8000-000000000098",
      seqNo: 99,
    });
  });
});
