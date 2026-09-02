import { describe, expect, it } from "vitest";

import {
  BookContextDocumentV1Fixture,
  OpeningContextV1Schema,
  type OpeningContextV1,
} from "@bookseasoning/contracts/internal";

import type { OpeningContextBuilder } from "../ai-context/opening-context.builder.js";
import {
  AiGatewayInvocationError,
  AiGatewayUnavailableError,
} from "../ai-provider/ai-gateway.js";
import type { AiGenerationService } from "../ai-provider/ai-generation.service.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import type { AiPublicMessageRepository } from "./ai-public-message.repository.js";
import type { OpeningOutputValidator } from "./opening-output.validator.js";
import {
  DEFAULT_OPENING_MESSAGE,
  OpeningService,
} from "./opening.service.js";
import type { OpeningApplicationError } from "./opening.service.js";

const job: ClaimedAiJob = {
  schemaVersion: "ai-job.v1",
  jobId: "c0000000-0000-4000-8000-000000000010",
  jobType: "OPENING",
  sessionId: "90000000-0000-4000-8000-000000000001",
  baseWikiVersion: 0,
  targetThroughSeq: 0,
  taskSchemaVersion: "opening-output.v1",
  queueMessageId: "10",
  queueReadCount: 1,
  attemptNo: 3,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T04:01:00.000Z",
};

const context: OpeningContextV1 = OpeningContextV1Schema.parse({
  schemaVersion: "opening-context.v1",
  session: {
    sessionId: job.sessionId,
    roomId: "b6000000-0000-4000-8000-000000000001",
    pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
    phase: "OPENING",
    phaseVersion: 1,
    basedThroughSeq: 0,
  },
  publicPrep: [],
  bookContext: BookContextDocumentV1Fixture,
});

const makeSubject = (error: Error, captured: { input?: unknown }) =>
  new OpeningService(
    { build: () => Promise.resolve(context) } as unknown as OpeningContextBuilder,
    {
      generate: () => Promise.reject(error),
    } as unknown as AiGenerationService,
    {
      assertContext: () => context,
      validate: (_job: unknown, _context: unknown, output: unknown) =>
        Promise.resolve(output),
    } as unknown as OpeningOutputValidator,
    {
      commitOpening: (input: unknown) => {
        captured.input = input;
        return Promise.resolve({
          status: "COMMITTED",
          messageId: "91000000-0000-4000-8000-000000000010",
          messageSeq: 1,
          suppressionReason: null,
          duplicate: false,
          phaseTransitioned: false,
        });
      },
    } as unknown as AiPublicMessageRepository,
  );

describe("OpeningService", () => {
  it("commits the deterministic basic question when provider use is unavailable", async () => {
    const captured: { input?: unknown } = {};
    const subject = makeSubject(new AiGatewayUnavailableError(), captured);

    const result = await subject.open(job);

    expect(result.fallbackUsed).toBe(true);
    expect(result.output.message).toBe(DEFAULT_OPENING_MESSAGE);
    expect(captured.input).toEqual(
      expect.objectContaining({ fallbackUsed: true, providerRun: null }),
    );
  });

  it("uses the Queue retry budget before falling back on a retryable failure", async () => {
    const captured: { input?: unknown } = {};
    const run = {
      taskAlias: "OPENING_V1" as const,
      promptVersion: "opening.v1",
      outputSchemaVersion: "opening-output.v1",
      provider: "OPENAI" as const,
      model: "host-model",
      reasoningEffort: "low" as const,
      latencyMs: 10,
      requestMetrics: {
        inputBytes: 10,
        instructionsBytes: 10,
        outputSchemaBytes: 10,
        totalRequestBytes: 30,
        maxOutputTokens: 1_200,
      },
    };
    const subject = makeSubject(
      new AiGatewayInvocationError("AI_PROVIDER_RATE_LIMITED", true, run),
      captured,
    );

    await expect(subject.open({ ...job, attemptNo: 1 })).rejects.toEqual(
      expect.objectContaining({
        code: "AI_PROVIDER_RATE_LIMITED",
        retryable: true,
      } satisfies Partial<OpeningApplicationError>),
    );
    expect(captured.input).toBeUndefined();
  });
});
