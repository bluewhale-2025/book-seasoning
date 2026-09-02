import { describe, expect, it } from "vitest";

import {
  AiEngineMessageEvidenceFixture,
  AiEngineSecondMessageEvidenceFixture,
  AiPrivateEvaluatorLeakCanaryFixture,
  PublicEvaluatorOutputV1Fixture,
  type PublicEvaluatorProviderObservationV3,
  type PublicEvaluatorProviderOutputV2,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  indexPublicEvaluatorEvidenceRefs,
  publicContextEvidenceRefs,
} from "../ai-context/public-context-evidence.js";
import type {
  PublicEvidenceResolver,
  ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";
import { evaluatorContext, evaluatorJob } from "./public-evaluator.fixture.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";

const providerOutput = (
  value: unknown = PublicEvaluatorOutputV1Fixture,
  includeWikiPatch = false,
): PublicEvaluatorProviderObservationV3 | PublicEvaluatorProviderOutputV2 => {
  const indexed = indexPublicEvaluatorEvidenceRefs(
    value,
    evaluatorContext,
  ) as PublicEvaluatorProviderOutputV2;
  if (includeWikiPatch) return indexed;
  return Object.fromEntries(
    Object.entries(indexed).filter(([key]) => key !== "wikiPatch"),
  ) as PublicEvaluatorProviderObservationV3;
};
const publicEvaluatorEvidenceAt = (index: number) =>
  publicContextEvidenceRefs(evaluatorContext)[index]!;

class FakeEvidenceResolver implements PublicEvidenceResolver {
  public readonly calls: PublicEvidenceRef[][] = [];

  public constructor(private readonly complete = true) {}

  public resolve(
    _scope: Parameters<PublicEvidenceResolver["resolve"]>[0],
    references: readonly PublicEvidenceRef[],
  ): Promise<readonly ResolvedPublicEvidence[]> {
    this.calls.push([...references]);
    return Promise.resolve(
      (this.complete ? references : []).map(
        (reference) => ({ reference }) as ResolvedPublicEvidence,
      ),
    );
  }
}

describe("PublicEvaluatorOutputValidator", () => {
  it("accepts the seven independent metric observations and PUBLIC evidence", async () => {
    const resolver = new FakeEvidenceResolver();
    const subject = new PublicEvaluatorOutputValidator(resolver);

    await expect(
      subject.validate(
        evaluatorJob,
        evaluatorContext,
        providerOutput(),
      ),
    ).resolves.toEqual({
      ...PublicEvaluatorOutputV1Fixture,
      wikiPatch: {
        schemaVersion: "living-wiki-patch.v1",
        baseVersion: evaluatorJob.baseWikiVersion,
        basedThroughSeq: evaluatorJob.targetThroughSeq,
        operations: [],
      },
    });
    expect(resolver.calls.length).toBeGreaterThan(0);
    expect(resolver.calls.every((call) => call.length <= 24)).toBe(true);
  });

  it("requires the fast incremental provider contract to omit Wiki patch authoring", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );

    await expect(
      subject.validate(
        evaluatorJob,
        evaluatorContext,
        providerOutput(PublicEvaluatorOutputV1Fixture, true),
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_EVALUATOR_OUTPUT_INVALID" });
  });

  it("retains semantic Wiki patch authoring for Topic Checkpoint", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );

    const output = await subject.validate(
      { ...evaluatorJob, jobType: "TOPIC_CHECKPOINT" },
      evaluatorContext,
      providerOutput(PublicEvaluatorOutputV1Fixture, true),
    );

    expect(output.wikiPatch.operations.length).toBeGreaterThan(0);
  });

  it("rejects a reason code assigned to the wrong metric or level", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        depth: {
          ...PublicEvaluatorOutputV1Fixture.metrics.depth,
          reasonCodes: ["RESPONSES_ARE_CONTINUING"],
        },
      },
    };

    await expect(
      subject.validate(
        { ...evaluatorJob, jobType: "TOPIC_CHECKPOINT" },
        evaluatorContext,
        providerOutput(output, true),
      ),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_OUTPUT_INVALID",
    });
  });

  it("allows low Book Grounding with high Expansion/Relevance and WAIT", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        bookGrounding: {
          level: "LOW",
          reasonCodes: ["BOOK_CONNECTION_NOT_OBSERVED"],
          evidenceRefs: [AiEngineMessageEvidenceFixture],
        },
      },
      suggestedAction: "WAIT",
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, providerOutput(output)),
    ).resolves.toMatchObject({ suggestedAction: "WAIT" });
  });

  it("normalizes mechanical provider duplication before semantic validation", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      metrics: {
        ...PublicEvaluatorOutputV1Fixture.metrics,
        depth: {
          ...PublicEvaluatorOutputV1Fixture.metrics.depth,
          evidenceRefs: [
            AiEngineMessageEvidenceFixture,
            AiEngineMessageEvidenceFixture,
          ],
        },
      },
      currentTopic: {
        ...PublicEvaluatorOutputV1Fixture.currentTopic!,
        transitionedFromTopicId:
          PublicEvaluatorOutputV1Fixture.currentTopic!.topicId,
        changeSummary: "같은 논점을 다시 정리했다.",
      },
      wikiPatch: {
        ...PublicEvaluatorOutputV1Fixture.wikiPatch,
        baseVersion: 99,
        basedThroughSeq: 99,
        operations: PublicEvaluatorOutputV1Fixture.wikiPatch.operations.map(
          (operation) => ({ ...operation, baseVersion: 99 }),
        ),
      },
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, providerOutput(output)),
    ).resolves.toMatchObject({
      metrics: {
        depth: { evidenceRefs: [AiEngineMessageEvidenceFixture] },
      },
      currentTopic: {
        transitionedFromTopicId: null,
        changeSummary: null,
      },
      wikiPatch: {
        baseVersion: evaluatorJob.baseWikiVersion,
        basedThroughSeq: evaluatorJob.targetThroughSeq,
      },
    });
  });

  it("restores the exact PUBLIC message reference selected by provider index", async () => {
    const resolver = new FakeEvidenceResolver();
    const subject = new PublicEvaluatorOutputValidator(resolver);
    const indexed = providerOutput() as PublicEvaluatorProviderObservationV3;
    const messageIndex = indexed.currentTopic!.evidenceRefIndexes.find((index) => {
      const reference = publicEvaluatorEvidenceAt(index);
      return reference.type === "MESSAGE" && reference.seqNo === 4;
    });
    expect(messageIndex).toEqual(expect.any(Number));
    const output: PublicEvaluatorProviderObservationV3 = {
      ...indexed,
      currentTopic: {
        ...indexed.currentTopic!,
        evidenceRefIndexes: [messageIndex!],
      },
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, output),
    ).resolves.toMatchObject({
      currentTopic: {
        evidenceRefs: [
          {
            type: "MESSAGE",
            messageId: AiEngineSecondMessageEvidenceFixture.messageId,
            seqNo: 4,
          },
        ],
      },
    });
    expect(resolver.calls.flat()).toContainEqual({
      type: "MESSAGE",
      messageId: AiEngineSecondMessageEvidenceFixture.messageId,
      seqNo: 4,
    });
  });

  it("rejects an evidence index absent from PUBLIC context", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const indexed = providerOutput() as PublicEvaluatorProviderObservationV3;
    const output: PublicEvaluatorProviderObservationV3 = {
      ...indexed,
      currentTopic: {
        ...indexed.currentTopic!,
        evidenceRefIndexes: [999],
      },
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, output),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_EVIDENCE_INDEX_INVALID",
      causeCode: "PUBLIC_EVIDENCE_INDEX_OUT_OF_RANGE",
    });
  });

  it("rejects participant observations outside the session context", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      participation: [
        {
          ...PublicEvaluatorOutputV1Fixture.participation[0],
          participantId: "ba000000-0000-4000-8000-000000000099",
        },
      ],
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, providerOutput(output)),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_PARTICIPANT_NOT_IN_CONTEXT",
    });
  });

  it("requires Book Grounding to connect Pack evidence to public discussion", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      bookGrounding: [
        {
          ...PublicEvaluatorOutputV1Fixture.bookGrounding[0],
          evidenceRefs: [
            PublicEvaluatorOutputV1Fixture.bookGrounding[0]?.bookContextItemRef,
          ],
        },
      ],
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, providerOutput(output)),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_BOOK_GROUNDING_NOT_DISCUSSION_LINKED",
    });
  });

  it("fails closed on incomplete materialization and private canaries", async () => {
    await expect(
      new PublicEvaluatorOutputValidator(
        new FakeEvidenceResolver(false),
      ).validate(evaluatorJob, evaluatorContext, providerOutput()),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_REFERENCE_INVALID",
      causeCode: "PUBLIC_EVIDENCE_RESULT_INCOMPLETE",
    });
    await expect(
      new PublicEvaluatorOutputValidator(new FakeEvidenceResolver()).validate(
        evaluatorJob,
        evaluatorContext,
        AiPrivateEvaluatorLeakCanaryFixture,
      ),
    ).rejects.toMatchObject({ code: "PUBLIC_EVALUATOR_OUTPUT_INVALID" });
  });

  it("revalidates a stored canonical evaluation without provider indexes", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );

    await expect(
      subject.validateCanonical(
        evaluatorJob,
        evaluatorContext,
        PublicEvaluatorOutputV1Fixture,
      ),
    ).resolves.toEqual(PublicEvaluatorOutputV1Fixture);
  });

  it("stops automatic evaluation in Closing", () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );

    expect(() =>
      subject.assertContextAllowed(evaluatorJob, {
        ...evaluatorContext,
        session: { ...evaluatorContext.session, phase: "CLOSING" },
      }),
    ).toThrowError(
      expect.objectContaining({ code: "PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED" }),
    );
  });
});
