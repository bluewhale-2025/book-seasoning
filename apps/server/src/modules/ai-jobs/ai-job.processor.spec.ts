import { afterEach, describe, expect, it, vi } from "vitest";

import { AiJobEnvelopeV1Fixture } from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import {
  RetryableAiJobError,
  TerminalAiJobError,
  type AiJobHandler,
  type AiJobHandlerResult,
} from "./ai-job.handler.js";
import {
  AiJobProcessor,
  retryDelaySeconds,
} from "./ai-job.processor.js";
import type {
  AiJobQueue,
  ClaimedAiJob,
  ClaimAiJobsOptions,
  CompleteAiJobOutcome,
  EnqueueAiJobInput,
  EnqueueAiJobResult,
} from "./ai-job.queue.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "worker",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-32-bytes",
};

const claimedJob: ClaimedAiJob = {
  ...AiJobEnvelopeV1Fixture,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T00:01:00.000Z",
};

class FakeAiJobQueue implements AiJobQueue {
  public readonly completeCalls: Array<{
    job: ClaimedAiJob;
    outcome: CompleteAiJobOutcome;
    resultCode: string | null;
  }> = [];
  public readonly retryCalls: Array<{
    job: ClaimedAiJob;
    errorCode: string;
    delaySeconds: number;
  }> = [];
  public readonly extendLeaseCalls: Array<{
    job: ClaimedAiJob;
    visibilityTimeoutSeconds: number;
  }> = [];
  public claimOptions: ClaimAiJobsOptions | undefined;

  public constructor(
    public readonly configured: boolean,
    private readonly jobs: readonly ClaimedAiJob[],
  ) {}

  public enqueue(input: EnqueueAiJobInput): Promise<EnqueueAiJobResult> {
    void input;
    return Promise.resolve({
      jobId: claimedJob.jobId,
      queueMessageId: claimedJob.queueMessageId,
      duplicate: false,
    });
  }

  public claim(options: ClaimAiJobsOptions): Promise<readonly ClaimedAiJob[]> {
    this.claimOptions = options;
    return Promise.resolve(this.jobs);
  }

  public complete(
    job: ClaimedAiJob,
    outcome: CompleteAiJobOutcome,
    resultCode: string | null,
  ): Promise<boolean> {
    this.completeCalls.push({ job, outcome, resultCode });
    return Promise.resolve(true);
  }

  public retry(
    job: ClaimedAiJob,
    errorCode: string,
    delaySeconds: number,
  ): Promise<boolean> {
    this.retryCalls.push({ job, errorCode, delaySeconds });
    return Promise.resolve(true);
  }

  public extendLease(
    job: ClaimedAiJob,
    visibilityTimeoutSeconds: number,
  ): Promise<boolean> {
    this.extendLeaseCalls.push({ job, visibilityTimeoutSeconds });
    return Promise.resolve(true);
  }
}

class FakeAiJobHandler implements AiJobHandler {
  public constructor(
    private readonly result: () => Promise<AiJobHandlerResult>,
  ) {}

  public handle(): Promise<AiJobHandlerResult> {
    return this.result();
  }
}

const processor = (queue: FakeAiJobQueue, handler: AiJobHandler) =>
  new AiJobProcessor(queue, handler, new SafeLogger(environment, () => undefined));

