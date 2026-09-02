import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  PublicEvaluatorOutputV1Fixture,
  type PublicContextV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type { PublicContextBuilder } from "../ai-context/public-context.builder.js";
import type {
  PublicEvidenceResolver,
  ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";
import { LivingWikiCommitService } from "../living-wiki/living-wiki-commit.service.js";
import { LivingWikiEvaluatorConsistencyValidator } from "../living-wiki/living-wiki-evaluator-consistency.validator.js";
import { LivingWikiPatchEngine } from "../living-wiki/living-wiki-patch.engine.js";
import type {
  CommitLivingWikiCandidateInput,
  LivingWikiCommitResult,
  LivingWikiRepository,
} from "../living-wiki/living-wiki.repository.js";
import { TopicCheckpointValidator } from "../living-wiki/topic-checkpoint.validator.js";
import { PublicEvaluationService } from "./public-evaluation.service.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";
import type {
  PublicEvaluator,
  PublicEvaluatorInput,
} from "./public-evaluator.js";
import { evaluatorContext, evaluatorJob } from "./public-evaluator.fixture.js";

class FakeContextBuilder {
  public readonly calls: unknown[] = [];

  public constructor(private readonly context: PublicContextV1) {}

  public build(input: unknown): Promise<PublicContextV1> {
    this.calls.push(input);
    return Promise.resolve(this.context);
  }
}

class FakeEvaluator implements PublicEvaluator {
  public readonly calls: PublicEvaluatorInput[] = [];

  public constructor(private readonly output: unknown) {}

  public evaluate(input: PublicEvaluatorInput): Promise<unknown> {
    this.calls.push(input);
    return Promise.resolve(this.output);
  }
}

class FakeEvidenceResolver implements PublicEvidenceResolver {
  public resolve(
    _scope: Parameters<PublicEvidenceResolver["resolve"]>[0],
    references: readonly PublicEvidenceRef[],
  ): Promise<readonly ResolvedPublicEvidence[]> {
    return Promise.resolve(
      references.map((reference) => ({ reference }) as ResolvedPublicEvidence),
    );
  }
}

class FakeLivingWikiRepository implements LivingWikiRepository {
  public readonly calls: CommitLivingWikiCandidateInput[] = [];

  public constructor(
    private readonly result: LivingWikiCommitResult = {
      evaluationId: AiEngineFixtureIds.evaluationId,
      status: "COMMITTED",
      committedWikiVersion: 1,
      currentWikiVersion: 1,
      currentBasedThroughSeq: 4,
      wroteWikiVersion: false,
      shouldRequeue: false,
    },
  ) {}

  public commitCandidate(input: CommitLivingWikiCandidateInput) {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }

  public commitInsufficientFinal() {
    return Promise.resolve(this.result);
  }
}

const createSubject = (
  output: unknown = PublicEvaluatorOutputV1Fixture,
  repository = new FakeLivingWikiRepository(),
  context: PublicContextV1 = evaluatorContext,
) => {
  const contextBuilder = new FakeContextBuilder(context);
  const evaluator = new FakeEvaluator(output);
  const resolver = new FakeEvidenceResolver();
  const commitService = new LivingWikiCommitService(
    new LivingWikiPatchEngine(resolver),
    new TopicCheckpointValidator(),
    new LivingWikiEvaluatorConsistencyValidator(),
    repository,
  );
  return {
    contextBuilder,
    evaluator,
    repository,
    subject: new PublicEvaluationService(
      contextBuilder as unknown as PublicContextBuilder,
      evaluator,
      new PublicEvaluatorOutputValidator(resolver),
      commitService,
    ),
  };
};

describe("PublicEvaluationService", () => {
  it("runs the fake Evaluator through context, semantic validation and Wiki commit", async () => {
    const { subject, contextBuilder, evaluator, repository } = createSubject();

    await expect(subject.evaluate(evaluatorJob)).resolves.toMatchObject({
      output: { schemaVersion: "public-evaluator-output.v1" },
      commit: {
        evaluationId: AiEngineFixtureIds.evaluationId,
        status: "COMMITTED",
      },
    });
    expect(contextBuilder.calls).toEqual([
      {
        sessionId: evaluatorJob.sessionId,
        baseWikiVersion: 1,
        targetThroughSeq: 4,
      },
    ]);
    expect(evaluator.calls[0]).toMatchObject({ task: "INCREMENTAL" });
    expect(repository.calls).toHaveLength(1);
  });

  it("returns stale suppression without treating the generated output as committed", async () => {
    const repository = new FakeLivingWikiRepository({
      evaluationId: AiEngineFixtureIds.evaluationId,
      status: "SUPPRESSED_STALE_BASE",
      committedWikiVersion: null,
      currentWikiVersion: 2,
      currentBasedThroughSeq: 3,
      wroteWikiVersion: false,
      shouldRequeue: true,
    });
    const { subject } = createSubject(PublicEvaluatorOutputV1Fixture, repository);

    await expect(subject.evaluate(evaluatorJob)).resolves.toMatchObject({
      commit: { status: "SUPPRESSED_STALE_BASE", shouldRequeue: true },
    });
  });

  it("canonicalizes duplicated Wiki metrics from the validated evaluation", async () => {
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        depth: {
          level: "LOW",
          reasonCodes: ["REACTIONS_OR_ASSERTIONS_ONLY"],
          evidenceRefs: PublicEvaluatorOutputV1Fixture.metrics.depth.evidenceRefs,
        },
      },
    };
    const { subject, repository } = createSubject(output);

    await expect(subject.evaluate(evaluatorJob)).resolves.toMatchObject({
      output: { metrics: output.metrics },
    });
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.document.metricsAndKeyChanges.metrics).toEqual(
      output.metrics,
    );
  });

  it("checks phase before calling the Evaluator", async () => {
    const { subject, evaluator, repository } = createSubject(
      PublicEvaluatorOutputV1Fixture,
      undefined,
      {
        ...evaluatorContext,
        session: { ...evaluatorContext.session, phase: "CLOSING" },
      },
    );

    await expect(subject.evaluate(evaluatorJob)).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED",
    });
    expect(evaluator.calls).toEqual([]);
    expect(repository.calls).toEqual([]);
  });
});
