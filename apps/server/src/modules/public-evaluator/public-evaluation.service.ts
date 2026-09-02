import { Inject, Injectable } from "@nestjs/common";

import type {
  PublicContextV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import { PublicContextBuilder } from "../ai-context/public-context.builder.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import {
  LivingWikiCommitService,
  type LivingWikiCommitApplicationResult,
} from "../living-wiki/living-wiki-commit.service.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";
import {
  PUBLIC_EVALUATOR,
  type PublicEvaluator,
  type PublicEvaluatorTask,
} from "./public-evaluator.js";
import {
  REUSABLE_PUBLIC_EVALUATION_REPOSITORY,
  type ReusablePublicEvaluationRepository,
} from "./reusable-public-evaluation.repository.js";

export type PublicEvaluationResult = Readonly<{
  context: PublicContextV1;
  output: PublicEvaluatorOutputV1;
  commit: LivingWikiCommitApplicationResult;
  source: "PROVIDER" | "REUSED_SAME_CURSOR";
}>;

export type PublicEvaluationOptions = Readonly<{
  reuseSameCursor?: boolean;
}>;

@Injectable()
export class PublicEvaluationService {
  public constructor(
    @Inject(PublicContextBuilder)
    private readonly contextBuilder: PublicContextBuilder,
    @Inject(PUBLIC_EVALUATOR)
    private readonly evaluator: PublicEvaluator,
    @Inject(PublicEvaluatorOutputValidator)
    private readonly outputValidator: PublicEvaluatorOutputValidator,
    @Inject(LivingWikiCommitService)
    private readonly commitService: LivingWikiCommitService,
    @Inject(REUSABLE_PUBLIC_EVALUATION_REPOSITORY)
    private readonly reusableEvaluationRepository: ReusablePublicEvaluationRepository,
  ) {}

  public async evaluate(
    job: ClaimedAiJob,
    options: PublicEvaluationOptions = {},
  ): Promise<PublicEvaluationResult> {
    const context = await this.contextBuilder.build({
      sessionId: job.sessionId,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
    });
    this.outputValidator.assertContextAllowed(job, context);
    const reusable = options.reuseSameCursor
      ? await this.reusableEvaluationRepository.findForSameCursor(job)
      : null;
    const source = reusable === null ? "PROVIDER" : "REUSED_SAME_CURSOR";
    const output = reusable === null
      ? await this.evaluateWithProvider(job, context)
      : await this.outputValidator.validateCanonical(
          job,
          context,
          this.forCurrentJob(reusable, job),
        );
    const commit = await this.commitService.commitPatch({
      job,
      roomId: context.session.roomId,
      pinnedPackVersionId: context.session.pinnedPackVersionId,
      currentWiki: context.baseWiki,
      evaluatorOutput: output,
    });
    return { context, output, commit, source };
  }

  private async evaluateWithProvider(
    job: ClaimedAiJob,
    context: PublicContextV1,
  ): Promise<PublicEvaluatorOutputV1> {
    const rawOutput = await this.evaluator.evaluate({
      jobId: job.jobId,
      attemptNo: job.attemptNo,
      task: this.taskFor(job),
      context,
    });
    return this.outputValidator.validate(job, context, rawOutput);
  }

  private forCurrentJob(
    output: PublicEvaluatorOutputV1,
    job: ClaimedAiJob,
  ): PublicEvaluatorOutputV1 {
    return {
      ...output,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
      wikiPatch: {
        schemaVersion: "living-wiki-patch.v1",
        baseVersion: job.baseWikiVersion,
        basedThroughSeq: job.targetThroughSeq,
        operations: [],
      },
    };
  }

  private taskFor(job: ClaimedAiJob): PublicEvaluatorTask {
    if (job.jobType === "FINAL_WIKI") return "FINAL";
    return job.jobType === "TOPIC_CHECKPOINT"
      ? "TOPIC_CHECKPOINT"
      : "INCREMENTAL";
  }
}
