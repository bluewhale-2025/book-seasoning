import { Inject, Injectable } from "@nestjs/common";

import {
  PublicEvaluatorOutputV1Schema,
  type LivingWikiPatchOperationV1,
  type LivingWikiVersionV1,
  type PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import { LivingWikiEvaluatorConsistencyValidator } from "./living-wiki-evaluator-consistency.validator.js";
import { LivingWikiPatchEngine } from "./living-wiki-patch.engine.js";
import {
  LIVING_WIKI_REPOSITORY,
  type LivingWikiCommitKind,
  type LivingWikiCommitResult,
  type LivingWikiRepository,
} from "./living-wiki.repository.js";
import { TopicCheckpointValidator } from "./topic-checkpoint.validator.js";

const patchOperationTargetKey = (
  operation: LivingWikiPatchOperationV1,
): string => {
  switch (operation.operation) {
    case "SET_CURRENT_TOPIC":
    case "SET_METRICS_AND_KEY_CHANGES":
      return operation.operation;
    case "UPSERT_PERSPECTIVE":
      return `PERSPECTIVE:${operation.perspective.perspectiveId}`;
    case "REMOVE_PERSPECTIVE":
      return `PERSPECTIVE:${operation.perspectiveId}`;
    case "UPSERT_BOOK_GROUNDING":
      return `BOOK_GROUNDING:${operation.grounding.groundingId}`;
    case "REMOVE_BOOK_GROUNDING":
      return `BOOK_GROUNDING:${operation.groundingId}`;
    case "UPSERT_ISSUE_OR_QUESTION":
      return `ISSUE_OR_QUESTION:${operation.issueOrQuestion.issueOrQuestionId}`;
    case "UPDATE_COVERAGE":
      return `COVERAGE:${operation.coverage.subjectType}:${operation.coverage.subjectId}`;
    case "UPSERT_PUBLIC_PARTICIPANT_STATE":
      return `PARTICIPANT:${operation.participantState.participantId}`;
  }
};

export type CommitLivingWikiPatchInput = Readonly<{
  job: ClaimedAiJob;
  roomId: string;
  pinnedPackVersionId: string;
  currentWiki: LivingWikiVersionV1 | null;
  evaluatorOutput: unknown;
}>;

export type LivingWikiCommitApplicationResult = LivingWikiCommitResult &
  Readonly<{
    document: LivingWikiVersionV1["document"];
    documentChanged: boolean;
    cursorAdvanced: boolean;
  }>;

export class LivingWikiCommitError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "LivingWikiCommitError";
  }
}

@Injectable()
export class LivingWikiCommitService {
  public constructor(
    @Inject(LivingWikiPatchEngine)
    private readonly patchEngine: LivingWikiPatchEngine,
    @Inject(TopicCheckpointValidator)
    private readonly checkpointValidator: TopicCheckpointValidator,
    @Inject(LivingWikiEvaluatorConsistencyValidator)
    private readonly evaluatorConsistencyValidator: LivingWikiEvaluatorConsistencyValidator,
    @Inject(LIVING_WIKI_REPOSITORY)
    private readonly repository: LivingWikiRepository,
  ) {}

  public async commitPatch(
    input: CommitLivingWikiPatchInput,
  ): Promise<LivingWikiCommitApplicationResult> {
    const kind = this.kindFor(input.job.jobType);
    const outputResult = PublicEvaluatorOutputV1Schema.safeParse(
      input.evaluatorOutput,
    );
    if (!outputResult.success) {
      this.fail("LIVING_WIKI_EVALUATOR_OUTPUT_INVALID");
    }
    const output = this.canonicalizeDuplicatedPatchState(
      outputResult.data,
      input.currentWiki,
    );
    if (
      output.packVersionId !== input.pinnedPackVersionId ||
      output.baseWikiVersion !== input.job.baseWikiVersion ||
      output.targetThroughSeq !== input.job.targetThroughSeq
    ) {
      this.fail("LIVING_WIKI_JOB_OUTPUT_MISMATCH");
    }

    const application = await this.patchEngine.apply({
      scope: {
        sessionId: input.job.sessionId,
        roomId: input.roomId,
        pinnedPackVersionId: input.pinnedPackVersionId,
        targetThroughSeq: input.job.targetThroughSeq,
      },
      currentWiki: input.currentWiki,
      patch: output.wikiPatch,
    });

    if (kind === "TOPIC_CHECKPOINT") {
      this.checkpointValidator.assertPreservesHistory(
        input.currentWiki,
        application.document,
      );
    }
    this.evaluatorConsistencyValidator.assertConsistent(
      output,
      application.document,
    );

    const result = await this.repository.commitCandidate({
      jobId: input.job.jobId,
      attemptNo: input.job.attemptNo,
      sessionId: input.job.sessionId,
      kind,
      baseVersion: application.baseVersion,
      basedThroughSeq: application.basedThroughSeq,
      document: application.document,
      evaluatorOutput: output,
    });
    return {
      ...result,
      document: application.document,
      documentChanged: application.documentChanged,
      cursorAdvanced: application.cursorAdvanced,
    };
  }

