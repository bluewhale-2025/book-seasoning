import { describe, expect, it } from "vitest";

import {
  DiscussionMetricsV1Schema,
  PublicEvidenceRefSchema,
} from "./ai-common.js";
import {
  AiPrivateEvidenceRefCanaryFixture,
  AiPrivateEvaluatorLeakCanaryFixture,
  AiPrivateHostExtraFieldCanaryFixture,
  AiPrivateHostLeakCanaryFixture,
  AiPrivateWikiLeakCanaryFixture,
  AiEngineBookEvidenceFixture,
  AiEngineFixtureIds,
  AiEngineMessageEvidenceFixture,
  DiscussionMetricsV1Fixture,
  ExtensionRecommendationOutputV1Fixture,
  HostInterventionOutputV1Fixture,
  LivingWikiPatchV1Fixture,
  LivingWikiVersionV1Fixture,
  OpeningOutputV1Fixture,
  PolicyInterventionDecisionV1Fixture,
  PolicyWaitDecisionV1Fixture,
  PublicEvaluatorOutputV1Fixture,
} from "./ai-engine.fixture.js";
import { PublicEvaluatorOutputV1Schema } from "./ai-evaluator.js";
import {
  ExtensionRecommendationOutputV1Schema,
  HostInterventionOutputV1Schema,
  OpeningOutputV1Schema,
} from "./ai-host.js";
import { PolicyDecisionV1Schema } from "./ai-policy.js";
import {
  LivingWikiPatchV1Schema,
  LivingWikiVersionV1Schema,
} from "./living-wiki.js";

