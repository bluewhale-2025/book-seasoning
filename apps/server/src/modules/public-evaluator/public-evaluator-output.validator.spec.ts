import { describe, expect, it } from "vitest";

import {
  AiEngineMessageEvidenceFixture,
  AiEngineSecondMessageEvidenceFixture,
  AiPrivateEvaluatorLeakCanaryFixture,
  PublicEvaluatorOutputV1Fixture,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type {
  PublicEvidenceResolver,
  ResolvedPublicEvidence,
} from "../ai-context/public-evidence-reference.resolver.js";
import { evaluatorContext, evaluatorJob } from "./public-evaluator.fixture.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";

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
        PublicEvaluatorOutputV1Fixture,
      ),
    ).resolves.toEqual(PublicEvaluatorOutputV1Fixture);
    expect(resolver.calls.length).toBeGreaterThan(0);
    expect(resolver.calls.every((call) => call.length <= 24)).toBe(true);
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
      subject.validate(evaluatorJob, evaluatorContext, output),
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
      subject.validate(evaluatorJob, evaluatorContext, output),
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
      subject.validate(evaluatorJob, evaluatorContext, output),
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

  it("restores an opaque message id from the selected PUBLIC sequence", async () => {
    const resolver = new FakeEvidenceResolver();
    const subject = new PublicEvaluatorOutputValidator(resolver);
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      currentTopic: {
        ...PublicEvaluatorOutputV1Fixture.currentTopic,
        evidenceRefs: [
          {
            type: "MESSAGE",
            messageId: "b9000000-0000-4000-8000-000000000099",
            seqNo: 4,
          },
        ],
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

  it("still rejects an evidence locator absent from PUBLIC context", async () => {
    const subject = new PublicEvaluatorOutputValidator(
      new FakeEvidenceResolver(),
    );
    const output = {
      ...PublicEvaluatorOutputV1Fixture,
      currentTopic: {
        ...PublicEvaluatorOutputV1Fixture.currentTopic,
        evidenceRefs: [
          {
            type: "MESSAGE",
            messageId: "b9000000-0000-4000-8000-000000000099",
            seqNo: 2,
          },
        ],
      },
    };

    await expect(
      subject.validate(evaluatorJob, evaluatorContext, output),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_REFERENCE_NOT_IN_CONTEXT",
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
      subject.validate(evaluatorJob, evaluatorContext, output),
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
      subject.validate(evaluatorJob, evaluatorContext, output),
    ).rejects.toMatchObject({
      code: "PUBLIC_EVALUATOR_BOOK_GROUNDING_NOT_DISCUSSION_LINKED",
    });
  });

  it("fails closed on incomplete materialization and private canaries", async () => {
    await expect(
      new PublicEvaluatorOutputValidator(
        new FakeEvidenceResolver(false),
      ).validate(evaluatorJob, evaluatorContext, PublicEvaluatorOutputV1Fixture),
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
