import { Inject, Injectable } from "@nestjs/common";

import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import {
  BOOK_BUILDER_QUEUE,
  type BookBuilderQueue,
  type ClaimedBookBuilderJob,
} from "./book-builder.queue.js";
import {
  BookBuilderApplicationError,
  BookBuilderService,
} from "./book-builder.service.js";

export const BOOK_BUILDER_VISIBILITY_TIMEOUT_SECONDS = 180;
export const BOOK_BUILDER_LEASE_HEARTBEAT_INTERVAL_MS = 45_000;

export const bookBuilderRetryDelaySeconds = (attemptNo: number): number =>
  Math.min(300, 10 * 2 ** Math.max(0, attemptNo - 1));

@Injectable()
export class BookBuilderProcessor {
  public constructor(
    @Inject(BOOK_BUILDER_QUEUE) private readonly queue: BookBuilderQueue,
    @Inject(BookBuilderService) private readonly service: BookBuilderService,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public get configured(): boolean {
    return this.queue.configured;
  }

  public async processNext(maxPollSeconds = 2): Promise<number> {
    if (!this.configured) return 0;
    const jobs = await this.queue.claim({
      visibilityTimeoutSeconds: BOOK_BUILDER_VISIBILITY_TIMEOUT_SECONDS,
      quantity: 1,
      maxPollSeconds,
    });
    for (const job of jobs) await this.process(job);
    return jobs.length;
  }

  private async process(job: ClaimedBookBuilderJob): Promise<void> {
    const stopHeartbeat = this.startLeaseHeartbeat(job);
    try {
      const input = await this.queue.loadInput(job);
      const result = await this.service.run(job, input);
      await this.queue.complete(job, result);
      this.logger.event("info", "worker.book_builder_stage_completed", {
        jobId: job.jobId,
      });
    } catch (error) {
      const failure = this.classify(error);
      const shouldRetry = failure.retryable && job.attemptNo < job.maxAttempts;
      await this.queue.fail(
        job,
        failure.code,
        shouldRetry,
        shouldRetry ? bookBuilderRetryDelaySeconds(job.attemptNo) : 0,
      );
      this.logger.event(
        shouldRetry ? "warn" : "error",
        shouldRetry
          ? "worker.book_builder_retry_scheduled"
          : "worker.book_builder_stage_failed",
        { jobId: job.jobId },
      );
    } finally {
      await stopHeartbeat();
    }
  }

  private classify(error: unknown): Readonly<{ code: string; retryable: boolean }> {
    if (error instanceof BookBuilderApplicationError) {
      return { code: error.code, retryable: error.retryable };
    }
    if (error instanceof AiGatewayInvocationError) {
      return { code: error.code, retryable: error.retryable };
    }
    if (error instanceof AiGatewayUnavailableError) {
      return { code: "AI_PROVIDER_NOT_CONFIGURED", retryable: false };
    }
    return { code: "BOOK_BUILDER_UNCLASSIFIED_FAILURE", retryable: true };
  }

  private startLeaseHeartbeat(job: ClaimedBookBuilderJob): () => Promise<void> {
    let stopped = false;
    let pending = Promise.resolve();
    const timer = setInterval(() => {
      if (stopped) return;
      pending = pending.then(async () => {
        try {
          const extended = await this.queue.extendLease(
            job,
            BOOK_BUILDER_VISIBILITY_TIMEOUT_SECONDS,
          );
          if (!extended) {
            this.logger.event("warn", "worker.book_builder_lease_stale", {
              jobId: job.jobId,
            });
          }
        } catch {
          this.logger.event("error", "worker.book_builder_lease_failed", {
            jobId: job.jobId,
          });
        }
      });
    }, BOOK_BUILDER_LEASE_HEARTBEAT_INTERVAL_MS);
    return async () => {
      stopped = true;
      clearInterval(timer);
      await pending;
    };
  }
}
