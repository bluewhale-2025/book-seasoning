import { Inject, Injectable } from "@nestjs/common";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  AiProviderRunV1Schema,
  type AiReasoningEffort,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
  type AiGateway,
  type AiGatewayFailureRun,
  type AiGatewayResult,
  type AiModelAlias,
  type AiStructuredTask,
} from "../../modules/ai-provider/ai-gateway.js";

export const OPENAI_CLIENT = Symbol("OPENAI_CLIENT");
export type OpenAiClient = Pick<OpenAI, "responses">;

export function createOpenAiClient(
  environment: RuntimeEnvironment,
): OpenAiClient | undefined {
  if (environment.openAiApiKey === undefined) return undefined;
  return new OpenAI({
    apiKey: environment.openAiApiKey,
    timeout: environment.openAiTimeoutMs ?? 20_000,
    maxRetries: 0,
  });
}

const RETRYABLE_STATUS_CODES = new Set([408, 409, 429]);

@Injectable()
export class OpenAiGateway implements AiGateway {
  public constructor(
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
    @Inject(OPENAI_CLIENT)
    private readonly client: OpenAiClient | undefined,
  ) {}

  public get configured(): boolean {
    return this.client !== undefined;
  }

  public async generate<T>(
    task: AiStructuredTask<T>,
    input: unknown,
  ): Promise<AiGatewayResult<T>> {
    if (this.client === undefined) throw new AiGatewayUnavailableError();
    const model = this.modelFor(task.modelAlias);
    const startedAt = performance.now();
    try {
      const response = await this.client.responses.parse({
        model,
        instructions: task.instructions,
        input: JSON.stringify(input),
        reasoning: { effort: task.reasoningEffort },
        max_output_tokens: task.maxOutputTokens,
        store: false,
        ...(task.webSearch === true
          ? { tools: [{ type: "web_search" as const }] }
          : {}),
        text: {
          format: zodTextFormat(task.outputSchema, task.outputSchemaName),
        },
      });
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      if (response.output_parsed === null) {
        throw new AiGatewayInvocationError(
          "AI_PROVIDER_STRUCTURED_OUTPUT_MISSING",
          true,
          this.failureRun(task, model, latencyMs),
        );
      }
      const output = task.outputSchema.parse(response.output_parsed);
      const usage = response.usage;
      const run = AiProviderRunV1Schema.parse({
        schemaVersion: "ai-provider-run.v1",
        taskAlias: task.taskAlias,
        promptVersion: task.promptVersion,
        outputSchemaVersion: task.outputSchemaVersion,
        provider: "OPENAI",
        model,
        reasoningEffort: task.reasoningEffort,
        responseId: response.id,
        latencyMs,
        usage:
          usage === null || usage === undefined
            ? null
            : {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                reasoningTokens: usage.output_tokens_details.reasoning_tokens,
                totalTokens: usage.total_tokens,
              },
      });
      return { output, run };
    } catch (error) {
      if (error instanceof AiGatewayInvocationError) throw error;
      const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
      throw new AiGatewayInvocationError(
        this.errorCode(error),
        this.isRetryable(error),
        this.failureRun(task, model, latencyMs),
      );
    }
  }

  private modelFor(alias: AiModelAlias): string {
    return alias === "EVALUATOR_FAST"
      ? (this.environment.openAiEvaluatorModel ?? "gpt-5.6-luna")
      : (this.environment.openAiHostModel ?? "gpt-5.6-terra");
  }

  private failureRun<T>(
    task: AiStructuredTask<T>,
    model: string,
    latencyMs: number,
  ): AiGatewayFailureRun {
    return {
      taskAlias: task.taskAlias,
      promptVersion: task.promptVersion,
      outputSchemaVersion: task.outputSchemaVersion,
      provider: "OPENAI",
      model,
      reasoningEffort: task.reasoningEffort as AiReasoningEffort,
      latencyMs,
    };
  }

  private errorCode(error: unknown): string {
    if (error instanceof APIConnectionTimeoutError) {
      return "AI_PROVIDER_TIMEOUT";
    }
    if (error instanceof APIConnectionError) {
      return "AI_PROVIDER_CONNECTION_FAILED";
    }
    if (error instanceof APIError) {
      if (error.status === 401 || error.status === 403) {
        return "AI_PROVIDER_AUTHENTICATION_FAILED";
      }
      if (error.status === 429) return "AI_PROVIDER_RATE_LIMITED";
      if (error.status !== undefined && error.status >= 500) {
        return "AI_PROVIDER_SERVER_ERROR";
      }
      return "AI_PROVIDER_REQUEST_REJECTED";
    }
    return "AI_PROVIDER_INVOCATION_FAILED";
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof APIError)) return true;
    return (
      error.status === undefined ||
      RETRYABLE_STATUS_CODES.has(error.status) ||
      error.status >= 500
    );
  }
}
