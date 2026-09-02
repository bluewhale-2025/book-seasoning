import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  AiProviderRunV1Schema,
  type AiProviderRunV1,
} from "@bookseasoning/contracts/internal";

import {
  AiGatewayInvocationError,
  type AiGateway,
  type AiGatewayFailureRun,
  type AiStructuredTask,
} from "./ai-gateway.js";
import { AiGenerationService } from "./ai-generation.service.js";
import type { AiProviderRunRepository } from "./ai-provider-run.repository.js";

const OutputSchema = z.strictObject({ value: z.string() });
const task = {
  taskAlias: "PUBLIC_EVALUATOR_FINAL_V1",
  modelAlias: "EVALUATOR_FAST",
  reasoningEffort: "low",
  promptVersion: "public-evaluator.v2",
  outputSchemaVersion: "public-evaluator-output.v1",
  outputSchemaName: "public_evaluator_output_v1",
  outputSchema: OutputSchema,
  instructions: "test",
  maxOutputTokens: 10,
} satisfies AiStructuredTask<z.infer<typeof OutputSchema>>;

const successRun: AiProviderRunV1 = AiProviderRunV1Schema.parse({
  schemaVersion: "ai-provider-run.v1",
  taskAlias: task.taskAlias,
  promptVersion: task.promptVersion,
  outputSchemaVersion: task.outputSchemaVersion,
  provider: "OPENAI",
  model: "evaluator-model",
  reasoningEffort: "low",
  responseId: "resp_test",
  latencyMs: 20,
  requestMetrics: {
    inputBytes: 10,
    instructionsBytes: 4,
    outputSchemaBytes: 20,
    totalRequestBytes: 34,
    maxOutputTokens: 10,
  },
  usage: {
    inputTokens: 1,
    outputTokens: 1,
    reasoningTokens: 0,
    totalTokens: 2,
  },
});

const failureRun: AiGatewayFailureRun = {
  taskAlias: task.taskAlias,
  promptVersion: task.promptVersion,
  outputSchemaVersion: task.outputSchemaVersion,
  provider: "OPENAI",
  model: "evaluator-model",
  reasoningEffort: "low",
  latencyMs: 20,
  requestMetrics: {
    inputBytes: 10,
    instructionsBytes: 4,
    outputSchemaBytes: 20,
    totalRequestBytes: 34,
    maxOutputTokens: 10,
  },
};

const correlation = {
  jobId: "f1000000-0000-4000-8000-000000000001",
  attemptNo: 1,
};

function dependencies() {
  const gateway = {
    configured: true,
    generate: vi.fn(),
  } satisfies AiGateway;
  const repository = {
    recordSuccess: vi.fn(),
    recordFailure: vi.fn(),
  } satisfies AiProviderRunRepository;
  return { gateway, repository };
}

describe("AiGenerationService", () => {
  it("returns a generated result after its provider run is persisted", async () => {
    const { gateway, repository } = dependencies();
    gateway.generate.mockResolvedValue({ output: { value: "ok" }, run: successRun });
    const subject = new AiGenerationService(gateway, repository);

    await expect(subject.generate(correlation, task, {})).resolves.toEqual({
      output: { value: "ok" },
      run: successRun,
    });
    expect(repository.recordSuccess).toHaveBeenCalledWith({
      ...correlation,
      run: successRun,
    });
  });

  it("preserves a provider failure when its diagnostic row is persisted", async () => {
    const { gateway, repository } = dependencies();
    const providerError = new AiGatewayInvocationError(
      "AI_PROVIDER_TIMEOUT",
      true,
      failureRun,
    );
    gateway.generate.mockRejectedValue(providerError);
    const subject = new AiGenerationService(gateway, repository);

    await expect(subject.generate(correlation, task, {})).rejects.toBe(providerError);
    expect(repository.recordFailure).toHaveBeenCalledWith({
      ...correlation,
      taskAlias: task.taskAlias,
      errorCode: "AI_PROVIDER_TIMEOUT",
      run: failureRun,
    });
  });

  it("classifies a success diagnostic write failure without provider content", async () => {
    const { gateway, repository } = dependencies();
    gateway.generate.mockResolvedValue({ output: { value: "ok" }, run: successRun });
    repository.recordSuccess.mockRejectedValue(new Error("database detail"));
    const subject = new AiGenerationService(gateway, repository);

    await expect(subject.generate(correlation, task, {})).rejects.toEqual(
      expect.objectContaining({
        name: "AiGatewayInvocationError",
        code: "AI_PROVIDER_RUN_PERSIST_FAILED",
        retryable: true,
        run: failureRun,
      } satisfies Partial<AiGatewayInvocationError>),
    );
  });

  it("classifies a failure diagnostic write failure instead of masking it as unclassified", async () => {
    const { gateway, repository } = dependencies();
    gateway.generate.mockRejectedValue(
      new AiGatewayInvocationError("AI_PROVIDER_TIMEOUT", true, failureRun),
    );
    repository.recordFailure.mockRejectedValue(new Error("database detail"));
    const subject = new AiGenerationService(gateway, repository);

    await expect(subject.generate(correlation, task, {})).rejects.toEqual(
      expect.objectContaining({
        name: "AiGatewayInvocationError",
        code: "AI_PROVIDER_RUN_PERSIST_FAILED",
        retryable: true,
        run: failureRun,
      } satisfies Partial<AiGatewayInvocationError>),
    );
  });
});
