import { Injectable } from "@nestjs/common";

import {
  PolicyDecisionV1Schema,
  PublicContextV1Schema,
  PublicEvaluatorOutputV1Schema,
  publicEvidenceRefKey,
  type DiscussionMetricsV1,
  type HostHelpReason,
  type PolicyAction,
  type PolicyDecisionV1,
  type PolicyTrigger,
  type PublicContextV1,
  type PublicEvaluatorOutputV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

export const AUTOMATIC_INTERVENTION_COOLDOWN_MS = 90_000;

type MetricName = keyof DiscussionMetricsV1;

export type DeterministicPolicyInput = Readonly<{
  evaluationId: string;
  committedWikiVersion: number;
  context: PublicContextV1;
  evaluation: PublicEvaluatorOutputV1;
  trigger: PolicyTrigger;
  hostHelpReason: HostHelpReason | null;
}>;

export class DeterministicPolicyError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "DeterministicPolicyError";
  }
}

@Injectable()
export class DeterministicPolicyEngine {
  public decide(rawInput: DeterministicPolicyInput): PolicyDecisionV1 {
    const contextResult = PublicContextV1Schema.safeParse(rawInput.context);
    const evaluationResult = PublicEvaluatorOutputV1Schema.safeParse(
      rawInput.evaluation,
    );
    if (!contextResult.success || !evaluationResult.success) {
      this.fail("POLICY_INPUT_CONTRACT_INVALID");
    }
    const input = {
      ...rawInput,
      context: contextResult.data,
      evaluation: evaluationResult.data,
    };
    this.assertEnvelope(input);

    if (
      input.context.session.latestMessageSeq !==
      input.evaluation.targetThroughSeq
    ) {
      return this.wait(input, "EVALUATION_CURSOR_STALE");
    }
    if (!this.phaseAllows(input)) {
      return this.wait(input, "POLICY_PHASE_NOT_ALLOWED");
    }
    if (input.trigger === "HOST_HELP") {
      return this.hostHelpDecision(input);
    }
    if (input.trigger === "EXTENSION_DECISION") {
      return this.extensionDecision(input);
    }
    if (this.cooldownActive(input.context)) {
      return this.wait(input, "INTERVENTION_COOLDOWN_ACTIVE");
    }
    if (input.evaluation.confidence === "LOW") {
      return this.wait(input, "EVALUATION_CONFIDENCE_LOW");
    }

    if (
      input.context.session.phase === "OPENING" &&
      input.evaluation.majorPerspectives.length >= 2
    ) {
      return this.decision(
        input,
        "TRANSITION",
        ["OPENING_POSITIONS_SURFACED"],
        ["expansion", "depth"],
      );
    }

    const metrics = input.evaluation.metrics;
    if (
      metrics.expansion.level === "HIGH" &&
      metrics.relevance.level === "HIGH" &&
      metrics.activity.level === "HIGH"
    ) {
      return this.decision(input, "WAIT", ["GOOD_HUMAN_FLOW"], [
        "expansion",
        "relevance",
        "activity",
      ]);
    }

    if (
      metrics.relevance.level === "LOW" &&
      this.wasPreviously(input.context, "relevance", "LOW")
    ) {
      return this.decision(
        input,
        "RECONNECT",
        ["RELEVANCE_LOW_PERSISTED", "CURRENT_ISSUE_CONNECTION_REQUIRED"],
        ["relevance"],
      );
    }

    if (
      metrics.saturation.level === "HIGH" &&
      metrics.expansion.level === "HIGH"
    ) {
      return this.decision(
        input,
        "WAIT",
        ["EXPANSION_REMAINS_HIGH_DESPITE_SATURATION"],
        ["saturation", "expansion"],
      );
    }

    if (
      input.trigger === "TOPIC_DURATION" &&
      metrics.bookGrounding.level === "LOW" &&
      metrics.saturation.level !== "LOW"
    ) {
      return this.decision(
        input,
        "RECONNECT_AND_REFLECT",
        ["TOPIC_CHECKPOINT_NEEDS_BOOK_REFLECTION"],
        ["bookGrounding", "saturation"],
      );
    }

    if (metrics.activity.level === "LOW") {
      if (
        metrics.participationBalance.level === "LOW" &&
        input.context.objectiveMetrics.connectedParticipantCount >= 2 &&
        input.context.objectiveMetrics.recentSpeakerCount <
          input.context.objectiveMetrics.connectedParticipantCount
      ) {
        return this.decision(
          input,
          "INVITE",
          ["QUIET_MOMENT_CAN_INVITE_MORE_VIEWS"],
          ["activity", "participationBalance"],
        );
      }
      if (
        metrics.saturation.level === "HIGH" &&
        metrics.expansion.level === "LOW"
      ) {
        return this.saturationDecision(input);
      }
      return this.decision(
        input,
        "REVIVE",
        ["ACTIVITY_LOW_WITH_EXPLORATION_REMAINING"],
        ["activity", "saturation"],
      );
    }

    if (
      metrics.saturation.level === "HIGH" &&
      metrics.expansion.level === "LOW"
    ) {
      return this.saturationDecision(input);
    }

    if (
      metrics.bookGrounding.level === "LOW" &&
      metrics.relevance.level !== "LOW" &&
      metrics.expansion.level === "LOW" &&
      this.wasPreviously(input.context, "expansion", "LOW")
    ) {
      return this.decision(
        input,
        "RECONNECT_TO_BOOK",
        ["EXPANSION_SLOWED_BOOK_CAN_REOPEN_THINKING"],
        ["bookGrounding", "expansion", "relevance"],
      );
    }

    if (
      metrics.depth.level === "LOW" &&
      this.wasPreviously(input.context, "depth", "LOW") &&
      (metrics.expansion.level === "HIGH" ||
        input.evaluation.majorPerspectives.length >= 2)
    ) {
      return this.decision(
        input,
        "DEEPEN",
        ["DEPTH_LOW_AFTER_PERSPECTIVES_EMERGED"],
        ["depth", "expansion"],
      );
    }

    if (
      metrics.expansion.level === "LOW" &&
      metrics.depth.level !== "HIGH" &&
      this.wasPreviously(input.context, "expansion", "LOW")
    ) {
      return this.decision(
        input,
        "EXPAND",
        ["EXPANSION_LOW_PERSISTED"],
        ["expansion", "depth"],
      );
    }

    if (
      input.trigger === "PARTICIPATION_THRESHOLD" &&
      metrics.participationBalance.level === "LOW" &&
      metrics.activity.level !== "HIGH"
    ) {
      return this.decision(
        input,
        "INVITE",
        ["PARTICIPATION_OPPORTUNITY_AT_NATURAL_PAUSE"],
        ["participationBalance", "activity"],
      );
    }

    if (metrics.participationBalance.level === "LOW") {
      return this.decision(
        input,
        "WAIT",
        ["PARTICIPATION_LOW_ALONE_DOES_NOT_INTERRUPT"],
        ["participationBalance"],
      );
    }

    if (
      metrics.bookGrounding.level === "LOW" &&
      metrics.relevance.level === "HIGH" &&
      (metrics.expansion.level === "HIGH" || metrics.depth.level === "HIGH")
    ) {
      return this.decision(
        input,
        "WAIT",
        ["VALUABLE_EXTENSION_WITH_LOW_BOOK_GROUNDING"],
        ["bookGrounding", "relevance", "expansion", "depth"],
      );
    }

    return this.wait(input, "MINIMUM_INTERVENTION_NOT_JUSTIFIED");
  }

