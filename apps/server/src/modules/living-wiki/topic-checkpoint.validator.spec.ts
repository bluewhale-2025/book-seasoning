import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  AiEngineMessageEvidenceFixture,
  LivingWikiVersionV1Fixture,
  type LivingWikiCurrentTopic,
  type LivingWikiDocumentV1,
} from "@bookseasoning/contracts/internal";

import { TopicCheckpointValidator } from "./topic-checkpoint.validator.js";

const nextTopic = {
  topicId: "b7000000-0000-4000-8000-000000000001",
  title: "좋은 질문이 관계에서 작동하는 조건",
  guidingQuestion: "질문의 힘이 관계에서 생기려면 어떤 조건이 필요할까요?",
  transitionedFromTopicId: AiEngineFixtureIds.topicId,
  changeSummary: "질문의 효과에서 그 효과가 생기는 관계적 조건으로 논점이 이동했다.",
  evidenceRefs: [AiEngineMessageEvidenceFixture],
} satisfies LivingWikiCurrentTopic;

describe("TopicCheckpointValidator", () => {
  const subject = new TopicCheckpointValidator();
  const historyLossCases: Array<
    [string, string, Partial<LivingWikiDocumentV1>]
  > = [
    [
      "perspectiveMap",
      "TOPIC_CHECKPOINT_PERSPECTIVE_LOST",
      { perspectiveMap: [] },
    ],
    [
      "issueAndQuestionMap",
      "TOPIC_CHECKPOINT_ISSUE_LOST",
      { issueAndQuestionMap: [] },
    ],
    ["coverage", "TOPIC_CHECKPOINT_COVERAGE_LOST", { coverage: [] }],
  ];

  it("accepts a real topic transition that retains prior perspectives, issues and coverage", () => {
    const candidate = {
      ...structuredClone(LivingWikiVersionV1Fixture.document),
      currentTopic: nextTopic,
    };

    expect(() =>
      subject.assertPreservesHistory(LivingWikiVersionV1Fixture, candidate),
    ).not.toThrow();
    expect(candidate.coverage[0]?.subjectId).toBe(AiEngineFixtureIds.topicId);
  });

  it.each(historyLossCases)("rejects lost %s history", (_field, code, replacement) => {
    const candidate = {
      ...structuredClone(LivingWikiVersionV1Fixture.document),
      currentTopic: nextTopic,
      ...replacement,
    };

    expect(() =>
      subject.assertPreservesHistory(LivingWikiVersionV1Fixture, candidate),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it("requires a checkpoint to move from the current topic", () => {
    expect(() =>
      subject.assertPreservesHistory(
        LivingWikiVersionV1Fixture,
        LivingWikiVersionV1Fixture.document,
      ),
    ).toThrowError(
      expect.objectContaining({ code: "TOPIC_CHECKPOINT_TRANSITION_REQUIRED" }),
    );
  });
});
