import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  AiEngineMessageEvidenceFixture,
  AiPrivateCanaryTokenFixture,
  BookContextDocumentV1Fixture,
  DiscussionMetricsV1Fixture,
  LivingWikiMetricsAndKeyChangesFixture,
  LivingWikiPatchV1Fixture,
  LivingWikiVersionV1Fixture,
  publicEvidenceRefKey,
  type LivingWikiPatchV1,
  type LivingWikiVersionV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  PublicEvidenceResolutionError,
  type PublicEvidenceResolver,
  type PublicEvidenceScope,
  type ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";
import {
  LivingWikiPatchEngine,
  type LivingWikiPatchApplication,
} from "./living-wiki-patch.engine.js";

const scope: PublicEvidenceScope = {
  sessionId: LivingWikiVersionV1Fixture.sessionId,
  roomId: "a9000000-0000-4000-8000-000000000001",
  pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
  targetThroughSeq: 4,
};

class FakeEvidenceResolver implements PublicEvidenceResolver {
  public readonly calls: PublicEvidenceRef[][] = [];

  public constructor(
    private readonly failureCode: string | null = null,
    private readonly complete = true,
  ) {}

  public resolve(
    receivedScope: PublicEvidenceScope,
    references: readonly PublicEvidenceRef[],
  ): Promise<readonly ResolvedPublicEvidence[]> {
    expect(receivedScope).toEqual(scope);
    this.calls.push([...references]);
    if (this.failureCode !== null) {
      return Promise.reject(
        new PublicEvidenceResolutionError(this.failureCode, 0),
      );
    }
    return Promise.resolve(
      (this.complete ? references : []).map(
        (reference) => ({ reference }) as ResolvedPublicEvidence,
      ),
    );
  }
}

const engine = (resolver = new FakeEvidenceResolver()) => ({
  resolver,
  subject: new LivingWikiPatchEngine(resolver),
});

const apply = (
  subject: LivingWikiPatchEngine,
  patch: unknown,
  currentWiki: LivingWikiVersionV1 | null = LivingWikiVersionV1Fixture,
  receivedScope: PublicEvidenceScope = scope,
): Promise<LivingWikiPatchApplication> =>
  subject.apply({ scope: receivedScope, currentWiki, patch });

