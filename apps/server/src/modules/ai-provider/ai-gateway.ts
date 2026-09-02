import type { z } from "zod";

import type {
  AiProviderRunV1,
  AiReasoningEffort,
  AiTaskAlias,
} from "@bookseasoning/contracts/internal";

export const AI_GATEWAY = Symbol("AI_GATEWAY");

export type AiModelAlias = "EVALUATOR_FAST" | "HOST_QUALITY";

export type AiStructuredTask<T> = Readonly<{
  taskAlias: AiTaskAlias;
  modelAlias: AiModelAlias;
  reasoningEffort: AiReasoningEffort;
  promptVersion: string;
  outputSchemaVersion: string;
  outputSchemaName: string;
  outputSchema: z.ZodType<T>;
  instructions: string;
  maxOutputTokens: number;
  webSearch?: boolean;
}>;

export type AiGatewayResult<T> = Readonly<{
  output: T;
  run: AiProviderRunV1;
}>;

export type AiGatewayFailureRun = Readonly<{
  taskAlias: AiTaskAlias;
  promptVersion: string;
  outputSchemaVersion: string;
  provider: "OPENAI";
  model: string;
  reasoningEffort: AiReasoningEffort;
  latencyMs: number;
}>;

export interface AiGateway {
  readonly configured: boolean;

  generate<T>(
    task: AiStructuredTask<T>,
    input: unknown,
  ): Promise<AiGatewayResult<T>>;
}

export class AiGatewayUnavailableError extends Error {
  public constructor() {
    super("AI_PROVIDER_NOT_CONFIGURED");
    this.name = "AiGatewayUnavailableError";
  }
}

export class AiGatewayInvocationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    public readonly run: AiGatewayFailureRun,
  ) {
    super(code);
    this.name = "AiGatewayInvocationError";
  }
}
