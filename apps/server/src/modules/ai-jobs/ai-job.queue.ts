import type {
  AiJobEnvelopeV1,
  AiSessionJobType,
} from "@bookseasoning/contracts/internal";

export const AI_JOB_QUEUE = Symbol("AI_JOB_QUEUE");

export type ClaimedAiJob = Readonly<
  AiJobEnvelopeV1 & {
    queueMessageId: string;
    queueReadCount: number;
    attemptNo: number;
    maxAttempts: number;
    leaseExpiresAt: string;
  }
>;

export type ClaimAiJobsOptions = Readonly<{
  visibilityTimeoutSeconds: number;
  quantity: number;
  maxPollSeconds: number;
}>;

export type CompleteAiJobOutcome =
  | "SUCCEEDED"
  | "SUPPRESSED"
  | "TERMINAL_FAILURE";

export type EnqueueAiJobInput = Readonly<{
  jobKey: string;
  jobType: AiSessionJobType;
  sessionId: string;
  baseWikiVersion: number;
  targetThroughSeq: number;
  taskSchemaVersion: string;
  requestId?: string;
  maxAttempts?: number;
}>;

export type EnqueueAiJobResult = Readonly<{
  jobId: string;
  queueMessageId: string;
  duplicate: boolean;
}>;

export interface AiJobQueue {
  readonly configured: boolean;

  enqueue(input: EnqueueAiJobInput): Promise<EnqueueAiJobResult>;

  claim(options: ClaimAiJobsOptions): Promise<readonly ClaimedAiJob[]>;

  complete(
    job: ClaimedAiJob,
    outcome: CompleteAiJobOutcome,
    resultCode: string | null,
  ): Promise<boolean>;

  retry(
    job: ClaimedAiJob,
    errorCode: string,
    delaySeconds: number,
  ): Promise<boolean>;

  extendLease(job: ClaimedAiJob, visibilityTimeoutSeconds: number): Promise<boolean>;
}