describe("LivingWikiPatchEngine", () => {
  it("creates the first complete Wiki from an order-independent base-zero patch", async () => {
    const { subject } = engine();
    const initialPatch: LivingWikiPatchV1 = {
      ...LivingWikiPatchV1Fixture,
      baseVersion: 0,
      operations: LivingWikiPatchV1Fixture.operations.map((operation) => ({
        ...operation,
        baseVersion: 0,
      })),
    };

    const result = await apply(subject, initialPatch, null);

    expect(result).toMatchObject({
      baseVersion: 0,
      basedThroughSeq: 4,
      documentChanged: true,
      cursorAdvanced: true,
    });
    expect(result.document).toEqual(LivingWikiVersionV1Fixture.document);
  });

  it("applies typed upsert, remove and coverage operations without mutating the base", async () => {
    const { subject, resolver } = engine();
    const originalBase = structuredClone(LivingWikiVersionV1Fixture);
    const newPerspectiveId = "a1000000-0000-4000-8000-000000000099";
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: 1,
          perspective: {
            perspectiveId: newPerspectiveId,
            summary: "질문의 효과는 관계의 맥락에 따라 달라질 수 있다는 관점",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
            relations: [
              {
                targetPerspectiveId: AiEngineFixtureIds.perspectiveId,
                relation: "EXTENDS",
                evidenceRefs: [AiEngineMessageEvidenceFixture],
              },
            ],
          },
        },
        {
          operation: "REMOVE_BOOK_GROUNDING",
          baseVersion: 1,
          groundingId: AiEngineFixtureIds.groundingId,
          evidenceRefs: [AiEngineMessageEvidenceFixture],
        },
        {
          operation: "UPSERT_ISSUE_OR_QUESTION",
          baseVersion: 1,
          issueOrQuestion: {
            ...LivingWikiVersionV1Fixture.document.issueAndQuestionMap[0]!,
            relatedPerspectiveIds: [
              AiEngineFixtureIds.perspectiveId,
              newPerspectiveId,
            ],
          },
        },
        {
          operation: "UPDATE_COVERAGE",
          baseVersion: 1,
          coverage: {
            subjectType: "PERSPECTIVE",
            subjectId: newPerspectiveId,
            level: "PARTIAL",
            rationale: "새 관점이 제시됐지만 다른 관점과 더 비교할 수 있다.",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
          },
        },
        {
          operation: "UPSERT_PUBLIC_PARTICIPANT_STATE",
          baseVersion: 1,
          participantState: {
            ...LivingWikiVersionV1Fixture.document.participantState[0]!,
            recentActivity: "QUIET",
          },
        },
        {
          operation: "SET_METRICS_AND_KEY_CHANGES",
          baseVersion: 1,
          metricsAndKeyChanges: LivingWikiMetricsAndKeyChangesFixture,
        },
      ],
    };

    const result = await apply(subject, patch);

    expect(result.document.perspectiveMap.at(-1)?.perspectiveId).toBe(
      newPerspectiveId,
    );
    expect(result.document.bookGrounding).toEqual([]);
    expect(result.document.coverage.at(-1)?.subjectId).toBe(newPerspectiveId);
    expect(result.documentChanged).toBe(true);
    expect(result.cursorAdvanced).toBe(false);
    expect(LivingWikiVersionV1Fixture).toEqual(originalBase);
    expect(resolver.calls.length).toBeGreaterThan(0);
  });

  it("validates final relations after all operations, not operation order", async () => {
    const { subject } = engine();
    const firstId = "aa000000-0000-4000-8000-000000000001";
    const secondId = "aa000000-0000-4000-8000-000000000002";
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: 1,
          perspective: {
            perspectiveId: firstId,
            summary: "뒤 operation에서 추가될 관점과 연결되는 첫 관점",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
            relations: [
              {
                targetPerspectiveId: secondId,
                relation: "COMPLEMENTS",
                evidenceRefs: [AiEngineMessageEvidenceFixture],
              },
            ],
          },
        },
        {
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: 1,
          perspective: {
            perspectiveId: secondId,
            summary: "첫 관점의 관계 target이 되는 두 번째 관점",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
            relations: [],
          },
        },
      ],
    };

    await expect(apply(subject, patch)).resolves.toMatchObject({
      documentChanged: true,
    });
  });

  it("rejects a dangling relation atomically and never resolves evidence", async () => {
    const { subject, resolver } = engine();
    const originalBase = structuredClone(LivingWikiVersionV1Fixture);
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: 1,
          perspective: {
            perspectiveId: "ab000000-0000-4000-8000-000000000001",
            summary: "존재하지 않는 관점을 참조하는 잘못된 관점",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
            relations: [
              {
                targetPerspectiveId: "ab000000-0000-4000-8000-000000000099",
                relation: "EXTENDS",
                evidenceRefs: [AiEngineMessageEvidenceFixture],
              },
            ],
          },
        },
      ],
    };

    await expect(apply(subject, patch)).rejects.toMatchObject({
      code: "LIVING_WIKI_RELATION_INVALID",
    });
    expect(LivingWikiVersionV1Fixture).toEqual(originalBase);
    expect(resolver.calls).toEqual([]);
  });

  it("does not cascade a perspective removal that would leave dangling state", async () => {
    const { subject } = engine();
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "REMOVE_PERSPECTIVE",
          baseVersion: 1,
          perspectiveId: AiEngineFixtureIds.perspectiveId,
          evidenceRefs: [AiEngineMessageEvidenceFixture],
        },
      ],
    };

    await expect(apply(subject, patch)).rejects.toMatchObject({
      code: "LIVING_WIKI_RELATION_INVALID",
    });
  });

  it("rejects a missing remove target instead of treating it as success", async () => {
    const { subject } = engine();
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "REMOVE_BOOK_GROUNDING",
          baseVersion: 1,
          groundingId: "ac000000-0000-4000-8000-000000000099",
          evidenceRefs: [AiEngineMessageEvidenceFixture],
        },
      ],
    };

    await expect(apply(subject, patch)).rejects.toMatchObject({
      code: "LIVING_WIKI_REMOVE_TARGET_NOT_FOUND",
      operationIndex: 0,
    });
  });

  it("rejects invalid base, session and cursor envelopes", async () => {
    const { subject } = engine();
    const wrongBasePatch: LivingWikiPatchV1 = {
      ...LivingWikiPatchV1Fixture,
      baseVersion: 0,
      operations: LivingWikiPatchV1Fixture.operations.map((operation) => ({
        ...operation,
        baseVersion: 0,
      })),
    };

    await expect(
      apply(subject, wrongBasePatch),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_BASE_VERSION_MISMATCH" });
    await expect(
      apply(subject, LivingWikiPatchV1Fixture, LivingWikiVersionV1Fixture, {
        ...scope,
        sessionId: "ad000000-0000-4000-8000-000000000099",
      }),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_SESSION_MISMATCH" });
    await expect(
      apply(subject, LivingWikiPatchV1Fixture, LivingWikiVersionV1Fixture, {
        ...scope,
        targetThroughSeq: 5,
      }),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_CURSOR_MISMATCH" });

    const newerBase: LivingWikiVersionV1 = {
      ...LivingWikiVersionV1Fixture,
      version: 2,
      baseVersion: 1,
      basedThroughSeq: 5,
    };
    await expect(
      apply(subject, {
        ...LivingWikiPatchV1Fixture,
        baseVersion: 2,
        operations: LivingWikiPatchV1Fixture.operations.map((operation) => ({
          ...operation,
          baseVersion: 2,
        })),
      }, newerBase),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_CURSOR_REGRESSION" });
  });

  it("locks a FINAL Wiki against further patch application", async () => {
    const { subject } = engine();
    const finalWiki: LivingWikiVersionV1 = {
      ...LivingWikiVersionV1Fixture,
      kind: "FINAL",
    };

    await expect(
      apply(subject, LivingWikiPatchV1Fixture, finalWiki),
    ).rejects.toMatchObject({ code: "LIVING_WIKI_FINAL_LOCKED" });
  });

  it("maps reference resolution failure without returning a partial document", async () => {
    const { subject } = engine(
      new FakeEvidenceResolver("PUBLIC_MESSAGE_NOT_FOUND"),
    );

    await expect(apply(subject, LivingWikiPatchV1Fixture)).rejects.toMatchObject({
      code: "LIVING_WIKI_REFERENCE_INVALID",
      causeCode: "PUBLIC_MESSAGE_NOT_FOUND",
    });
  });

  it("fails closed when a resolver returns an incomplete materialization", async () => {
    const { subject } = engine(new FakeEvidenceResolver(null, false));

    await expect(apply(subject, LivingWikiPatchV1Fixture)).rejects.toMatchObject({
      code: "LIVING_WIKI_REFERENCE_INVALID",
      causeCode: "PUBLIC_EVIDENCE_RESULT_INCOMPLETE",
    });
  });

  it("requires a new topic to transition from the current topic", async () => {
    const { subject } = engine();
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "SET_CURRENT_TOPIC",
          baseVersion: 1,
          topic: {
            topicId: "b9000000-0000-4000-8000-000000000001",
            title: "새로운 실제 논점",
            guidingQuestion: "새 논점은 이전 논점과 어떻게 이어지는가?",
            transitionedFromTopicId:
              "b9000000-0000-4000-8000-000000000099",
            changeSummary: "다른 식별자를 이전 논점으로 잘못 지정했다.",
            evidenceRefs: [AiEngineMessageEvidenceFixture],
          },
        },
      ],
    };

    await expect(apply(subject, patch)).rejects.toMatchObject({
      code: "LIVING_WIKI_TOPIC_TRANSITION_INVALID",
      operationIndex: 0,
    });
  });

  it("rejects private canaries at schema validation before reference access", async () => {
    const { subject, resolver } = engine();
    const patch = {
      ...LivingWikiPatchV1Fixture,
      operations: [
        {
          operation: "UPSERT_PERSPECTIVE",
          baseVersion: 1,
          perspective: {
            ...LivingWikiVersionV1Fixture.document.perspectiveMap[0],
            summary: AiPrivateCanaryTokenFixture,
          },
        },
      ],
    };

    await expect(apply(subject, patch)).rejects.toMatchObject({
      code: "LIVING_WIKI_PATCH_SCHEMA_INVALID",
    });
    expect(resolver.calls).toEqual([]);
  });

  it("batches more than 24 unique evidence references behind one resolver port", async () => {
    const { subject, resolver } = engine();
    const keyChanges = Array.from({ length: 25 }, (_, index) => ({
      changeId: `ae000000-0000-4000-8000-${(index + 1)
        .toString()
        .padStart(12, "0")}`,
      description: `공개 발언으로 확인된 변화 ${index + 1}`,
      evidenceRefs: [
        {
          type: "PUBLIC_PREP" as const,
          prepAnswerId: `af000000-0000-4000-8000-${(index + 1)
            .toString()
            .padStart(12, "0")}`,
        },
      ],
    }));
    const patch: LivingWikiPatchV1 = {
      schemaVersion: "living-wiki-patch.v1",
      baseVersion: 1,
      basedThroughSeq: 4,
      operations: [
        {
          operation: "SET_METRICS_AND_KEY_CHANGES",
          baseVersion: 1,
          metricsAndKeyChanges: {
            metrics: DiscussionMetricsV1Fixture,
            summary: "여러 공개 변화 근거를 batch로 검증한다.",
            keyChanges,
          },
        },
      ],
    };

    await apply(subject, patch);

    expect(resolver.calls.length).toBeGreaterThan(1);
    expect(resolver.calls.every((call) => call.length <= 24)).toBe(true);
    const resolvedKeys = new Set(
      resolver.calls.flat().map((reference) => publicEvidenceRefKey(reference)),
    );
    for (const change of keyChanges) {
      expect(resolvedKeys.has(publicEvidenceRefKey(change.evidenceRefs[0]!))).toBe(
        true,
      );
    }
  });
});
