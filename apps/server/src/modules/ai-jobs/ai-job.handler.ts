import type { ClaimedAiJob } from "./ai-job.queue.js";

export const AI_JOB_HANDLER = Symbol("AI_JOB_HANDLER");

export type AiJobHandlerResult =
  | Readonly<{ outcome: "SUCCEEDED" }>
  | Readonly<{ outcome: "SUPPRESSED"; reasonCode: string }>;

export interface AiJobHandler {
  handle(job: ClaimedAiJob): Promise<AiJobHandlerResult>;
}

export class RetryableAiJobError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "RetryableAiJobError";
  }
}

export class TerminalAiJobError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "TerminalAiJobError";
  }
}