describe("AiJobProcessor", () => {
  afterEach(() => vi.useRealTimers());

  it("claims at the ai-session concurrency bound and completes success", async () => {
    const queue = new FakeAiJobQueue(true, [claimedJob]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() => Promise.resolve({ outcome: "SUCCEEDED" })),
    );

    await expect(subject.processNextBatch(0)).resolves.toBe(1);
    expect(queue.claimOptions).toEqual({
      visibilityTimeoutSeconds: 60,
      quantity: 2,
      maxPollSeconds: 0,
    });
    expect(queue.completeCalls).toEqual([
      { job: claimedJob, outcome: "SUCCEEDED", resultCode: null },
    ]);
  });

  it("extends the durable and queue lease during a long model task", async () => {
    vi.useFakeTimers();
    const queue = new FakeAiJobQueue(true, [claimedJob]);
    let finish: ((result: AiJobHandlerResult) => void) | undefined;
    const subject = processor(
      queue,
      new FakeAiJobHandler(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );

    const processing = subject.processNextBatch(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(queue.extendLeaseCalls).toEqual([
      { job: claimedJob, visibilityTimeoutSeconds: 60 },
    ]);
    finish?.({ outcome: "SUCCEEDED" });
    await processing;
  });

  it("persists a safe suppression reason without creating output", async () => {
    const queue = new FakeAiJobQueue(true, [claimedJob]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() =>
        Promise.resolve({
          outcome: "SUPPRESSED",
          reasonCode: "S5_HANDLER_NOT_CONNECTED",
        }),
      ),
    );

    await subject.processNextBatch(0);
    expect(queue.completeCalls[0]).toMatchObject({
      outcome: "SUPPRESSED",
      resultCode: "S5_HANDLER_NOT_CONNECTED",
    });
  });

  it("backs off retryable failures while attempts remain", async () => {
    const queue = new FakeAiJobQueue(true, [claimedJob]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() =>
        Promise.reject(new RetryableAiJobError("PROVIDER_TEMPORARY_FAILURE")),
      ),
    );

    await subject.processNextBatch(0);
    expect(queue.retryCalls).toHaveLength(1);
    expect(queue.retryCalls[0]).toMatchObject({
      job: claimedJob,
      errorCode: "PROVIDER_TEMPORARY_FAILURE",
    });
    expect(queue.retryCalls[0]?.delaySeconds).toBeGreaterThanOrEqual(5);
    expect(queue.retryCalls[0]?.delaySeconds).toBeLessThanOrEqual(6);
    expect(queue.completeCalls).toHaveLength(0);
  });

  it("archives explicit terminal errors without retry", async () => {
    const queue = new FakeAiJobQueue(true, [claimedJob]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() =>
        Promise.reject(new TerminalAiJobError("CONTRACT_INVALID")),
      ),
    );

    await subject.processNextBatch(0);
    expect(queue.completeCalls[0]).toMatchObject({
      outcome: "TERMINAL_FAILURE",
      resultCode: "CONTRACT_INVALID",
    });
    expect(queue.retryCalls).toHaveLength(0);
  });

  it("preserves the root code when the last attempt fails", async () => {
    const lastAttempt = { ...claimedJob, attemptNo: 3, maxAttempts: 3 };
    const queue = new FakeAiJobQueue(true, [lastAttempt]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() =>
        Promise.reject(new RetryableAiJobError("OUTPUT_CONTRACT_INVALID")),
      ),
    );

    await subject.processNextBatch(0);
    expect(queue.completeCalls[0]).toMatchObject({
      outcome: "TERMINAL_FAILURE",
      resultCode: "OUTPUT_CONTRACT_INVALID",
    });
    expect(queue.retryCalls).toHaveLength(0);
  });

  it("does not touch the queue when the worker database is disabled", async () => {
    const queue = new FakeAiJobQueue(false, [claimedJob]);
    const subject = processor(
      queue,
      new FakeAiJobHandler(() => Promise.resolve({ outcome: "SUCCEEDED" })),
    );

    await expect(subject.processNextBatch(0)).resolves.toBe(0);
    expect(queue.claimOptions).toBeUndefined();
  });
});

describe("retryDelaySeconds", () => {
  it("uses capped exponential backoff with bounded jitter", () => {
    expect(retryDelaySeconds(1, () => 0)).toBe(5);
    expect(retryDelaySeconds(2, () => 0)).toBe(10);
    expect(retryDelaySeconds(8, () => 1)).toBe(375);
  });
});
