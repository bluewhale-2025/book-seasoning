import { describe, expect, it } from "vitest";

import {
  AiEngineFixtureIds,
  PublicEvaluatorOutputV1Fixture,
  type DiscussionMetricLevel,
  type DiscussionMetricsV1,
  type PolicyAction,
  type PublicContextV1,
  type PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import {
  evaluatorContext,
} from "../public-evaluator/public-evaluator.fixture.js";
import { DeterministicPolicyEngine } from "./deterministic-policy.engine.js";

type MetricName = keyof DiscussionMetricsV1;

const subject = new DeterministicPolicyEngine();
const secondParticipantId = "b7000000-0000-4000-8000-000000000099";

const observation = (
  metric: MetricName,
  level: DiscussionMetricLevel,
): DiscussionMetricsV1[MetricName] => ({
  level,
  reasonCodes: [`${metric.toUpperCase()}_${level}`],
  evidenceRefs: PublicEvaluatorOutputV1Fixture.metrics[metric].evidenceRefs,
});

const evaluationWith = (
  levels: Partial<Record<MetricName, DiscussionMetricLevel>>,
  rest: Partial<PublicEvaluatorOutputV1> = {},
): PublicEvaluatorOutputV1 => ({
  ...PublicEvaluatorOutputV1Fixture,
  ...rest,
  metrics: {
    ...PublicEvaluatorOutputV1Fixture.metrics,
    ...Object.fromEntries(
      Object.entries(levels).map(([metric, level]) => [
        metric,
        observation(metric as MetricName, level),
      ]),
    ),
  },
});

const contextWith = (
  previousLevels: Partial<Record<MetricName, DiscussionMetricLevel>> = {},
  rest: Partial<PublicContextV1> = {},
): PublicContextV1 => ({
  ...evaluatorContext,
  ...rest,
  session: { ...evaluatorContext.session, ...rest.session },
  objectiveMetrics: {
    ...evaluatorContext.objectiveMetrics,
    ...rest.objectiveMetrics,
  },
  baseWiki: {
    ...evaluatorContext.baseWiki!,
    document: {
      ...evaluatorContext.baseWiki!.document,
      metricsAndKeyChanges: {
        ...evaluatorContext.baseWiki!.document.metricsAndKeyChanges,
        metrics: {
          ...evaluatorContext.baseWiki!.document.metricsAndKeyChanges.metrics,
          ...Object.fromEntries(
            Object.entries(previousLevels).map(([metric, level]) => [
              metric,
              observation(metric as MetricName, level),
            ]),
          ),
        },
      },
    },
  },
});

const decide = (
  evaluation: PublicEvaluatorOutputV1 = PublicEvaluatorOutputV1Fixture,
  context: PublicContextV1 = evaluatorContext,
  options: Readonly<{
    trigger?: Parameters<DeterministicPolicyEngine["decide"]>[0]["trigger"];
    hostHelpReason?: Parameters<
      DeterministicPolicyEngine["decide"]
    >[0]["hostHelpReason"];
  }> = {},
) =>
  subject.decide({
    evaluationId: AiEngineFixtureIds.evaluationId,
    committedWikiVersion: 2,
    context,
    evaluation,
    trigger: options.trigger ?? "MESSAGE_BATCH",
    hostHelpReason: options.hostHelpReason ?? null,
  });

describe("DeterministicPolicyEngine", () => {
  it("moves Opening to Core once at least two public perspectives surface", () => {
    const context = contextWith({}, {
      session: { ...evaluatorContext.session, phase: "OPENING" },
      messages: evaluatorContext.messages.map((message, index) =>
        index === 1
          ? { ...message, authorParticipantId: secondParticipantId }
          : message,
      ),
      participants: [
        ...evaluatorContext.participants,
        {
          ...evaluatorContext.participants[0]!,
          participantId: secondParticipantId,
          profileName: "두 번째 참가자",
          role: "PARTICIPANT",
          messageCountThroughCursor: 1,
          lastMessageSeq: 4,
        },
      ],
      objectiveMetrics: {
        ...evaluatorContext.objectiveMetrics,
        registeredParticipantCount: 2,
        actualParticipantCount: 2,
        connectedParticipantCount: 2,
        recentSpeakerCount: 2,
      },
    });

    expect(decide(PublicEvaluatorOutputV1Fixture, context)).toMatchObject({
      action: "TRANSITION",
      reasonCodes: ["OPENING_POSITIONS_SURFACED"],
    });
  });

  it("does not leave Opening when two perspective labels have only one speaker's evidence", () => {
    const context = contextWith({}, {
      session: { ...evaluatorContext.session, phase: "OPENING" },
    });

    expect(decide(PublicEvaluatorOutputV1Fixture, context)).toMatchObject({
      action: "WAIT",
    });
  });

  it("does not leave Opening when duplicated perspectives cite the same evidence", () => {
    const firstPerspective = PublicEvaluatorOutputV1Fixture.majorPerspectives[0]!;
    const evaluation = {
      ...PublicEvaluatorOutputV1Fixture,
      majorPerspectives: [
        firstPerspective,
        {
          ...PublicEvaluatorOutputV1Fixture.majorPerspectives[1]!,
          evidenceRefs: firstPerspective.evidenceRefs,
        },
      ],
    };
    const context = contextWith({}, {
      session: { ...evaluatorContext.session, phase: "OPENING" },
      messages: evaluatorContext.messages.map((message, index) =>
        index === 1
          ? { ...message, authorParticipantId: secondParticipantId }
          : message,
      ),
    });

    expect(decide(evaluation, context)).toMatchObject({ action: "WAIT" });
  });

  it("preserves good human flow even when Book Grounding is low and ignores suggestedAction", () => {
    const decision = decide(
      evaluationWith(
        { bookGrounding: "LOW" },
        { suggestedAction: "RECONNECT_TO_BOOK" },
      ),
    );

    expect(decision).toMatchObject({
      action: "WAIT",
      reasonCodes: ["GOOD_HUMAN_FLOW"],
    });
  });

  it("fails closed to WAIT while an automatic intervention cooldown is active", () => {
    const context = contextWith({}, {
      recentPolicyAction: {
        action: "DEEPEN",
        reasonCodes: ["DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED"],
        supportingEvidenceRefs: [],
        createdAt: "2026-09-02T03:59:30.000Z",
      },
    });

    expect(decide(evaluationWith({ expansion: "LOW" }), context)).toMatchObject({
      action: "WAIT",
      reasonCodes: ["INTERVENTION_COOLDOWN_ACTIVE"],
    });
  });

  it.each([
    [
      contextWith({}, {
        session: { ...evaluatorContext.session, latestMessageSeq: 5 },
      }),
      "EVALUATION_CURSOR_STALE",
    ],
    [
      contextWith({}, {
        session: { ...evaluatorContext.session, phase: "SYNTHESIS" },
      }),
      "POLICY_PHASE_NOT_ALLOWED",
    ],
  ] as const)("uses WAIT for stale cursor or a non-intervention phase", (context, reason) => {
    expect(decide(PublicEvaluatorOutputV1Fixture, context)).toMatchObject({
      action: "WAIT",
      reasonCodes: [reason],
    });
  });

  it("requires persistent low Relevance before reconnecting", () => {
    const evaluation = evaluationWith({
      relevance: "LOW",
      expansion: "MEDIUM",
      activity: "MEDIUM",
    });

    expect(decide(evaluation)).toMatchObject({ action: "WAIT" });
    expect(
      decide(evaluation, contextWith({ relevance: "LOW" })),
    ).toMatchObject({
      action: "RECONNECT",
      reasonCodes: expect.arrayContaining(["RELEVANCE_LOW_PERSISTED"]),
    });
  });

  it("revives low Activity when exploration remains", () => {
    expect(
      decide(evaluationWith({ activity: "LOW", saturation: "MEDIUM" })),
    ).toMatchObject({ action: "REVIVE" });
  });

  it("uses objective silence even when the evaluator reports stale high Activity", () => {
    const silentContext = contextWith({}, {
      objectiveMetrics: {
        ...evaluatorContext.objectiveMetrics,
        silenceSeconds: 75,
      },
    });

    expect(
      decide(
        evaluationWith({
          activity: "HIGH",
          expansion: "HIGH",
          relevance: "HIGH",
          saturation: "MEDIUM",
        }),
        silentContext,
        { trigger: "SILENCE" },
      ),
    ).toMatchObject({
      action: "REVIVE",
      reasonCodes: ["OBJECTIVE_SILENCE_WITH_EXPLORATION_REMAINING"],
    });
  });

  it("waits when Expansion remains high despite a high Saturation signal", () => {
    expect(
      decide(
        evaluationWith({
          saturation: "HIGH",
          expansion: "HIGH",
          activity: "MEDIUM",
        }),
      ),
    ).toMatchObject({
      action: "WAIT",
      reasonCodes: ["EXPANSION_REMAINS_HIGH_DESPITE_SATURATION"],
    });
  });

  it.each([
    [null, "EXPAND"],
    ["EXPAND", "SUMMARIZE"],
    ["SUMMARIZE", "TRANSITION"],
  ] as const)(
    "progresses saturation with one goal per cycle after %s",
    (previousAction, expectedAction) => {
      const recentPolicyAction =
        previousAction === null
          ? null
          : {
              action: previousAction,
              reasonCodes: ["PREVIOUS_POLICY_ACTION"],
              supportingEvidenceRefs: [],
              createdAt: "2026-09-02T03:50:00.000Z",
            };
      const decision = decide(
        evaluationWith({
          saturation: "HIGH",
          expansion: "LOW",
          activity: "MEDIUM",
          relevance: "MEDIUM",
        }),
        contextWith({}, { recentPolicyAction }),
      );

      expect(decision.action).toBe(expectedAction as PolicyAction);
      expect(typeof decision.action).toBe("string");
    },
  );

  it("expands first when perspectives are thin, then deepens once perspectives exist", () => {
    const lowEvaluation = evaluationWith({
      expansion: "LOW",
      depth: "LOW",
      activity: "MEDIUM",
      relevance: "MEDIUM",
    });
    expect(
      decide(
        { ...lowEvaluation, majorPerspectives: [] },
        contextWith({ expansion: "LOW", depth: "LOW" }),
      ),
    ).toMatchObject({ action: "EXPAND" });
    expect(
      decide(lowEvaluation, contextWith({ expansion: "LOW", depth: "LOW" })),
    ).toMatchObject({ action: "DEEPEN" });
  });

  it("uses the book as a resource only after Expansion has slowed", () => {
    const decision = decide(
      evaluationWith({
        bookGrounding: "LOW",
        expansion: "LOW",
        depth: "MEDIUM",
        activity: "MEDIUM",
      }),
      contextWith({ expansion: "LOW" }),
    );

    expect(decision.action).toBe("RECONNECT_TO_BOOK");
  });

  it("does not interrupt for Participation Balance alone but invites at a quiet opening", () => {
    expect(
      decide(evaluationWith({ participationBalance: "LOW" })),
    ).toMatchObject({ action: "WAIT" });

    const quietContext = contextWith({}, {
      objectiveMetrics: {
        ...evaluatorContext.objectiveMetrics,
        actualParticipantCount: 3,
        connectedParticipantCount: 3,
        recentSpeakerCount: 1,
      },
    });
    expect(
      decide(
        evaluationWith({ participationBalance: "LOW", activity: "LOW" }),
        quietContext,
        { trigger: "PARTICIPATION_THRESHOLD" },
      ),
    ).toMatchObject({ action: "INVITE" });
  });

  it("recommends an extension only when valuable discussion is still active", () => {
    expect(
      decide(PublicEvaluatorOutputV1Fixture, evaluatorContext, {
        trigger: "EXTENSION_DECISION",
      }),
    ).toMatchObject({ action: "RECOMMEND_EXTENSION" });
    expect(
      decide(evaluationWith({ activity: "LOW" }), evaluatorContext, {
        trigger: "EXTENSION_DECISION",
      }),
    ).toMatchObject({ action: "WAIT" });
  });

  it.each([
    ["CONVERSATION_STOPPED", "REVIVE"],
    ["DISCUSSION_STUCK_OR_REPETITIVE", "DEEPEN"],
    ["TOO_FAR_OFF_TOPIC", "RECONNECT"],
    ["CONFLICT_NEEDS_REFRAMING", "DEEPEN"],
  ] as const)(
    "turns accepted host help %s into one non-WAIT goal",
    (hostHelpReason, action) => {
      expect(
        decide(PublicEvaluatorOutputV1Fixture, evaluatorContext, {
          trigger: "HOST_HELP",
          hostHelpReason,
        }),
      ).toMatchObject({
        trigger: "HOST_HELP",
        hostHelpReason,
        action,
        reasonCodes: expect.arrayContaining(["HOST_HELP_REQUESTED"]),
      });
    },
  );
});
