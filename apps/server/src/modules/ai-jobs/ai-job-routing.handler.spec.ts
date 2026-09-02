import { describe, expect, it } from "vitest";

import {
  AiJobEnvelopeV1Fixture,
  LivingWikiVersionV1Fixture,
  PolicyInterventionDecisionV1Fixture,
  PolicyWaitDecisionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
} from "@bookseasoning/contracts/internal";

import type { HostInterventionService } from "../ai-host/host-intervention.service.js";
import { HostInterventionApplicationError } from "../ai-host/host-intervention.service.js";
import type { OpeningService } from "../ai-host/opening.service.js";
import type { PublicEvaluationService } from "../public-evaluator/public-evaluation.service.js";
import type { PolicyApplicationService } from "../policy/policy-application.service.js";
import { DeterministicPolicyError } from "../policy/deterministic-policy.engine.js";
import { LivingWikiPatchError } from "../living-wiki/living-wiki-patch.engine.js";
import {
  PublicEvaluatorUnavailableError,
} from "../public-evaluator/public-evaluator.js";
import { PublicEvaluatorValidationError } from "../public-evaluator/public-evaluator-output.validator.js";
import { RetryableAiJobError } from "./ai-job.handler.js";
import { AiJobRoutingHandler } from "./ai-job-routing.handler.js";
import type { ClaimedAiJob } from "./ai-job.queue.js";
import type { AiOrchestrationRepository } from "./ai-orchestration.repository.js";
import type { ExtensionOpinionService } from "./extension-opinion.service.js";
import type { AiOrchestrationDirective } from "./ai-orchestration.repository.js";

const job: ClaimedAiJob = {
  ...AiJobEnvelopeV1Fixture,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T04:01:00.000Z",
};

const handler = (
  evaluate: (...args: unknown[]) => Promise<unknown>,
  decideAndCommit: () => Promise<unknown> = () =>
    Promise.resolve({
      decision: PolicyWaitDecisionV1Fixture,
      commit: {
        policyActionId: "a6000000-0000-4000-8000-000000000001",
        status: "COMMITTED",
      },
    }),
  open: () => Promise<unknown> = () =>
    Promise.resolve({ commit: { status: "COMMITTED" } }),
  generate: () => Promise<unknown> = () =>
    Promise.resolve({ commit: { status: "COMMITTED" } }),
  directive: AiOrchestrationDirective | null = null,
  refreshStaleJob: () => Promise<boolean> = () => Promise.resolve(false),
  commitExtension: () => Promise<unknown> = () =>
    Promise.resolve({ status: "COMMITTED" }),
) =>
  new AiJobRoutingHandler(
    { evaluate } as unknown as PublicEvaluationService,
    { decideAndCommit } as unknown as PolicyApplicationService,
    { open } as unknown as OpeningService,
    { generate } as unknown as HostInterventionService,
    {
      readDirective: () => Promise.resolve(directive),
      refreshStaleJob,
    } as unknown as AiOrchestrationRepository,
    { commit: commitExtension } as unknown as ExtensionOpinionService,
    { synthesize: () => Promise.resolve({ commit: { status: "COMMITTED" } }) } as never,
    { finalize: () => Promise.resolve({ insufficient: true }) } as never,
    { create: () => Promise.resolve({ commit: { status: "COMMITTED" } }) } as never,
  );

