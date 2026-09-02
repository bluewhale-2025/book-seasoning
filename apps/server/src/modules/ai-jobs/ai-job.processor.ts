import { Inject, Injectable } from "@nestjs/common";

import { SafeLogger } from "../../observability/safe-logger.js";
import {
  AI_JOB_HANDLER,
  RetryableAiJobError,
  TerminalAiJobError,
  type AiJobHandler,
} from "./ai-job.handler.js";
import {
  AI_JOB_QUEUE,
  type AiJobQueue,
  type ClaimedAiJob,
} from "./ai-job.queue.js";

export const AI_JOB_VISIBILITY_TIMEOUT_SECONDS = 60;
export const AI_JOB_LEASE_HEARTBEAT_INTERVAL_MS = 20_000;
const BATCH_SIZE = 2;

export const retryDelaySeconds = (
  attemptNo: number,
  random: () => number = Math.random,
): number => {
  const exponential = Math.min(300, 5 * 2 ** Math.max(0, attemptNo - 1));
  const jitter = Math.floor(exponential * 0.25 * random());
  return exponential + jitter;
};

@Injectable()
export class AiJobProcessor {
  public constructor(
    @Inject(AI_JOB_QUEUE) private readonly queue: AiJobQueue,
    @Inject(AI_JOB_HANDLER) private readonly handler: AiJobHandler,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public get configured(): boolean {
    return this.queue.configured;
  }

  public async processNextBatch(maxPollSeconds = 2): Promise<number> {
    if (!this.queue.configured) {
      return 0;
    }

    const jobs = await this.queue.claim({
      visibilityTimeoutSeconds: AI_JOB_VISIBILITY_TIMEOUT_SECONDS,
      quantity: BATCH_SIZE,
      maxPollSeconds,
    });
    await Promise.all(jobs.map((job) => this.process(job)));
    return jobs.length;
  }

  private async process(job: ClaimedAiJob): Promise<void> {
    const stopLeaseHeartbeat = this.startLeaseHeartbeat(job);
    try {
      const result = await this.handler.handle(job);
      const completed = await this.queue.complete(
        job,
        result.outcome,
        result.outcome === "SUPPRESSED" ? result.reasonCode : null,
      );
      this.logger.event(
        completed ? "info" : "warn",
        completed ? "worker.ai_job_completed" : "worker.ai_job_completion_stale",
        { jobId: job.jobId },
      );
    } catch (error) {
      if (error instanceof TerminalAiJobError) {
        await this.completeTerminalFailure(job, error.code);
        return;
      }

      const errorCode =
        error instanceof RetryableAiJobError
          ? error.code
          : "UNCLASSIFIED_RETRYABLE_FAILURE";
      if (job.attemptNo >= job.maxAttempts) {
        await this.completeTerminalFailure(job, errorCode);
        return;
      }

      const scheduled = await this.queue.retry(
        job,
        errorCode,
        retryDelaySeconds(job.attemptNo),
      );
      this.logger.event(
        scheduled ? "warn" : "error",
        scheduled ? "worker.ai_job_retry_scheduled" : "worker.ai_job_retry_stale",
        { jobId: job.jobId },
      );
    } finally {
      await stopLeaseHeartbeat();
    }
  }

  private startLeaseHeartbeat(job: ClaimedAiJob): () => Promise<void> {
    let stopped = false;
    let pending = Promise.resolve();
    const timer = setInterval(() => {
      if (stopped) return;
      pending = pending.then(async () => {
        try {
          const extended = await this.queue.extendLease(
            job,
            AI_JOB_VISIBILITY_TIMEOUT_SECONDS,
          );
          if (!extended) {
            this.logger.event("warn", "worker.ai_job_lease_extension_stale", {
              jobId: job.jobId,
            });
          }
        } catch {
          this.logger.event("error", "worker.ai_job_lease_extension_failed", {
            jobId: job.jobId,
          });
        }
      });
    }, AI_JOB_LEASE_HEARTBEAT_INTERVAL_MS);

    return async () => {
      stopped = true;
      clearInterval(timer);
      await pending;
    };
  }

  private async completeTerminalFailure(
    job: ClaimedAiJob,
    errorCode: string,
  ): Promise<void> {
    const completed = await this.queue.complete(
      job,
      "TERMINAL_FAILURE",
      errorCode,
    );
    this.logger.event(
      "error",
      completed ? "worker.ai_job_failed" : "worker.ai_job_failure_stale",
      { jobId: job.jobId },
    );
  }
}