describe("S5 public AI contracts", () => {
  it("accepts the canonical evaluator, Wiki, Policy and user-facing fixtures", () => {
    expect(
      PublicEvaluatorOutputV1Schema.parse(PublicEvaluatorOutputV1Fixture),
    ).toEqual(PublicEvaluatorOutputV1Fixture);
    expect(LivingWikiPatchV1Schema.parse(LivingWikiPatchV1Fixture)).toEqual(
      LivingWikiPatchV1Fixture,
    );
    expect(LivingWikiVersionV1Schema.parse(LivingWikiVersionV1Fixture)).toEqual(
      LivingWikiVersionV1Fixture,
    );
    expect(PolicyDecisionV1Schema.parse(PolicyWaitDecisionV1Fixture)).toEqual(
      PolicyWaitDecisionV1Fixture,
    );
    expect(
      PolicyDecisionV1Schema.parse(PolicyInterventionDecisionV1Fixture),
    ).toEqual(PolicyInterventionDecisionV1Fixture);
    expect(
      HostInterventionOutputV1Schema.parse(HostInterventionOutputV1Fixture),
    ).toEqual(HostInterventionOutputV1Fixture);
    expect(OpeningOutputV1Schema.parse(OpeningOutputV1Fixture)).toEqual(
      OpeningOutputV1Fixture,
    );
    expect(
      ExtensionRecommendationOutputV1Schema.parse(
        ExtensionRecommendationOutputV1Fixture,
      ),
    ).toEqual(ExtensionRecommendationOutputV1Fixture);
  });

  it("allows only the four PUBLIC evidence reference variants", () => {
    expect(PublicEvidenceRefSchema.parse(AiEngineMessageEvidenceFixture)).toEqual(
      AiEngineMessageEvidenceFixture,
    );
    expect(PublicEvidenceRefSchema.parse(AiEngineBookEvidenceFixture)).toEqual(
      AiEngineBookEvidenceFixture,
    );
    expect(
      PublicEvidenceRefSchema.parse({
        type: "PUBLIC_PREP",
        prepAnswerId: "b0000000-0000-4000-8000-000000000001",
      }),
    ).toBeDefined();
    expect(
      PublicEvidenceRefSchema.parse({
        type: "AI_INTERVENTION",
        messageId: "b1000000-0000-4000-8000-000000000001",
        seqNo: 2,
      }),
    ).toBeDefined();
    expect(
      PublicEvidenceRefSchema.safeParse(AiPrivateEvidenceRefCanaryFixture)
        .success,
    ).toBe(false);
  });

  it("requires all seven independent metrics and rejects a total score", () => {
    expect(DiscussionMetricsV1Schema.parse(DiscussionMetricsV1Fixture)).toEqual(
      DiscussionMetricsV1Fixture,
    );
    expect(
      DiscussionMetricsV1Schema.safeParse({
        ...DiscussionMetricsV1Fixture,
        totalScore: 92,
      }).success,
    ).toBe(false);
    const missingActivity: Record<string, unknown> = {
      ...DiscussionMetricsV1Fixture,
    };
    delete missingActivity.activity;
    expect(DiscussionMetricsV1Schema.safeParse(missingActivity).success).toBe(
      false,
    );
  });

  it("binds every patch operation and reference to its base and cursor", () => {
    const baseMismatch = {
      ...LivingWikiPatchV1Fixture,
      operations: [
        {
          ...LivingWikiPatchV1Fixture.operations[0],
          baseVersion: 0,
        },
      ],
    };
    expect(LivingWikiPatchV1Schema.safeParse(baseMismatch).success).toBe(false);

    const futureEvidence = {
      ...LivingWikiPatchV1Fixture,
      operations: [
        {
          ...LivingWikiPatchV1Fixture.operations[0],
          topic: {
            ...LivingWikiVersionV1Fixture.document.currentTopic,
            evidenceRefs: [
              {
                ...AiEngineMessageEvidenceFixture,
                seqNo: LivingWikiPatchV1Fixture.basedThroughSeq + 1,
              },
            ],
          },
        },
      ],
    };
    expect(LivingWikiPatchV1Schema.safeParse(futureEvidence).success).toBe(false);

    const duplicateTarget = {
      ...LivingWikiPatchV1Fixture,
      operations: [
        LivingWikiPatchV1Fixture.operations[0],
        LivingWikiPatchV1Fixture.operations[0],
      ],
    };
    expect(LivingWikiPatchV1Schema.safeParse(duplicateTarget).success).toBe(
      false,
    );
  });

  it("rejects broken Wiki relations and future evidence", () => {
    const brokenRelation = {
      ...LivingWikiVersionV1Fixture,
      document: {
        ...LivingWikiVersionV1Fixture.document,
        perspectiveMap: [LivingWikiVersionV1Fixture.document.perspectiveMap[0]],
      },
    };
    expect(LivingWikiVersionV1Schema.safeParse(brokenRelation).success).toBe(
      false,
    );

    const futureEvidence = {
      ...LivingWikiVersionV1Fixture,
      document: {
        ...LivingWikiVersionV1Fixture.document,
        currentTopic: {
          ...LivingWikiVersionV1Fixture.document.currentTopic,
          evidenceRefs: [
            {
              ...AiEngineMessageEvidenceFixture,
              seqNo: LivingWikiVersionV1Fixture.basedThroughSeq + 1,
            },
          ],
        },
      },
    };
    expect(LivingWikiVersionV1Schema.safeParse(futureEvidence).success).toBe(
      false,
    );

    const incoherentTransition = {
      ...LivingWikiVersionV1Fixture,
      document: {
        ...LivingWikiVersionV1Fixture.document,
        currentTopic: {
          ...LivingWikiVersionV1Fixture.document.currentTopic,
          changeSummary: "이전 topic 식별자 없이 전환만 주장한다.",
        },
      },
    };
    expect(
      LivingWikiVersionV1Schema.safeParse(incoherentTransition).success,
    ).toBe(false);

    const historicalTopicCoverage = {
      ...LivingWikiVersionV1Fixture,
      document: {
        ...LivingWikiVersionV1Fixture.document,
        coverage: [
          {
            ...LivingWikiVersionV1Fixture.document.coverage[0],
            subjectId: "b8000000-0000-4000-8000-000000000099",
          },
        ],
      },
    };
    expect(
      LivingWikiVersionV1Schema.safeParse(historicalTopicCoverage).success,
    ).toBe(true);
  });

  it("ties evaluator output to one base Wiki, cursor and pinned Pack", () => {
    expect(
      PublicEvaluatorOutputV1Schema.safeParse({
        ...PublicEvaluatorOutputV1Fixture,
        targetThroughSeq: 5,
      }).success,
    ).toBe(false);

    expect(
      PublicEvaluatorOutputV1Schema.safeParse({
        ...PublicEvaluatorOutputV1Fixture,
        packVersionId: "b2000000-0000-4000-8000-000000000001",
      }).success,
    ).toBe(false);
  });

  it("represents WAIT as one valid action and forbids WAIT for host help", () => {
    expect(PolicyDecisionV1Schema.safeParse(PolicyWaitDecisionV1Fixture).success).toBe(
      true,
    );
    expect(
      PolicyDecisionV1Schema.safeParse({
        ...PolicyInterventionDecisionV1Fixture,
        action: "WAIT",
      }).success,
    ).toBe(false);
    expect(
      PolicyDecisionV1Schema.safeParse({
        ...PolicyWaitDecisionV1Fixture,
        action: ["WAIT", "DEEPEN"],
      }).success,
    ).toBe(false);
  });

  it("does not allow Host output to expose internal metrics or use WAIT", () => {
    expect(
      HostInterventionOutputV1Schema.safeParse({
        ...HostInterventionOutputV1Fixture,
        action: "WAIT",
      }).success,
    ).toBe(false);
    expect(
      HostInterventionOutputV1Schema.safeParse({
        ...HostInterventionOutputV1Fixture,
        metrics: DiscussionMetricsV1Fixture,
      }).success,
    ).toBe(false);
  });

  it("rejects AI_PRIVATE canaries in references, text and extra fields", () => {
    expect(
      PublicEvaluatorOutputV1Schema.safeParse(
        AiPrivateEvaluatorLeakCanaryFixture,
      ).success,
    ).toBe(false);
    expect(
      LivingWikiVersionV1Schema.safeParse(AiPrivateWikiLeakCanaryFixture).success,
    ).toBe(false);
    expect(
      HostInterventionOutputV1Schema.safeParse(AiPrivateHostLeakCanaryFixture)
        .success,
    ).toBe(false);
    expect(
      HostInterventionOutputV1Schema.safeParse(
        AiPrivateHostExtraFieldCanaryFixture,
      ).success,
    ).toBe(false);
  });

  it("rejects evidence from a different Pack in participant-facing output", () => {
    expect(
      HostInterventionOutputV1Schema.safeParse({
        ...HostInterventionOutputV1Fixture,
        supportingEvidenceRefs: [
          {
            ...AiEngineBookEvidenceFixture,
            packVersionId: "b3000000-0000-4000-8000-000000000001",
          },
        ],
      }).success,
    ).toBe(false);
    expect(HostInterventionOutputV1Fixture.packVersionId).toBe(
      AiEngineFixtureIds.packVersionId,
    );
  });
});
