import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
} from "openai";

import {
  OpeningOutputV1Fixture,
  type OpeningContextV1,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../../config/environment.js";
import {
  AiGatewayUnavailableError,
} from "../../modules/ai-provider/ai-gateway.js";
import type { AiGatewayInvocationError } from "../../modules/ai-provider/ai-gateway.js";
import { openingTask } from "../../modules/ai-provider/ai-task.catalog.js";
import { bookBuilderResearchTask } from "../../modules/book-builder/book-builder.tasks.js";
import {
  OpenAiGateway,
  type OpenAiClient,
} from "./openai-ai.gateway.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "worker",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "a".repeat(32),
  openAiEvaluatorModel: "evaluator-model",
  openAiHostModel: "host-model",
  openAiTimeoutMs: 20_000,
};

const input = {
  schemaVersion: "opening-context.v1",
} as unknown as OpeningContextV1;

describe("OpenAiGateway", () => {
  it("uses stateless non-streaming Responses Structured Outputs", async () => {
    let request: Record<string, unknown> | undefined;
    const client = {
      responses: {
        parse: (body: Record<string, unknown>) => {
          request = body;
          return Promise.resolve({
            id: "resp_test_1",
            output_parsed: OpeningOutputV1Fixture,
            usage: {
              input_tokens: 100,
              output_tokens: 30,
              total_tokens: 130,
              output_tokens_details: { reasoning_tokens: 10 },
            },
          });
        },
      },
    } as unknown as OpenAiClient;
    const subject = new OpenAiGateway(environment, client);

    const result = await subject.generate(openingTask, input);

    expect(result.output).toEqual(OpeningOutputV1Fixture);
    expect(result.run).toMatchObject({
      provider: "OPENAI",
      model: "host-model",
      taskAlias: "OPENING_V1",
      promptVersion: "opening.v1",
      usage: {
        inputTokens: 100,
        outputTokens: 30,
        reasoningTokens: 10,
        totalTokens: 130,
      },
    });
    expect(request).toMatchObject({
      model: "host-model",
      store: false,
      reasoning: { effort: "low" },
      input: JSON.stringify(input),
    });
    expect(request).not.toHaveProperty("previous_response_id");
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("stream");
    expect(request?.text).toEqual(
      expect.objectContaining({
        format: expect.objectContaining({ type: "json_schema" }),
      }),
    );
  });

  it("classifies a missing parsed output without exposing provider content", async () => {
    const client = {
      responses: {
        parse: () =>
          Promise.resolve({
            id: "resp_missing",
            output_parsed: null,
            usage: null,
          }),
      },
    } as unknown as OpenAiClient;
    const subject = new OpenAiGateway(environment, client);

    await expect(subject.generate(openingTask, input)).rejects.toEqual(
      expect.objectContaining({
        name: "AiGatewayInvocationError",
        code: "AI_PROVIDER_STRUCTURED_OUTPUT_MISSING",
        retryable: true,
      } satisfies Partial<AiGatewayInvocationError>),
    );
  });

  it.each([
    [new APIConnectionTimeoutError(), "AI_PROVIDER_TIMEOUT"],
    [new APIConnectionError({ message: "offline" }), "AI_PROVIDER_CONNECTION_FAILED"],
  ])("maps retryable transport failures to content-free codes", async (error, code) => {
    const client = {
      responses: {
        parse: () => Promise.reject(error),
      },
    } as unknown as OpenAiClient;
    const subject = new OpenAiGateway(environment, client);

    await expect(subject.generate(openingTask, input)).rejects.toEqual(
      expect.objectContaining({
        name: "AiGatewayInvocationError",
        code,
        retryable: true,
      } satisfies Partial<AiGatewayInvocationError>),
    );
  });

  it("fails explicitly when the worker key is not configured", async () => {
    const subject = new OpenAiGateway(environment, undefined);

    await expect(subject.generate(openingTask, input)).rejects.toBeInstanceOf(
      AiGatewayUnavailableError,
    );
  });

  it("enables web search only for a task that explicitly requests it", async () => {
    let request: Record<string, unknown> | undefined;
    const client = {
      responses: {
        parse: (body: Record<string, unknown>) => {
          request = body;
          return Promise.resolve({
            id: "resp_builder_1",
            output_parsed: {
              schemaVersion: "book-builder-research.v1",
              book: {
                title: "데미안",
                author: "헤르만 헤세",
                publisher: null,
                publicationYear: null,
                genre: null,
                edition: null,
                translator: null,
                isbn: null,
                identityNote: null,
              },
              sources: [],
              claims: [],
            },
            usage: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2,
              output_tokens_details: { reasoning_tokens: 0 },
            },
          });
        },
      },
    } as unknown as OpenAiClient;
    const subject = new OpenAiGateway(environment, client);

    await subject.generate(bookBuilderResearchTask, { book: "데미안" });

    expect(request?.tools).toEqual([{ type: "web_search" }]);
    expect(request).toMatchObject({ store: false });
  });
});
