import { describe, expect, it } from "vitest";

import {
  BookContextDocumentV1Fixture,
  LivingWikiVersionV1Fixture,
  type PublicContextFrameV1,
  type PublicPrepAnswerV1,
  type PublicRawMessageV1,
} from "@bookseasoning/contracts/internal";

import type { BookContextProvider } from "../book-context/book-context.provider.js";
import {
  PublicContextBuilder,
} from "./public-context.builder.js";
import type {
  LoadPublicContextFrameInput,
  PublicContextRepository,
  PublicMessageIdsInput,
  PublicMessageRangeInput,
  PublicPrepInput,
} from "./public-context.repository.js";

const sessionId = LivingWikiVersionV1Fixture.sessionId;
const roomId = "90000000-0000-4000-8000-000000000010";

const frame: PublicContextFrameV1 = {
  builtAt: "2026-09-02T01:00:00.000Z",
  session: {
    sessionId,
    roomId,
    pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
    phase: "CORE",
    phaseVersion: 2,
    aggregateVersion: 8,
    targetThroughSeq: 6,
    latestMessageSeq: 6,
    startedAt: "2026-09-02T00:30:00.000Z",
    discussionEndsAt: "2026-09-02T01:00:00.000Z",
    extensionPromptedAt: null,
    extensionDecisionDeadlineAt: null,
    closingStartedAt: null,
    closingEndsAt: null,
    endedAt: null,
    extensionCount: 0,
  },
  baseWiki: LivingWikiVersionV1Fixture,
  participants: [],
  objectiveMetrics: {
    registeredParticipantCount: 0,
    actualParticipantCount: 0,
    connectedParticipantCount: 0,
    recentSpeakerCount: 0,
    recentSpeakerWindowSeconds: 300,
    lastParticipantMessageAt: null,
    silenceSeconds: 0,
  },
  recentPolicyAction: null,
  lastCommittedInterventionAt: null,
};

const message = (seqNo: number): PublicRawMessageV1 => ({
  visibility: "PUBLIC",
  messageId: `91000000-0000-4000-8000-${seqNo.toString().padStart(12, "0")}`,
  sessionId,
  seqNo,
  kind: "PARTICIPANT",
  authorParticipantId: "92000000-0000-4000-8000-000000000001",
  authorProfileName: "참가자",
  body: `공개 메시지 ${seqNo}`,
  reply: null,
  confirmedAt: `2026-09-02T00:5${seqNo}:00.000Z`,
  redactedAt: null,
});

const prep: PublicPrepAnswerV1 = {
  visibility: "PUBLIC",
  prepAnswerId: "93000000-0000-4000-8000-000000000001",
  roomId,
  authorParticipantId: "92000000-0000-4000-8000-000000000001",
  authorProfileName: "참가자",
  promptType: "DISCUSSION_QUESTION",
  body: "공개 질문",
  revision: 1,
  updatedAt: "2026-09-02T00:20:00.000Z",
};

class FakePublicContextRepository implements PublicContextRepository {
  public rangeInput: PublicMessageRangeInput | undefined;

  public constructor(
    private readonly messages: readonly PublicRawMessageV1[] = [
      message(3),
      message(4),
      message(5),
      message(6),
    ],
    private readonly contextFrame: PublicContextFrameV1 = frame,
  ) {}

  public loadFrame(input: LoadPublicContextFrameInput) {
    void input;
    return Promise.resolve(this.contextFrame);
  }

  public listMessages(input: PublicMessageRangeInput) {
    this.rangeInput = input;
    return Promise.resolve(this.messages);
  }

  public findMessagesByIds(input: PublicMessageIdsInput) {
    void input;
    return Promise.resolve(this.messages);
  }

  public listPublicPrep(input: PublicPrepInput) {
    void input;
    return Promise.resolve([prep]);
  }
}

const provider = (packVersionId = BookContextDocumentV1Fixture.packVersionId) =>
  ({
    getPackVersion: () =>
      Promise.resolve({ ...BookContextDocumentV1Fixture, packVersionId }),
  }) satisfies BookContextProvider;

describe("PublicContextBuilder", () => {
  it("assembles only PUBLIC Raw Data with the exact pinned Pack", async () => {
    const repository = new FakePublicContextRepository();
    const subject = new PublicContextBuilder(repository, provider());

    const result = await subject.build({
      sessionId,
      baseWikiVersion: 1,
      targetThroughSeq: 6,
    });

    expect(result.schemaVersion).toBe("public-context.v1");
    expect(result.messages.map((item) => item.seqNo)).toEqual([3, 4, 5, 6]);
    expect(result.publicPrep).toEqual([prep]);
    expect(result.bookContext.packVersionId).toBe(
      BookContextDocumentV1Fixture.packVersionId,
    );
    expect(repository.rangeInput).toEqual({
      sessionId,
      fromSeq: 1,
      throughSeq: 6,
      limit: 201,
    });
  });

  it("fails closed when the Provider returns a different Pack version", async () => {
    const subject = new PublicContextBuilder(
      new FakePublicContextRepository(),
      provider("94000000-0000-4000-8000-000000000001"),
    );

    await expect(
      subject.build({ sessionId, baseWikiVersion: 1, targetThroughSeq: 6 }),
    ).rejects.toMatchObject({
      code: "PUBLIC_CONTEXT_PACK_VERSION_MISMATCH",
    });
  });

  it("does not silently truncate an oversized Raw Data window", async () => {
    const messages = Array.from({ length: 201 }, (_, index) =>
      message(index + 1),
    );
    const subject = new PublicContextBuilder(
      new FakePublicContextRepository(messages),
      provider(),
    );

    await expect(
      subject.build({ sessionId, baseWikiVersion: 1, targetThroughSeq: 6 }),
    ).rejects.toMatchObject({
      code: "PUBLIC_CONTEXT_MESSAGE_BUDGET_EXCEEDED",
    });
  });

  it("rejects a repository frame for a different cursor", async () => {
    const repository = new FakePublicContextRepository(undefined, {
      ...frame,
      session: { ...frame.session, targetThroughSeq: 5 },
    });
    const subject = new PublicContextBuilder(repository, provider());

    await expect(
      subject.build({ sessionId, baseWikiVersion: 1, targetThroughSeq: 6 }),
    ).rejects.toMatchObject({ code: "PUBLIC_CONTEXT_CURSOR_MISMATCH" });
  });
});