  private kindFor(jobType: ClaimedAiJob["jobType"]): LivingWikiCommitKind {
    if (jobType === "PUBLIC_EVALUATION") return "INCREMENTAL";
    if (jobType === "TOPIC_CHECKPOINT") return "TOPIC_CHECKPOINT";
    if (jobType === "FINAL_WIKI") return "FINAL";
    this.fail("LIVING_WIKI_JOB_TYPE_INVALID");
  }

  private canonicalizeDuplicatedPatchState(
    output: PublicEvaluatorOutputV1,
    currentWiki: LivingWikiVersionV1 | null,
  ): PublicEvaluatorOutputV1 {
    const currentTopic =
      output.currentTopic ?? currentWiki?.document.currentTopic ?? null;
    const selectedPerspectiveIds = new Set(
      output.majorPerspectives.map((item) => item.perspectiveId),
    );
    const perspectiveIds = new Set(
      currentWiki?.document.perspectiveMap.map((item) => item.perspectiveId) ??
        [],
    );
    const issueIds = new Set(
      currentWiki?.document.issueAndQuestionMap.map(
        (item) => item.issueOrQuestionId,
      ) ?? [],
    );
    for (const operation of output.wikiPatch.operations) {
      if (operation.operation === "UPSERT_PERSPECTIVE") {
        perspectiveIds.add(operation.perspective.perspectiveId);
      } else if (
        operation.operation === "REMOVE_PERSPECTIVE" &&
        !selectedPerspectiveIds.has(operation.perspectiveId)
      ) {
        perspectiveIds.delete(operation.perspectiveId);
      } else if (operation.operation === "UPSERT_ISSUE_OR_QUESTION") {
        issueIds.add(operation.issueOrQuestion.issueOrQuestionId);
      }
    }

    const majorPerspectives = output.majorPerspectives.map((perspective) => ({
      ...perspective,
      relations: perspective.relations.filter(
        (relation) =>
          relation.targetPerspectiveId !== perspective.perspectiveId &&
          perspectiveIds.has(relation.targetPerspectiveId),
      ),
    }));
    const bookGrounding = output.bookGrounding.map((grounding) => ({
      ...grounding,
      connectedPerspectiveIds: grounding.connectedPerspectiveIds.filter(
        (perspectiveId) => perspectiveIds.has(perspectiveId),
      ),
    }));
    const perspectives = new Map(
      majorPerspectives.map((item) => [item.perspectiveId, item]),
    );
    const grounding = new Map(
      bookGrounding.map((item) => [item.groundingId, item]),
    );
    const participation = new Map(
      output.participation.map((item) => [item.participantId, item]),
    );
    const operations: LivingWikiPatchOperationV1[] = [];
    for (const operation of output.wikiPatch.operations) {
      switch (operation.operation) {
        case "SET_CURRENT_TOPIC":
          operations.push(
            currentTopic === null
              ? operation
              : { ...operation, topic: currentTopic },
          );
          break;
        case "UPSERT_PERSPECTIVE": {
          const perspective =
            perspectives.get(operation.perspective.perspectiveId) ??
            operation.perspective;
          operations.push({
            ...operation,
            perspective: {
              ...perspective,
              relations: perspective.relations.filter(
                (relation) =>
                  relation.targetPerspectiveId !==
                    perspective.perspectiveId &&
                  perspectiveIds.has(relation.targetPerspectiveId),
              ),
            },
          });
          break;
        }
        case "UPSERT_BOOK_GROUNDING": {
          const selected =
            grounding.get(operation.grounding.groundingId) ??
            operation.grounding;
          operations.push({
            ...operation,
            grounding: {
              ...selected,
              connectedPerspectiveIds:
                selected.connectedPerspectiveIds.filter((perspectiveId) =>
                  perspectiveIds.has(perspectiveId),
                ),
            },
          });
          break;
        }
        case "UPSERT_ISSUE_OR_QUESTION":
          operations.push({
            ...operation,
            issueOrQuestion: {
              ...operation.issueOrQuestion,
              relatedPerspectiveIds:
                operation.issueOrQuestion.relatedPerspectiveIds.filter(
                  (perspectiveId) => perspectiveIds.has(perspectiveId),
                ),
            },
          });
          break;
        case "UPDATE_COVERAGE":
          if (
            operation.coverage.subjectType === "TOPIC" ||
            (operation.coverage.subjectType === "PERSPECTIVE" &&
              perspectiveIds.has(operation.coverage.subjectId)) ||
            (operation.coverage.subjectType === "ISSUE_OR_QUESTION" &&
              issueIds.has(operation.coverage.subjectId))
          ) {
            operations.push(operation);
          }
          break;
        case "UPSERT_PUBLIC_PARTICIPANT_STATE":
          operations.push({
            ...operation,
            participantState:
              participation.get(operation.participantState.participantId) ??
              operation.participantState,
          });
          break;
        case "SET_METRICS_AND_KEY_CHANGES":
          operations.push({
            ...operation,
            metricsAndKeyChanges: {
              ...operation.metricsAndKeyChanges,
              metrics: output.metrics,
            },
          });
          break;
        case "REMOVE_PERSPECTIVE":
          if (!perspectives.has(operation.perspectiveId)) {
            operations.push(operation);
          }
          break;
        case "REMOVE_BOOK_GROUNDING":
          if (!grounding.has(operation.groundingId)) {
            operations.push(operation);
          }
          break;
        default:
          operations.push(operation);
      }
    }
    const operationKeys = new Set(operations.map(patchOperationTargetKey));
    if (
      currentTopic !== null &&
      !operationKeys.has("SET_CURRENT_TOPIC")
    ) {
      operations.push({
        operation: "SET_CURRENT_TOPIC",
        baseVersion: output.baseWikiVersion,
        topic: currentTopic,
      });
      operationKeys.add("SET_CURRENT_TOPIC");
    }
    for (const perspective of majorPerspectives) {
      const key = `PERSPECTIVE:${perspective.perspectiveId}`;
      if (!operationKeys.has(key)) {
        operations.push({
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: output.baseWikiVersion,
          perspective,
        });
        operationKeys.add(key);
      }
    }
    for (const selectedGrounding of bookGrounding) {
      const key = `BOOK_GROUNDING:${selectedGrounding.groundingId}`;
      if (!operationKeys.has(key)) {
        operations.push({
          operation: "UPSERT_BOOK_GROUNDING",
          baseVersion: output.baseWikiVersion,
          grounding: selectedGrounding,
        });
        operationKeys.add(key);
      }
    }
    for (const participantState of participation.values()) {
      const key = `PARTICIPANT:${participantState.participantId}`;
      if (!operationKeys.has(key)) {
        operations.push({
          operation: "UPSERT_PUBLIC_PARTICIPANT_STATE",
          baseVersion: output.baseWikiVersion,
          participantState,
        });
        operationKeys.add(key);
      }
    }
    if (!operationKeys.has("SET_METRICS_AND_KEY_CHANGES")) {
      operations.push({
        operation: "SET_METRICS_AND_KEY_CHANGES",
        baseVersion: output.baseWikiVersion,
        metricsAndKeyChanges: {
          metrics: output.metrics,
          summary: output.summaryState,
          keyChanges: [],
        },
      });
      operationKeys.add("SET_METRICS_AND_KEY_CHANGES");
    }
    return {
      ...output,
      currentTopic,
      majorPerspectives,
      bookGrounding,
      wikiPatch: {
        ...output.wikiPatch,
        operations,
      },
    };
  }

  private fail(code: string): never {
    throw new LivingWikiCommitError(code);
  }
}
