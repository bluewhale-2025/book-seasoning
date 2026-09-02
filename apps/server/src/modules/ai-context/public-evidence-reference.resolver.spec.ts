import { describe, expect, it } from "vitest";

import {
  BookContextDocumentV1Fixture,
  type PublicEvidenceRef,
  type PublicPrepAnswerV1,
  type PublicRawMessageV1,
} from "@bookseasoning/contracts/internal";

import type { BookContextProvider } from "../book-context/book-context.provider.js";
import type {
  LoadPublicContextFrameInput,
  PublicContextRepository,
  PublicMessageIdsInput,
  PublicMessageRangeInput,
  PublicPrepInput,
} from "./public-context.repository.js";
import {
  PublicEvidenceReferenceResolver,
  type PublicEvidenceScope,
} from "./public-evidence-reference.resolver.js";

const scope: PublicEvidenceScope = {
  sessionId: "95000000-0000-4000-8000-000000000001",
  roomId: "95000000-0000-4000-8000-000000000002",
  pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
  targetThroughSeq: 6,
};

const participantMessage: PublicRawMessageV1 = {
  visibility: "PUBLIC",
  messageId: "95000000-0000-4000-8000-000000000003",
  sessionId: scope.sessionId,
  seqNo: 5,
  kind: "PARTICIPANT",
  authorParticipantId: "95000000-0000-4000-8000-000000000004",
  authorProfileName: "참가자",
  body: "공개 원문",
  reply: null,
  confirmedAt: "2026-09-02T00:55:00.000Z",
  redactedAt: null,
};

const interventionMessage: PublicRawMessageV1 = {
  ...participantMessage,
  messageId: "95000000-0000-4000-8000-000000000005",
  seqNo: 6,
  kind: "AI_HOST",
  authorParticipantId: null,
  authorProfileName: "AI 진행자",
  body: "서로 다른 전제를 비교해볼까요?",
};

const publicPrep: PublicPrepAnswerV1 = {
  visibility: "PUBLIC",
  prepAnswerId: "95000000-0000-4000-8000-000000000006",
  roomId: scope.roomId,
  authorParticipantId: "95000000-0000-4000-8000-000000000004",
  authorProfileName: "참가자",
  promptType: "DISCUSSION_QUESTION",
  body: "공개 사전 질문",
  revision: 1,
  updatedAt: "2026-09-02T00:20:00.000Z",
};

class FakeRepository implements PublicContextRepository {
  public constructor(
    private readonly messages: readonly PublicRawMessageV1[] = [
      participantMessage,
      interventionMessage,
    ],
  ) {}

  public loadFrame(input: LoadPublicContextFrameInput): never {
    void input;
    throw new Error("not used");
  }

  public listMessages(input: PublicMessageRangeInput): never {
    void input;
    throw new Error("not used");
  }

  public findMessagesByIds(input: PublicMessageIdsInput) {
    return Promise.resolve(
      this.messages.filter((message) => input.messageIds.includes(message.messageId)),
    );
  }

  public listPublicPrep(input: PublicPrepInput) {
    return Promise.resolve(
      input.prepAnswerIds === undefined ||
        input.prepAnswerIds.includes(publicPrep.prepAnswerId)
        ? [publicPrep]
        : [],
    );
  }
}

const bookProvider: BookContextProvider = {
  getPackVersion: () => Promise.resolve(BookContextDocumentV1Fixture),
};

const references = [
  {
    type: "MESSAGE",
    messageId: participantMessage.messageId,
    seqNo: participantMessage.seqNo,
  },
  {
    type: "AI_INTERVENTION",
    messageId: interventionMessage.messageId,
    seqNo: interventionMessage.seqNo,
  },
  { type: "PUBLIC_PREP", prepAnswerId: publicPrep.prepAnswerId },
  {
    type: "BOOK_CONTEXT_ITEM",
    packVersionId: scope.pinnedPackVersionId,
    itemId: BookContextDocumentV1Fixture.sections[0]!.items[0]!.itemId,
  },
] as const satisfies readonly PublicEvidenceRef[];

describe("PublicEvidenceReferenceResolver", () => {
  it("materializes all four allow-listed references from original sources", async () => {
    const subject = new PublicEvidenceReferenceResolver(
      new FakeRepository(),
      bookProvider,
    );

    const result = await subject.resolve(scope, references);

    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({ message: participantMessage });
    expect(result[1]).toMatchObject({ message: interventionMessage });
    expect(result[2]).toMatchObject({ prep: publicPrep });
    expect(result[3]).toMatchObject({
      item: BookContextDocumentV1Fixture.sections[0]!.items[0]!,
    });
  });

  it("rejects future message and foreign Pack references before retrieval", async () => {
    const subject = new PublicEvidenceReferenceResolver(
      new FakeRepository(),
      bookProvider,
    );

    await expect(
      subject.resolve(scope, [
        { ...references[0], seqNo: scope.targetThroughSeq + 1 },
      ]),
    ).rejects.toMatchObject({
      code: "PUBLIC_REFERENCE_CURSOR_EXCEEDED",
      referenceIndex: 0,
    });
    await expect(
      subject.resolve(scope, [
        {
          ...references[3],
          packVersionId: "95000000-0000-4000-8000-000000000099",
        },
      ]),
    ).rejects.toMatchObject({
      code: "BOOK_CONTEXT_PACK_VERSION_MISMATCH",
      referenceIndex: 0,
    });
  });

  it("rejects missing, seq-mismatched and kind-mismatched Raw Data", async () => {
    const subject = new PublicEvidenceReferenceResolver(
      new FakeRepository([participantMessage]),
      bookProvider,
    );

    await expect(subject.resolve(scope, [references[1]])).rejects.toMatchObject({
      code: "PUBLIC_INTERVENTION_NOT_FOUND",
    });
    await expect(
      subject.resolve(scope, [{ ...references[0], seqNo: 4 }]),
    ).rejects.toMatchObject({ code: "PUBLIC_MESSAGE_SEQ_MISMATCH" });
    await expect(
      subject.resolve(scope, [
        {
          type: "AI_INTERVENTION",
          messageId: participantMessage.messageId,
          seqNo: participantMessage.seqNo,
        },
      ]),
    ).rejects.toMatchObject({ code: "PUBLIC_INTERVENTION_KIND_MISMATCH" });
  });

  it("has no AI_PRIVATE reference variant", async () => {
    const subject = new PublicEvidenceReferenceResolver(
      new FakeRepository(),
      bookProvider,
    );

    await expect(
      subject.resolve(scope, [
        {
          type: "AI_PRIVATE_PREP",
          prepAnswerId: publicPrep.prepAnswerId,
        } as never,
      ]),
    ).rejects.toBeDefined();
  });

  it("rejects a Provider response for a different Pack", async () => {
    const subject = new PublicEvidenceReferenceResolver(new FakeRepository(), {
      getPackVersion: () =>
        Promise.resolve({
          ...BookContextDocumentV1Fixture,
          packVersionId: "95000000-0000-4000-8000-000000000099",
        }),
    });

    await expect(subject.resolve(scope, [references[3]])).rejects.toMatchObject({
      code: "BOOK_CONTEXT_PROVIDER_VERSION_MISMATCH",
    });
  });
});
