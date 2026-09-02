import { Inject, Injectable } from "@nestjs/common";

import {
  LivingWikiDocumentV1Schema,
  type LivingWikiDocumentV1,
} from "@bookseasoning/contracts/internal";

import { PublicContextBuilder } from "../ai-context/public-context.builder.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  LIVING_WIKI_REPOSITORY,
  type LivingWikiCommitResult,
  type LivingWikiRepository,
} from "../living-wiki/living-wiki.repository.js";
import {
  PublicEvaluationService,
  type PublicEvaluationResult,
} from "../public-evaluator/public-evaluation.service.js";

const observation = (reasonCode: string) => ({
  level: "LOW" as const,
  reasonCodes: [reasonCode],
  evidenceRefs: [],
});

const EMPTY_FINAL_DOCUMENT: LivingWikiDocumentV1 =
  LivingWikiDocumentV1Schema.parse({
    currentTopic: null,
    perspectiveMap: [],
    bookGrounding: [],
    issueAndQuestionMap: [],
    coverage: [],
    participantState: [],
    metricsAndKeyChanges: {
      metrics: {
        depth: observation("REACTIONS_OR_ASSERTIONS_ONLY"),
        expansion: observation("VIEWPOINTS_REPEAT_WITHOUT_CONNECTION"),
        bookGrounding: observation("BOOK_CONNECTION_NOT_OBSERVED"),
        saturation: observation("NEW_QUESTIONS_STILL_EMERGING"),
        participationBalance: observation("ONE_MEANINGFUL_VIEW_DOMINATES"),
        relevance: observation("CURRENT_ISSUE_CONNECTION_WEAK"),
        activity: observation("FEW_RECENT_RESPONSES"),
      },
      summary: "기록을 만들기에 충분한 공개 대화가 없습니다.",
      keyChanges: [],
    },
  });

export type FinalWikiResult =
  | Readonly<{ insufficient: false; evaluation: PublicEvaluationResult }>
  | Readonly<{ insufficient: true; commit: LivingWikiCommitResult }>;

@Injectable()
export class FinalWikiService {
  public constructor(
    @Inject(PublicContextBuilder)
    private readonly contextBuilder: PublicContextBuilder,
    @Inject(PublicEvaluationService)
    private readonly evaluationService: PublicEvaluationService,
    @Inject(LIVING_WIKI_REPOSITORY)
    private readonly repository: LivingWikiRepository,
  ) {}

  public async finalize(job: ClaimedAiJob): Promise<FinalWikiResult> {
    const context = await this.contextBuilder.build({
      sessionId: job.sessionId,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
    });
    if (
      job.jobType !== "FINAL_WIKI" ||
      job.taskSchemaVersion !== "public-evaluator-output.v1" ||
      context.session.phase !== "ENDED"
    ) {
      throw new Error("FINAL_WIKI_CONTEXT_INVALID");
    }
    const participantMessageCount = context.participants.reduce(
      (sum, participant) => sum + participant.messageCountThroughCursor,
      0,
    );
    const distinctSpeakers = context.participants.filter(
      (participant) => participant.messageCountThroughCursor > 0,
    ).length;
    if (participantMessageCount >= 2 && distinctSpeakers >= 2) {
      return {
        insufficient: false,
        evaluation: await this.evaluationService.evaluate(job),
      };
    }
    const commit = await this.repository.commitInsufficientFinal({
      jobId: job.jobId,
      attemptNo: job.attemptNo,
      sessionId: job.sessionId,
      baseVersion: job.baseWikiVersion,
      basedThroughSeq: job.targetThroughSeq,
      document: context.baseWiki?.document ?? EMPTY_FINAL_DOCUMENT,
    });
    return { insufficient: true, commit };
  }
}
