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

export type PublicEvaluationResult = Readonly<{
  context: PublicContextV1;
  output: PublicEvaluatorOutputV1;
  commit: LivingWikiCommitApplicationResult;
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
  ) {}

  public async evaluate(job: ClaimedAiJob): Promise<PublicEvaluationResult> {
    const context = await this.contextBuilder.build({
      sessionId: job.sessionId,
      baseWikiVersion: job.baseWikiVersion,
      targetThroughSeq: job.targetThroughSeq,
    });
    this.outputValidator.assertContextAllowed(job, context);
    const rawOutput = await this.evaluator.evaluate({
      jobId: job.jobId,
      attemptNo: job.attemptNo,
      task: this.taskFor(job),
      context,
    });
    const output = await this.outputValidator.validate(job, context, rawOutput);
    const commit = await this.commitService.commitPatch({
      job,
      roomId: context.session.roomId,
      pinnedPackVersionId: context.session.pinnedPackVersionId,
      currentWiki: context.baseWiki,
      evaluatorOutput: output,
    });
    return { context, output, commit };
  }

  private taskFor(job: ClaimedAiJob): PublicEvaluatorTask {
    if (job.jobType === "FINAL_WIKI") return "FINAL";
    return job.jobType === "TOPIC_CHECKPOINT"
      ? "TOPIC_CHECKPOINT"
      : "INCREMENTAL";
  }
}
