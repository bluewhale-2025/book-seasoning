import { Injectable } from "@nestjs/common";

import type {
  LivingWikiDocumentV1,
  LivingWikiVersionV1,
} from "@bookseasoning/contracts/internal";

export class TopicCheckpointValidationError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "TopicCheckpointValidationError";
  }
}

@Injectable()
export class TopicCheckpointValidator {
  public assertPreservesHistory(
    base: LivingWikiVersionV1 | null,
    candidate: LivingWikiDocumentV1,
  ): void {
    if (base === null || base.document.currentTopic === null) {
      this.fail("TOPIC_CHECKPOINT_BASE_REQUIRED");
    }
    const previousTopic = base.document.currentTopic;
    const nextTopic = candidate.currentTopic;
    if (
      nextTopic === null ||
      nextTopic.topicId === previousTopic.topicId ||
      nextTopic.transitionedFromTopicId !== previousTopic.topicId
    ) {
      this.fail("TOPIC_CHECKPOINT_TRANSITION_REQUIRED");
    }

    this.assertIdsPreserved(
      base.document.perspectiveMap.map((item) => item.perspectiveId),
      candidate.perspectiveMap.map((item) => item.perspectiveId),
      "TOPIC_CHECKPOINT_PERSPECTIVE_LOST",
    );
    this.assertIdsPreserved(
      base.document.issueAndQuestionMap.map((item) => item.issueOrQuestionId),
      candidate.issueAndQuestionMap.map((item) => item.issueOrQuestionId),
      "TOPIC_CHECKPOINT_ISSUE_LOST",
    );
    this.assertIdsPreserved(
      base.document.coverage.map((item) => this.coverageKey(item)),
      candidate.coverage.map((item) => this.coverageKey(item)),
      "TOPIC_CHECKPOINT_COVERAGE_LOST",
    );
  }

  private coverageKey(
    coverage: LivingWikiDocumentV1["coverage"][number],
  ): string {
    return `${coverage.subjectType}:${coverage.subjectId}`;
  }

  private assertIdsPreserved(
    previousIds: readonly string[],
    nextIds: readonly string[],
    code: string,
  ): void {
    const nextIdSet = new Set(nextIds);
    if (previousIds.some((id) => !nextIdSet.has(id))) this.fail(code);
  }

  private fail(code: string): never {
    throw new TopicCheckpointValidationError(code);
  }
}
