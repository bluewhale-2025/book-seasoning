import { describe, expect, it, vi } from "vitest";

import type { BookBuilderInputV1 } from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import type {
  BookBuilderQueue,
  BookBuilderStageResult,
  ClaimedBookBuilderJob,
} from "./book-builder.queue.js";
import { BookBuilderProcessor } from "./book-builder.processor.js";
import type { BookBuilderService } from "./book-builder.service.js";
import { BookBuilderApplicationError } from "./book-builder.service.js";

const job: ClaimedBookBuilderJob = {
  schemaVersion: "book-builder-job.v1",
  jobId: "10000000-0000-4000-8000-000000000001",
  runId: "10000000-0000-4000-8000-000000000002",
  packVersionId: "10000000-0000-4000-8000-000000000003",
  stage: "IDENTIFY_BOOK",
  generationNo: 1,
  expectedRevision: 0,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T00:03:00.000Z",
};

const result: BookBuilderStageResult = {
  schemaVersion: "book-builder-identity.v1",
  artifact: { schemaVersion: "book-builder-identity.v1" },
  providerRun: null,
};

class FakeQueue implements BookBuilderQueue {
  public claimOptions: Parameters<BookBuilderQueue["claim"]>[0] | undefined;
  public completeCalls: Array<BookBuilderStageResult> = [];
  public failCalls: Array<Readonly<{
    errorCode: string;
    retry: boolean;
    delaySeconds: number;
  }>> = [];

  public constructor(public readonly configured: boolean) {}

  public claim(options: Parameters<BookBuilderQueue["claim"]>[0]) {
    this.claimOptions = options;
    return Promise.resolve([job]);
  }

  public loadInput(): Promise<BookBuilderInputV1> {
    return Promise.resolve({} as BookBuilderInputV1);
  }

  public complete(_job: ClaimedBookBuilderJob, stageResult: BookBuilderStageResult) {
    this.completeCalls.push(stageResult);
    return Promise.resolve(true);
  }

  public fail(
    _job: ClaimedBookBuilderJob,
    errorCode: string,
    retry: boolean,
    delaySeconds: number,
  ) {
    this.failCalls.push({ errorCode, retry, delaySeconds });
    return Promise.resolve(true);
  }

  public extendLease() {
    return Promise.resolve(true);
  }
}

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

const createProcessor = (
  queue: FakeQueue,
  run: () => Promise<BookBuilderStageResult>,
) => {
  const service = { run: vi.fn(run) } as unknown as BookBuilderService;
  return new BookBuilderProcessor(
    queue,
    service,
    new SafeLogger(environment, () => undefined),
  );
};

describe("BookBuilderProcessor", () => {
  it("claims one builder job at a time and completes it", async () => {
    const queue = new FakeQueue(true);
    const processor = createProcessor(queue, () => Promise.resolve(result));

    await expect(processor.processNext(0)).resolves.toBe(1);
    expect(queue.claimOptions).toEqual({
      visibilityTimeoutSeconds: 180,
      quantity: 1,
      maxPollSeconds: 0,
    });
    expect(queue.completeCalls).toEqual([result]);
  });

  it("archives terminal contract errors without retry", async () => {
    const queue = new FakeQueue(true);
    const processor = createProcessor(queue, () =>
      Promise.reject(
        new BookBuilderApplicationError("BOOK_BUILDER_INPUT_MISMATCH", false),
      ),
    );

    await processor.processNext(0);
    expect(queue.failCalls).toEqual([
      {
        errorCode: "BOOK_BUILDER_INPUT_MISMATCH",
        retry: false,
        delaySeconds: 0,
      },
    ]);
  });

  it("backs off retryable failures while attempts remain", async () => {
    const queue = new FakeQueue(true);
    const processor = createProcessor(queue, () => Promise.reject(new Error("details")));

    await processor.processNext(0);
    expect(queue.failCalls).toEqual([
      {
        errorCode: "BOOK_BUILDER_UNCLASSIFIED_FAILURE",
        retry: true,
        delaySeconds: 10,
      },
    ]);
  });

  it("does not poll when the builder database queue is disabled", async () => {
    const queue = new FakeQueue(false);
    const processor = createProcessor(queue, () => Promise.resolve(result));

    await expect(processor.processNext(0)).resolves.toBe(0);
    expect(queue.claimOptions).toBeUndefined();
  });
});
