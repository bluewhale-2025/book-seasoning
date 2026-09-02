import { Inject, Injectable } from "@nestjs/common";

import {
  PublicEvaluatorOutputV1Schema,
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
    const output = this.canonicalizeDuplicatedPatchState(outputResult.data);
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
  ): PublicEvaluatorOutputV1 {
    const perspectives = new Map(
      output.majorPerspectives.map((item) => [item.perspectiveId, item]),
    );
    const grounding = new Map(
      output.bookGrounding.map((item) => [item.groundingId, item]),
    );
    const participation = new Map(
      output.participation.map((item) => [item.participantId, item]),
    );
    return {
      ...output,
      wikiPatch: {
        ...output.wikiPatch,
        operations: output.wikiPatch.operations.map((operation) => {
          switch (operation.operation) {
            case "SET_CURRENT_TOPIC":
              return output.currentTopic === null
                ? operation
                : { ...operation, topic: output.currentTopic };
            case "UPSERT_PERSPECTIVE":
              return {
                ...operation,
                perspective:
                  perspectives.get(operation.perspective.perspectiveId) ??
                  operation.perspective,
              };
            case "UPSERT_BOOK_GROUNDING":
              return {
                ...operation,
                grounding:
                  grounding.get(operation.grounding.groundingId) ??
                  operation.grounding,
              };
            case "UPSERT_PUBLIC_PARTICIPANT_STATE":
              return {
                ...operation,
                participantState:
                  participation.get(operation.participantState.participantId) ??
                  operation.participantState,
              };
            case "SET_METRICS_AND_KEY_CHANGES":
              return {
                ...operation,
                metricsAndKeyChanges: {
                  ...operation.metricsAndKeyChanges,
                  metrics: output.metrics,
                },
              };
            default:
              return operation;
          }
        }),
      },
    };
  }

  private fail(code: string): never {
    throw new LivingWikiCommitError(code);
  }
}
