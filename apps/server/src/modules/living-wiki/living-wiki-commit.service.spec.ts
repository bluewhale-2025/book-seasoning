import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  AiEngineMessageEvidenceFixture,
  AiJobEnvelopeV1Fixture,
  BookContextDocumentV1Fixture,
  LivingWikiVersionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import type {
  PublicEvidenceResolver,
  ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";
import { LivingWikiCommitService } from "./living-wiki-commit.service.js";
import { LivingWikiEvaluatorConsistencyValidator } from "./living-wiki-evaluator-consistency.validator.js";
import { LivingWikiPatchEngine } from "./living-wiki-patch.engine.js";
import type {
  CommitLivingWikiCandidateInput,
  LivingWikiCommitResult,
  LivingWikiRepository,
} from "./living-wiki.repository.js";
import { TopicCheckpointValidator } from "./topic-checkpoint.validator.js";

const claimedJob: ClaimedAiJob = {
  ...AiJobEnvelopeV1Fixture,
  queueMessageId: "1",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 3,
  leaseExpiresAt: "2026-09-02T00:01:00.000Z",
};

const committed: LivingWikiCommitResult = {
  evaluationId: AiEngineFixtureIds.evaluationId,
  status: "COMMITTED",
  committedWikiVersion: 2,
  currentWikiVersion: 2,
  currentBasedThroughSeq: 4,
  wroteWikiVersion: false,
  shouldRequeue: false,
};

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

  public constructor(private readonly result: LivingWikiCommitResult = committed) {}

  public commitCandidate(
    input: CommitLivingWikiCandidateInput,
  ): Promise<LivingWikiCommitResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }

  public commitInsufficientFinal(): Promise<LivingWikiCommitResult> {
    return Promise.resolve(this.result);
  }
}

const createSubject = (repository = new FakeLivingWikiRepository()) => ({
  repository,
  subject: new LivingWikiCommitService(
    new LivingWikiPatchEngine(new FakeEvidenceResolver()),
    new TopicCheckpointValidator(),
    new LivingWikiEvaluatorConsistencyValidator(),
    repository,
  ),
});

const input = {
  job: claimedJob,
  roomId: "b6000000-0000-4000-8000-000000000001",
  pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
  currentWiki: LivingWikiVersionV1Fixture,
  evaluatorOutput: PublicEvaluatorOutputV1Fixture,
} as const;

describe("LivingWikiCommitService", () => {
  it("validates and hands an incremental candidate to the repository", async () => {
    const { subject, repository } = createSubject();

    await expect(subject.commitPatch(input)).resolves.toMatchObject({
      status: "COMMITTED",
      committedWikiVersion: 2,
      documentChanged: false,
      cursorAdvanced: false,
    });
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]).toMatchObject({
      jobId: claimedJob.jobId,
      attemptNo: 1,
      kind: "INCREMENTAL",
      baseVersion: 1,
      basedThroughSeq: 4,
    });
  });

  it("returns stale suppression and the re-evaluation recommendation unchanged", async () => {
    const staleRepository = new FakeLivingWikiRepository({
      evaluationId: AiEngineFixtureIds.evaluationId,
      status: "SUPPRESSED_STALE_BASE",
      committedWikiVersion: null,
      currentWikiVersion: 2,
      currentBasedThroughSeq: 3,
      wroteWikiVersion: false,
      shouldRequeue: true,
    });
    const { subject } = createSubject(staleRepository);

    await expect(subject.commitPatch(input)).resolves.toMatchObject({
      status: "SUPPRESSED_STALE_BASE",
      shouldRequeue: true,
    });
  });

  it("canonicalizes duplicated evaluator metrics before validation and storage", async () => {
    const { subject, repository } = createSubject();
    const divergentOutput = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        depth: {
          level: "LOW" as const,
          reasonCodes: ["REACTIONS_OR_ASSERTIONS_ONLY"],
          evidenceRefs:
            PublicEvaluatorOutputV1Fixture.metrics.depth.evidenceRefs,
        },
      },
    };

    await subject.commitPatch({ ...input, evaluatorOutput: divergentOutput });

    expect(repository.calls[0]?.document.metricsAndKeyChanges.metrics).toEqual(
      divergentOutput.metrics,
    );
    expect(
      repository.calls[0]?.evaluatorOutput.wikiPatch.operations.find(
        (operation) => operation.operation === "SET_METRICS_AND_KEY_CHANGES",
      ),
    ).toMatchObject({
      metricsAndKeyChanges: { metrics: divergentOutput.metrics },
    });
  });

  it("commits a topic checkpoint while retaining the previous topic coverage", async () => {
    const { subject, repository } = createSubject();
    const nextTopic = {
      topicId: "b7000000-0000-4000-8000-000000000001",
      title: "좋은 질문이 관계에서 작동하는 조건",
      guidingQuestion: "질문의 힘이 관계에서 생기려면 어떤 조건이 필요할까요?",
      transitionedFromTopicId: AiEngineFixtureIds.topicId,
      changeSummary:
        "질문의 효과에서 그 효과가 생기는 관계적 조건으로 논점이 이동했다.",
      evidenceRefs: [AiEngineMessageEvidenceFixture],
    } as const;
    const checkpointOutput = {
      ...PublicEvaluatorOutputV1Fixture,
      currentTopic: nextTopic,
      wikiPatch: {
        schemaVersion: "living-wiki-patch.v1",
        baseVersion: 1,
        basedThroughSeq: 4,
        operations: [
          {
            operation: "SET_CURRENT_TOPIC",
            baseVersion: 1,
            topic: nextTopic,
          },
        ],
      },
    };

    await subject.commitPatch({
      ...input,
      job: { ...claimedJob, jobType: "TOPIC_CHECKPOINT" },
      evaluatorOutput: checkpointOutput,
    });

    expect(repository.calls[0]?.kind).toBe("TOPIC_CHECKPOINT");
    expect(repository.calls[0]?.document.currentTopic?.topicId).toBe(
      nextTopic.topicId,
    );
    expect(repository.calls[0]?.document.coverage[0]?.subjectId).toBe(
      AiEngineFixtureIds.topicId,
    );
  });

  it("rejects a mismatched Pack before any commit", async () => {
    const { subject, repository } = createSubject();

    await expect(
      subject.commitPatch({
        ...input,
        pinnedPackVersionId: "b8000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_JOB_OUTPUT_MISMATCH" });
    expect(repository.calls).toEqual([]);
  });

  it("does not accept a non-evaluation job as a Wiki writer", async () => {
    const { subject, repository } = createSubject();

    await expect(
      subject.commitPatch({
        ...input,
        job: { ...claimedJob, jobType: "HOST_HELP" },
      }),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_JOB_TYPE_INVALID" });
    expect(repository.calls).toEqual([]);
  });
});