  private assertEnvelope(input: DeterministicPolicyInput): void {
    if (
      input.evaluation.packVersionId !==
        input.context.session.pinnedPackVersionId ||
      input.evaluation.baseWikiVersion !==
        (input.context.baseWiki?.version ?? 0) ||
      input.evaluation.targetThroughSeq !==
        input.context.session.targetThroughSeq ||
      input.committedWikiVersion <= 0
    ) {
      this.fail("POLICY_EVALUATION_CONTEXT_MISMATCH");
    }
    if (
      (input.trigger === "HOST_HELP") !== (input.hostHelpReason !== null)
    ) {
      this.fail("POLICY_HOST_HELP_SHAPE_INVALID");
    }
  }

  private phaseAllows(input: DeterministicPolicyInput): boolean {
    const phase = input.context.session.phase;
    if (input.trigger === "HOST_HELP") {
      return phase === "OPENING" || phase === "CORE" || phase === "EXTENDED";
    }
    return phase === "OPENING" || phase === "CORE" || phase === "EXTENDED";
  }

  private cooldownActive(context: PublicContextV1): boolean {
    const currentTime = Date.parse(context.builtAt);
    const candidates = [
      context.lastCommittedInterventionAt,
      context.recentPolicyAction?.action === "WAIT"
        ? null
        : context.recentPolicyAction?.createdAt,
    ].filter((value): value is string => value !== null && value !== undefined);
    return candidates.some(
      (value) =>
        currentTime - Date.parse(value) < AUTOMATIC_INTERVENTION_COOLDOWN_MS,
    );
  }

