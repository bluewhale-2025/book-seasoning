import { describe, expect, it } from "vitest";

import {
  BookContextDocumentV1Fixture,
  type PublicContextFrameV1,
  type PublicPrepAnswerV1,
} from "@bookseasoning/contracts/internal";

import type { BookContextProvider } from "../book-context/book-context.provider.js";
import {
  OPENING_BOOK_ITEM_BUDGET,
  OpeningContextBuilder,
} from "./opening-context.builder.js";
import type { PublicContextRepository } from "./public-context.repository.js";

const sessionId = "b6000000-0000-4000-8000-000000000010";
const roomId = "b6000000-0000-4000-8000-000000000011";
const frame: PublicContextFrameV1 = {
  builtAt: "2026-09-03T01:00:00.000Z",
  session: {
    sessionId,
    roomId,
    pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
    phase: "OPENING",
    phaseVersion: 1,
    aggregateVersion: 1,
    targetThroughSeq: 0,
    latestMessageSeq: 0,
    startedAt: "2026-09-03T01:00:00.000Z",
    discussionEndsAt: "2026-09-03T01:30:00.000Z",
    extensionPromptedAt: null,
    extensionDecisionDeadlineAt: null,
    closingStartedAt: null,
    closingEndsAt: null,
    endedAt: null,
    extensionCount: 0,
  },
  baseWiki: null,
  participants: [],
  objectiveMetrics: {
    registeredParticipantCount: 2,
    actualParticipantCount: 2,
    connectedParticipantCount: 2,
    recentSpeakerCount: 0,
    recentSpeakerWindowSeconds: 300,
    lastParticipantMessageAt: null,
    silenceSeconds: 0,
  },
  recentPolicyAction: null,
  lastCommittedInterventionAt: null,
};
const prep: PublicPrepAnswerV1 = {
  visibility: "PUBLIC",
  prepAnswerId: "b6000000-0000-4000-8000-000000000012",
  roomId,
  authorParticipantId: "b6000000-0000-4000-8000-000000000013",
  authorProfileName: "참가자",
  promptType: "DISCUSSION_QUESTION",
  body: "자유와 책임은 어디에서 충돌하는가",
  revision: 1,
  updatedAt: "2026-09-03T00:50:00.000Z",
};

describe("OpeningContextBuilder", () => {
  it("uses public prep to select a bounded Opening Pack subset", async () => {
    const providerCalls: unknown[] = [];
    const repository = {
      loadFrame: () => Promise.resolve(frame),
      listMessages: () => Promise.resolve([]),
      findMessagesByIds: () => Promise.resolve([]),
      listPublicPrep: () => Promise.resolve([prep]),
    } satisfies PublicContextRepository;
    const provider = {
      getPackVersion: (input: unknown) => {
        providerCalls.push(input);
        return Promise.resolve(BookContextDocumentV1Fixture);
      },
    } satisfies BookContextProvider;

    const result = await new OpeningContextBuilder(repository, provider).build({
      sessionId,
      baseWikiVersion: 0,
      targetThroughSeq: 0,
    });

    expect(result.publicPrep).toMatchObject([{ body: prep.body }]);
    expect(providerCalls).toEqual([
      {
        packVersionId: BookContextDocumentV1Fixture.packVersionId,
        consumer: "OPENING",
        query: prep.body,
        maxItems: OPENING_BOOK_ITEM_BUDGET,
      },
    ]);
    expect(OPENING_BOOK_ITEM_BUDGET).toBe(8);
  });
});
