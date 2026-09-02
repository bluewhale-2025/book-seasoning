import { describe, expect, it } from "vitest";

import {
  HostInterventionOutputV1Fixture,
  LivingWikiVersionV1Fixture,
  PolicyInterventionDecisionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
} from "@bookseasoning/contracts/internal";

import { AiGatewayInvocationError } from "../ai-provider/ai-gateway.js";
import type { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import { evaluatorContext, evaluatorJob } from "../public-evaluator/public-evaluator.fixture.js";
import type { AiPublicMessageRepository } from "./ai-public-message.repository.js";
import { HostContextBuilder } from "./host-context.builder.js";
import {
  HostInterventionService,
} from "./host-intervention.service.js";
import type { HostInterventionApplicationError } from "./host-intervention.service.js";
import type { HostOutputValidator } from "./host-output.validator.js";

const providerRun = {
  schemaVersion: "ai-provider-run.v1" as const,
  taskAlias: "HOST_INTERVENTION_V1" as const,
  promptVersion: "host-intervention.v1",
  outputSchemaVersion: "host-intervention-output.v1",
  provider: "OPENAI" as const,
  model: "host-model",
  reasoningEffort: "low" as const,
  responseId: "resp_host_test",
  latencyMs: 25,
  requestMetrics: {
    inputBytes: 10,
    instructionsBytes: 5,
    outputSchemaBytes: 20,
    totalRequestBytes: 35,
    maxOutputTokens: 1_500,
  },
  usage: null,
};

const input = {
  job: evaluatorJob,
  publicContext: evaluatorContext,
  evaluation: PublicEvaluatorOutputV1Fixture,
  committedWiki: LivingWikiVersionV1Fixture.document,
  policyActionId: "a6000000-0000-4000-8000-000000000001",
  policy: PolicyInterventionDecisionV1Fixture,
};

describe("HostInterventionService", () => {
  it("commits only provider output that passed the Host validator", async () => {
    const captured: { commit?: unknown; failure?: unknown } = {};
    const subject = new HostInterventionService(
      new HostContextBuilder(),
      {
        generate: () =>
          Promise.resolve({ output: HostInterventionOutputV1Fixture, run: providerRun }),
      } as unknown as AiGenerationService,
      {
        validate: (_context: unknown, output: unknown) => Promise.resolve(output),
      } as unknown as HostOutputValidator,
      {
        commitHostIntervention: (value: unknown) => {
          captured.commit = value;
          return Promise.resolve({
            status: "COMMITTED",
            messageId: "91000000-0000-4000-8000-000000000010",
            messageSeq: 5,
            suppressionReason: null,
            duplicate: false,
            phaseTransitioned: false,
          });
        },
        failHostIntervention: (value: unknown) => {
          captured.failure = value;
          return Promise.resolve();
        },
      } as unknown as AiPublicMessageRepository,
    );

    await expect(subject.generate(input)).resolves.toEqual({
      commit: expect.objectContaining({ status: "COMMITTED" }),
    });
    expect(captured.commit).toEqual(
      expect.objectContaining({
        policyActionId: input.policyActionId,
        output: HostInterventionOutputV1Fixture,
        providerRun,
      }),
    );
    expect(captured.failure).toBeUndefined();
  });

  it("records a content-free failure code when generation fails", async () => {
    const captured: { failure?: unknown } = {};
    const failureRun = {
      taskAlias: providerRun.taskAlias,
      promptVersion: providerRun.promptVersion,
      outputSchemaVersion: providerRun.outputSchemaVersion,
      provider: providerRun.provider,
      model: providerRun.model,
      reasoningEffort: providerRun.reasoningEffort,
      latencyMs: providerRun.latencyMs,
      requestMetrics: {
        inputBytes: 10,
        instructionsBytes: 10,
        outputSchemaBytes: 10,
        totalRequestBytes: 30,
        maxOutputTokens: 1_500,
      },
    };
    const subject = new HostInterventionService(
      new HostContextBuilder(),
      {
        generate: () =>
          Promise.reject(
            new AiGatewayInvocationError(
              "AI_PROVIDER_RATE_LIMITED",
              true,
              failureRun,
            ),
          ),
      } as unknown as AiGenerationService,
      {} as HostOutputValidator,
      {
        failHostIntervention: (value: unknown) => {
          captured.failure = value;
          return Promise.resolve();
        },
      } as unknown as AiPublicMessageRepository,
    );

    await expect(subject.generate(input)).rejects.toEqual(
      expect.objectContaining({
        code: "AI_PROVIDER_RATE_LIMITED",
        retryable: true,
      } satisfies Partial<HostInterventionApplicationError>),
    );
    expect(captured.failure).toEqual({
      job: input.job,
      policyActionId: input.policyActionId,
      errorCode: "AI_PROVIDER_RATE_LIMITED",
    });
  });
});
