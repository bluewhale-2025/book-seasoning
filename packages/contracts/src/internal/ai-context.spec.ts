import { describe, expect, it } from "vitest";

import { AI_PRIVATE_CANARY_PREFIX } from "./ai-common.js";
import { PublicContextV1Schema } from "./ai-context.js";
import { BookContextDocumentV1Fixture } from "./book-context.fixture.js";

const sessionId = "90000000-0000-4000-8000-000000000001";
const roomId = "90000000-0000-4000-8000-000000000002";
const participantId = "90000000-0000-4000-8000-000000000003";
const builtAt = "2026-09-02T01:00:00.000Z";

const contextFixture = {
  schemaVersion: "public-context.v1",
  builtAt,
  session: {
    sessionId,
    roomId,
    pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
    phase: "CORE",
    phaseVersion: 2,
    aggregateVersion: 4,
    targetThroughSeq: 2,
    latestMessageSeq: 2,
    startedAt: "2026-09-02T00:30:00.000Z",
    discussionEndsAt: "2026-09-02T01:00:00.000Z",
    extensionPromptedAt: null,
    extensionDecisionDeadlineAt: null,
    closingStartedAt: null,
    closingEndsAt: null,
    endedAt: null,
    extensionCount: 0,
  },
  baseWiki: null,
  messages: [
    {
      visibility: "PUBLIC",
      messageId: "90000000-0000-4000-8000-000000000004",
      sessionId,
      seqNo: 2,
      kind: "PARTICIPANT",
      authorParticipantId: participantId,
      authorProfileName: "참가자",
      body: "질문이 관점을 바꾸는 순간을 이야기하고 싶습니다.",
      reply: null,
      confirmedAt: "2026-09-02T00:59:00.000Z",
      redactedAt: null,
    },
  ],
  publicPrep: [
    {
      visibility: "PUBLIC",
      prepAnswerId: "90000000-0000-4000-8000-000000000005",
      roomId,
      authorParticipantId: participantId,
      authorProfileName: "참가자",
      promptType: "DISCUSSION_QUESTION",
      body: "좋은 질문은 어디에서 시작될까요?",
      revision: 1,
      updatedAt: "2026-09-02T00:10:00.000Z",
    },
  ],
  participants: [
    {
      participantId,
      profileName: "참가자",
      role: "PARTICIPANT",
      membershipStatus: "PARTICIPATED",
      joinedAt: "2026-09-02T00:20:00.000Z",
      participatedAt: "2026-09-02T00:30:00.000Z",
      connectionStatus: "ONLINE",
      lastSeenAt: "2026-09-02T00:59:55.000Z",
      messageCountThroughCursor: 1,
      lastMessageSeq: 2,
      lastSpokeAt: "2026-09-02T00:59:00.000Z",
    },
  ],
  objectiveMetrics: {
    registeredParticipantCount: 1,
    actualParticipantCount: 1,
    connectedParticipantCount: 1,
    recentSpeakerCount: 1,
    recentSpeakerWindowSeconds: 300,
    lastParticipantMessageAt: "2026-09-02T00:59:00.000Z",
    silenceSeconds: 60,
  },
  recentPolicyAction: null,
  lastCommittedInterventionAt: null,
  bookContext: BookContextDocumentV1Fixture,
} as const;

describe("S5-3 PUBLIC context contract", () => {
  it("accepts only a same-session cursor and room-pinned exact Pack", () => {
    expect(PublicContextV1Schema.parse(contextFixture)).toEqual(contextFixture);

    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        bookContext: {
          ...BookContextDocumentV1Fixture,
          packVersionId: "90000000-0000-4000-8000-000000000099",
        },
      }).success,
    ).toBe(false);
    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        session: { ...contextFixture.session, targetThroughSeq: 3 },
      }).success,
    ).toBe(false);
  });

  it("rejects private-lane canaries from message and prep text", () => {
    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        messages: [
          {
            ...contextFixture.messages[0],
            body: `${AI_PRIVATE_CANARY_PREFIX}message`,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        publicPrep: [
          {
            ...contextFixture.publicPrep[0],
            body: `${AI_PRIVATE_CANARY_PREFIX}prep`,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects cross-session, future and out-of-order Raw Data", () => {
    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        messages: [
          {
            ...contextFixture.messages[0],
            sessionId: "90000000-0000-4000-8000-000000000099",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      PublicContextV1Schema.safeParse({
        ...contextFixture,
        messages: [
          { ...contextFixture.messages[0], seqNo: 2 },
          {
            ...contextFixture.messages[0],
            messageId: "90000000-0000-4000-8000-000000000006",
            seqNo: 1,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
