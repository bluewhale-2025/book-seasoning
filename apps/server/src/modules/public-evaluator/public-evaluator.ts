import type {
  PublicContextV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

export const PUBLIC_EVALUATOR = Symbol("PUBLIC_EVALUATOR");

export type PublicEvaluatorTask = "INCREMENTAL" | "TOPIC_CHECKPOINT" | "FINAL";

export type PublicEvaluatorInput = Readonly<{
  jobId: string;
  attemptNo: number;
  task: PublicEvaluatorTask;
  context: PublicContextV1;
}>;

export interface PublicEvaluator {
  evaluate(input: PublicEvaluatorInput): Promise<unknown>;
}

export class PublicEvaluatorInvocationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = "PublicEvaluatorInvocationError";
  }
}

export class PublicEvaluatorUnavailableError extends Error {
  public constructor() {
    super("PUBLIC_EVALUATOR_NOT_CONFIGURED");
    this.name = "PublicEvaluatorUnavailableError";
  }
}

export type ValidatedPublicEvaluatorOutput = PublicEvaluatorOutputV1;