  private extensionDecision(
    input: DeterministicPolicyInput,
  ): PolicyDecisionV1 {
    const metrics = input.evaluation.metrics;
    const emergentAgenda = metrics.relevance.reasonCodes.includes(
      "NEW_TOPIC_CANDIDATE_EMERGED",
    );
    if (
      metrics.activity.level === "HIGH" &&
      metrics.saturation.level !== "HIGH" &&
      (metrics.expansion.level === "HIGH" ||
        metrics.depth.level === "HIGH" ||
        emergentAgenda)
    ) {
      return this.decision(
        input,
        "RECOMMEND_EXTENSION",
        ["VALUABLE_DISCUSSION_CAN_CONTINUE"],
        ["activity", "saturation", "expansion", "depth", "relevance"],
      );
    }
    return this.decision(
      input,
      "WAIT",
      ["EXTENSION_NOT_RECOMMENDED"],
      ["activity", "saturation", "expansion", "depth"],
    );
  }

  private hostHelpDecision(
    input: DeterministicPolicyInput,
  ): PolicyDecisionV1 {
    const reason = input.hostHelpReason;
    if (reason === null) this.fail("POLICY_HOST_HELP_SHAPE_INVALID");
    const metrics = input.evaluation.metrics;
    switch (reason) {
      case "CONVERSATION_STOPPED":
        return this.decision(
          input,
          "REVIVE",
          ["HOST_HELP_REQUESTED", "CONVERSATION_STOPPED"],
          ["activity"],
        );
      case "DISCUSSION_STUCK_OR_REPETITIVE":
        return this.decision(
          input,
          input.evaluation.majorPerspectives.length >= 2 ? "DEEPEN" : "EXPAND",
          ["HOST_HELP_REQUESTED", "DISCUSSION_STUCK_OR_REPETITIVE"],
          ["depth", "expansion", "saturation"],
        );
      case "TOO_FAR_OFF_TOPIC":
        return this.decision(
          input,
          metrics.bookGrounding.level === "LOW"
            ? "RECONNECT_TO_BOOK"
            : "RECONNECT",
          ["HOST_HELP_REQUESTED", "OFF_TOPIC_RECONNECTION_REQUIRED"],
          ["relevance", "bookGrounding"],
        );
      case "CONFLICT_NEEDS_REFRAMING":
        return this.decision(
          input,
          "DEEPEN",
          ["HOST_HELP_REQUESTED", "CONFLICT_ASSUMPTIONS_NEED_EXPLORATION"],
          ["depth", "expansion"],
        );
    }
  }

  private saturationDecision(
    input: DeterministicPolicyInput,
  ): PolicyDecisionV1 {
    const previousAction = input.context.recentPolicyAction?.action;
    if (previousAction === "SUMMARIZE") {
      return this.decision(
        input,
        "TRANSITION",
        ["SATURATION_REMAINS_AFTER_SUMMARY"],
        ["saturation", "expansion"],
      );
    }
    if (previousAction === "EXPAND") {
      return this.decision(
        input,
        "SUMMARIZE",
        ["LAST_EXPANSION_ATTEMPT_ADDED_NO_VALUE"],
        ["saturation", "expansion"],
      );
    }
    return this.decision(
      input,
      "EXPAND",
      ["SATURATION_HIGH_TRY_ONE_LAST_EXPANSION"],
      ["saturation", "expansion"],
    );
  }

  private wasPreviously(
    context: PublicContextV1,
    metric: MetricName,
    level: DiscussionMetricsV1[MetricName]["level"],
  ): boolean {
    return (
      context.baseWiki?.document.metricsAndKeyChanges.metrics[metric].level ===
      level
    );
  }

  private wait(
    input: DeterministicPolicyInput,
    reasonCode: string,
  ): PolicyDecisionV1 {
    return this.decision(input, "WAIT", [reasonCode], []);
  }

  private decision(
    input: DeterministicPolicyInput,
    action: PolicyAction,
    reasonCodes: readonly string[],
    evidenceMetrics: readonly MetricName[],
  ): PolicyDecisionV1 {
    const evidence = new Map<string, PublicEvidenceRef>();
    for (const metric of evidenceMetrics) {
      for (const reference of input.evaluation.metrics[metric].evidenceRefs) {
        evidence.set(publicEvidenceRefKey(reference), reference);
      }
    }
    const result = PolicyDecisionV1Schema.safeParse({
      schemaVersion: "policy-decision.v1",
      evaluationId: input.evaluationId,
      evaluationTargetThroughSeq: input.evaluation.targetThroughSeq,
      wikiVersion: input.committedWikiVersion,
      trigger: input.trigger,
      hostHelpReason: input.hostHelpReason,
      action,
      reasonCodes,
      supportingEvidenceRefs: [...evidence.values()].slice(0, 24),
    });
    if (!result.success) this.fail("POLICY_DECISION_CONTRACT_INVALID");
    return result.data;
  }

  private fail(code: string): never {
    throw new DeterministicPolicyError(code);
  }
}
