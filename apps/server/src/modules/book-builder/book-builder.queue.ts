import type {
  AiProviderRunV1,
  BookBuilderInputV1,
  BookBuilderJobEnvelopeV1,
} from "@bookseasoning/contracts/internal";

export const BOOK_BUILDER_QUEUE = Symbol("BOOK_BUILDER_QUEUE");

export type ClaimedBookBuilderJob = Readonly<
  BookBuilderJobEnvelopeV1 & {
    queueMessageId: string;
    queueReadCount: number;
    attemptNo: number;
    maxAttempts: number;
    leaseExpiresAt: string;
  }
>;

export type BookBuilderStageResult = Readonly<{
  schemaVersion: string;
  artifact: Record<string, unknown>;
  providerRun: AiProviderRunV1 | null;
}>;

export interface BookBuilderQueue {
  readonly configured: boolean;

  claim(options: Readonly<{
    visibilityTimeoutSeconds: number;
    quantity: number;
    maxPollSeconds: number;
  }>): Promise<readonly ClaimedBookBuilderJob[]>;
  loadInput(job: ClaimedBookBuilderJob): Promise<BookBuilderInputV1>;
  complete(job: ClaimedBookBuilderJob, result: BookBuilderStageResult): Promise<boolean>;
  fail(
    job: ClaimedBookBuilderJob,
    errorCode: string,
    retry: boolean,
    delaySeconds: number,
  ): Promise<boolean>;
  extendLease(job: ClaimedBookBuilderJob, seconds: number): Promise<boolean>;
}