describe("AiJobRoutingHandler", () => {
  it("routes an Opening job without invoking the Evaluator", async () => {
    let evaluationCalls = 0;
    let openingCalls = 0;
    const subject = handler(
      () => {
        evaluationCalls += 1;
        return Promise.resolve({});
      },
      undefined,
      () => {
        openingCalls += 1;
        return Promise.resolve({ commit: { status: "COMMITTED" } });
      },
    );

    await expect(
      subject.handle({
        ...job,
        jobType: "OPENING",
        baseWikiVersion: 0,
        targetThroughSeq: 0,
        taskSchemaVersion: "opening-output.v1",
      }),
    ).resolves.toEqual({ outcome: "SUCCEEDED" });
    expect(openingCalls).toBe(1);
    expect(evaluationCalls).toBe(0);
  });

  it("marks a committed public evaluation successful", async () => {
    const subject = handler(() =>
      Promise.resolve({
        context: {},
        output: {},
        commit: {
          status: "COMMITTED",
          evaluationId: "a5000000-0000-4000-8000-000000000001",
          committedWikiVersion: 2,
        },
      }),
    );

    await expect(subject.handle(job)).resolves.toEqual({ outcome: "SUCCEEDED" });
  });

  it("enables same-cursor reuse only for an explicit SILENCE trigger", async () => {
    let evaluationOptions: unknown;
    const subject = handler(
      (_job, options) => {
        evaluationOptions = options;
        return Promise.resolve({
          context: {},
          output: {},
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
          },
        });
      },
      undefined,
      undefined,
      undefined,
      {
        trigger: "SILENCE",
        hostHelpReason: null,
        extensionPhaseVersion: null,
        refreshNo: 0,
      },
    );

    await expect(subject.handle(job)).resolves.toEqual({ outcome: "SUCCEEDED" });
    expect(evaluationOptions).toEqual({ reuseSameCursor: true });
  });

  it("passes an explicit host-help trigger and reason to Policy", async () => {
    let policyInput: unknown;
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: {},
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
            document: {},
          },
        }),
      (input?: unknown) => {
        policyInput = input;
        return Promise.resolve({
          decision: PolicyInterventionDecisionV1Fixture,
          commit: {
            policyActionId: "a6000000-0000-4000-8000-000000000001",
            status: "COMMITTED",
          },
        });
      },
      undefined,
      undefined,
      {
        trigger: "HOST_HELP",
        hostHelpReason: "DISCUSSION_STUCK_OR_REPETITIVE",
        extensionPhaseVersion: null,
        refreshNo: 0,
      },
    );

    await expect(subject.handle(job)).resolves.toEqual({ outcome: "SUCCEEDED" });
    expect(policyInput).toMatchObject({
      trigger: "HOST_HELP",
      hostHelpReason: "DISCUSSION_STUCK_OR_REPETITIVE",
    });
  });

  it("commits an extension opinion for an explicit extension trigger", async () => {
    let opinionCalls = 0;
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: {},
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
          },
        }),
      () =>
        Promise.resolve({
          decision: {
            ...PolicyWaitDecisionV1Fixture,
            trigger: "EXTENSION_DECISION",
          },
          commit: {
            policyActionId: "a6000000-0000-4000-8000-000000000001",
            status: "COMMITTED",
          },
        }),
      undefined,
      undefined,
      {
        trigger: "EXTENSION_DECISION",
        hostHelpReason: null,
        extensionPhaseVersion: 2,
        refreshNo: 0,
      },
      undefined,
      () => {
        opinionCalls += 1;
        return Promise.resolve({ status: "COMMITTED" });
      },
    );

    await expect(subject.handle(job)).resolves.toEqual({ outcome: "SUCCEEDED" });
    expect(opinionCalls).toBe(1);
  });

  it("generates one Host message for a committed non-WAIT Policy action", async () => {
    let hostCalls = 0;
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: PublicEvaluatorOutputV1Fixture,
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
            document: LivingWikiVersionV1Fixture.document,
          },
        }),
      () =>
        Promise.resolve({
          decision: PolicyInterventionDecisionV1Fixture,
          commit: {
            status: "COMMITTED",
            policyActionId: "a6000000-0000-4000-8000-000000000001",
          },
        }),
      undefined,
      () => {
        hostCalls += 1;
        return Promise.resolve({ commit: { status: "COMMITTED" } });
      },
    );

    await expect(subject.handle(job)).resolves.toEqual({ outcome: "SUCCEEDED" });
    expect(hostCalls).toBe(1);
  });

  it("fails an automatic Host generation closed without blocking discussion", async () => {
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: PublicEvaluatorOutputV1Fixture,
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
            document: LivingWikiVersionV1Fixture.document,
          },
        }),
      () =>
        Promise.resolve({
          decision: PolicyInterventionDecisionV1Fixture,
          commit: {
            status: "COMMITTED",
            policyActionId: "a6000000-0000-4000-8000-000000000001",
          },
        }),
      undefined,
      () =>
        Promise.reject(
          new HostInterventionApplicationError("AI_PROVIDER_RATE_LIMITED", true),
        ),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "HOST_INTERVENTION_FAILED_SAFE",
    });
  });

  it("suppresses a Policy action when commit-time freshness changed", async () => {
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: {},
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
          },
        }),
      () =>
        Promise.resolve({
          commit: {
            status: "SUPPRESSED_STALE",
            suppressionReason: "POLICY_CURSOR_ADVANCED",
          },
        }),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "POLICY_CURSOR_ADVANCED",
    });
  });

  it("fails a deterministic Policy error closed without a user-facing effect", async () => {
    const subject = handler(
      () =>
        Promise.resolve({
          context: {},
          output: {},
          commit: {
            status: "COMMITTED",
            evaluationId: "a5000000-0000-4000-8000-000000000001",
            committedWikiVersion: 2,
          },
        }),
      () =>
        Promise.reject(new DeterministicPolicyError("POLICY_INPUT_INVALID")),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "POLICY_FAILED_CLOSED_WAIT",
    });
  });

  it("preserves stale suppression and its requeue recommendation", async () => {
    const subject = handler(() =>
      Promise.resolve({
        commit: { status: "SUPPRESSED_STALE_BASE", shouldRequeue: true },
      }),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "SUPPRESSED_STALE_BASE_REQUEUE_REQUIRED",
    });
  });

  it("suppresses evaluation safely while the provider adapter is absent", async () => {
    const subject = handler(() =>
      Promise.reject(new PublicEvaluatorUnavailableError()),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "EVALUATOR_PROVIDER_NOT_CONFIGURED",
    });
  });

  it("suppresses a Closing-phase job before any user-facing effect", async () => {
    const subject = handler(() =>
      Promise.reject(
        new PublicEvaluatorValidationError(
          "PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED",
        ),
      ),
    );

    await expect(subject.handle(job)).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "EVALUATION_PHASE_NOT_ALLOWED",
    });
  });

  it("classifies invalid structured output as retryable", async () => {
    const subject = handler(() =>
      Promise.reject(
        new PublicEvaluatorValidationError("PUBLIC_EVALUATOR_OUTPUT_INVALID"),
      ),
    );

    await expect(subject.handle(job)).rejects.toBeInstanceOf(RetryableAiJobError);
  });

  it("preserves a semantic Living Wiki failure as a safe retry code", async () => {
    const subject = handler(() =>
      Promise.reject(new LivingWikiPatchError("LIVING_WIKI_RELATION_INVALID")),
    );

    await expect(subject.handle(job)).rejects.toEqual(
      expect.objectContaining({
        name: "RetryableAiJobError",
        code: "LIVING_WIKI_RELATION_INVALID",
      }),
    );
  });

  it("keeps later Host jobs explicitly disconnected", async () => {
    let calls = 0;
    const subject = handler(() => {
      calls += 1;
      return Promise.resolve({});
    });

    await expect(
      subject.handle({ ...job, jobType: "HOST_HELP" }),
    ).resolves.toEqual({
      outcome: "SUPPRESSED",
      reasonCode: "S5_HANDLER_NOT_CONNECTED",
    });
    expect(calls).toBe(0);
  });
});
