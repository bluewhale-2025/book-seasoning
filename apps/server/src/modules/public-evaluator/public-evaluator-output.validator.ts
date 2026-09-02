import { Inject, Injectable } from "@nestjs/common";

import {
  PublicContextV1Schema,
  PublicEvaluatorOutputV1Schema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type DiscussionMetricLevel,
  type DiscussionMetricsV1,
  type PublicContextV1,
  type PublicEvaluatorOutputV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import {
  PUBLIC_EVIDENCE_RESOLVER,
  PublicEvidenceResolutionError,
  type PublicEvidenceResolver,
} from "../ai-context/public-evidence-reference.resolver.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";

type MetricName = keyof DiscussionMetricsV1;

type MetricReasonCodeMap = Readonly<
  Record<MetricName, Readonly<Record<DiscussionMetricLevel, readonly string[]>>>
>;

export const PUBLIC_EVALUATOR_METRIC_REASON_CODES = {
  depth: {
    LOW: ["REACTIONS_OR_ASSERTIONS_ONLY"],
    MEDIUM: ["REASONS_OR_BOOK_EVIDENCE_PRESENT"],
    HIGH: [
      "REASONS_AND_ASSUMPTIONS_COMPARED",
      "COUNTERARGUMENTS_OR_REVISIONS_PRESENT",
    ],
  },
  expansion: {
    LOW: ["VIEWPOINTS_REPEAT_WITHOUT_CONNECTION"],
    MEDIUM: ["NEW_VIEW_WITH_WEAK_CONNECTION"],
    HIGH: [
      "PERSPECTIVES_CONNECTED_AND_CONTRASTED",
      "NEW_ISSUE_EMERGED",
    ],
  },
  bookGrounding: {
    LOW: ["BOOK_CONNECTION_NOT_OBSERVED"],
    MEDIUM: ["BOOK_ORIGINATED_EXTENSION_CONTINUES", "BOOK_IDEA_REMAINS_ANCHOR"],
    HIGH: ["SPECIFIC_BOOK_EVIDENCE_USED"],
  },
  saturation: {
    LOW: ["NEW_QUESTIONS_STILL_EMERGING"],
    MEDIUM: ["EXPLORATION_REMAINS"],
    HIGH: ["CLAIMS_AND_REASONS_REPEAT", "LITTLE_NEW_VALUE_OBSERVED"],
  },
  participationBalance: {
    LOW: ["ONE_MEANINGFUL_VIEW_DOMINATES"],
    MEDIUM: ["SOME_ACTIVE_VIEWS_MISSING", "MULTIPLE_MEANINGFUL_VIEWS_PRESENT"],
    HIGH: ["ACTIVE_VIEWS_BROADLY_REPRESENTED"],
  },
  relevance: {
    LOW: ["CURRENT_ISSUE_CONNECTION_WEAK"],
    MEDIUM: ["RELATED_TANGENT_HAS_VALUE", "NEW_TOPIC_CANDIDATE_EMERGED"],
    HIGH: ["CURRENT_ISSUE_REMAINS_FOCUSED"],
  },
  activity: {
    LOW: ["SILENCE_WITHOUT_RESPONSE", "FEW_RECENT_RESPONSES"],
    MEDIUM: ["THINKING_PAUSE_PLAUSIBLE"],
    HIGH: ["RESPONSES_ARE_CONTINUING"],
  },
} as const satisfies MetricReasonCodeMap;

const EVIDENCE_BATCH_SIZE = 24;
const ACTIVE_EVALUATION_PHASES = new Set([
  "OPENING",
  "CORE",
  "EXTENDED",
  "SYNTHESIS",
  "ENDED",
]);

export class PublicEvaluatorValidationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly causeCode: string | null = null,
  ) {
    super(code);
    this.name = "PublicEvaluatorValidationError";
  }
}

@Injectable()
export class PublicEvaluatorOutputValidator {
  public constructor(
    @Inject(PUBLIC_EVIDENCE_RESOLVER)
    private readonly evidenceResolver: PublicEvidenceResolver,
  ) {}

  public assertContextAllowed(job: ClaimedAiJob, rawContext: unknown): PublicContextV1 {
    const contextResult = PublicContextV1Schema.safeParse(rawContext);
    if (!contextResult.success) this.fail("PUBLIC_EVALUATOR_CONTEXT_INVALID");
    const context = contextResult.data;
    if (
      job.taskSchemaVersion !== "public-evaluator-output.v1" ||
      (job.jobType !== "PUBLIC_EVALUATION" &&
        job.jobType !== "TOPIC_CHECKPOINT" &&
        job.jobType !== "FINAL_WIKI")
    ) {
      this.fail("PUBLIC_EVALUATOR_JOB_INVALID");
    }
    if (
      context.session.sessionId !== job.sessionId ||
      context.session.targetThroughSeq !== job.targetThroughSeq ||
      (context.baseWiki?.version ?? 0) !== job.baseWikiVersion
    ) {
      this.fail("PUBLIC_EVALUATOR_CONTEXT_JOB_MISMATCH");
    }
    if (!ACTIVE_EVALUATION_PHASES.has(context.session.phase)) {
      this.fail("PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED");
    }
    if (
      (job.jobType === "FINAL_WIKI") !== (context.session.phase === "ENDED")
    ) {
      this.fail("PUBLIC_EVALUATOR_PHASE_NOT_ALLOWED");
    }
    if (job.jobType === "TOPIC_CHECKPOINT" && context.baseWiki === null) {
      this.fail("PUBLIC_EVALUATOR_CHECKPOINT_BASE_REQUIRED");
    }
    return context;
  }

  public async validate(
    job: ClaimedAiJob,
    context: PublicContextV1,
    rawOutput: unknown,
  ): Promise<PublicEvaluatorOutputV1> {
    this.assertContextAllowed(job, context);
    const outputResult = PublicEvaluatorOutputV1Schema.safeParse(rawOutput);
    if (!outputResult.success) this.fail("PUBLIC_EVALUATOR_OUTPUT_INVALID");
    const output = outputResult.data;
    if (
      output.packVersionId !== context.session.pinnedPackVersionId ||
      output.baseWikiVersion !== job.baseWikiVersion ||
      output.targetThroughSeq !== job.targetThroughSeq
    ) {
      this.fail("PUBLIC_EVALUATOR_OUTPUT_ENVELOPE_MISMATCH");
    }

    this.validateMetricReasons(output.metrics);
    this.validateParticipantScope(context, output);
    this.validateBookGrounding(output);
    await this.validateEvidence(context, output);
    return output;
  }

  private validateMetricReasons(metrics: DiscussionMetricsV1): void {
    for (const metricName of Object.keys(metrics) as MetricName[]) {
      const observation = metrics[metricName];
      const allowed = new Set<string>(
        PUBLIC_EVALUATOR_METRIC_REASON_CODES[metricName][observation.level],
      );
      if (observation.reasonCodes.some((code) => !allowed.has(code))) {
        this.fail("PUBLIC_EVALUATOR_METRIC_REASON_INVALID");
      }
    }
  }

  private validateParticipantScope(
    context: PublicContextV1,
    output: PublicEvaluatorOutputV1,
  ): void {
    const participantIds = new Set(
      context.participants.map((participant) => participant.participantId),
    );
    if (
      output.participation.some(
        (participant) => !participantIds.has(participant.participantId),
      )
    ) {
      this.fail("PUBLIC_EVALUATOR_PARTICIPANT_NOT_IN_CONTEXT");
    }
  }

  private validateBookGrounding(output: PublicEvaluatorOutputV1): void {
    if (
      output.bookGrounding.some((grounding) =>
        grounding.evidenceRefs.every(
          (reference) => reference.type === "BOOK_CONTEXT_ITEM",
        ),
      )
    ) {
      this.fail("PUBLIC_EVALUATOR_BOOK_GROUNDING_NOT_DISCUSSION_LINKED");
    }
  }

  private async validateEvidence(
    context: PublicContextV1,
    output: PublicEvaluatorOutputV1,
  ): Promise<void> {
    const allowedKeys = this.contextEvidenceKeys(context);
    const uniqueReferences = new Map<string, PublicEvidenceRef>();
    for (const reference of collectPublicEvidenceRefs(output)) {
      const key = publicEvidenceRefKey(reference);
      if (!allowedKeys.has(key)) {
        this.fail("PUBLIC_EVALUATOR_REFERENCE_NOT_IN_CONTEXT");
      }
      uniqueReferences.set(key, reference);
    }
    const references = [...uniqueReferences.values()];
    for (let index = 0; index < references.length; index += EVIDENCE_BATCH_SIZE) {
      const batch = references.slice(index, index + EVIDENCE_BATCH_SIZE);
      let resolved;
      try {
        resolved = await this.evidenceResolver.resolve(
          {
            sessionId: context.session.sessionId,
            roomId: context.session.roomId,
            pinnedPackVersionId: context.session.pinnedPackVersionId,
            targetThroughSeq: context.session.targetThroughSeq,
          },
          batch,
        );
      } catch (error) {
        this.fail(
          "PUBLIC_EVALUATOR_REFERENCE_INVALID",
          error instanceof PublicEvidenceResolutionError ? error.code : null,
        );
      }
      const resolvedKeys = new Set(
        resolved.map((item) => publicEvidenceRefKey(item.reference)),
      );
      if (
        resolved.length !== batch.length ||
        batch.some((reference) => !resolvedKeys.has(publicEvidenceRefKey(reference)))
      ) {
        this.fail(
          "PUBLIC_EVALUATOR_REFERENCE_INVALID",
          "PUBLIC_EVIDENCE_RESULT_INCOMPLETE",
        );
      }
    }
  }

  private contextEvidenceKeys(context: PublicContextV1): Set<string> {
    const references: PublicEvidenceRef[] = [
      ...collectPublicEvidenceRefs(context.baseWiki),
      ...collectPublicEvidenceRefs(context.recentPolicyAction),
      ...context.messages.map((message) =>
        message.kind === "PARTICIPANT"
          ? {
              type: "MESSAGE" as const,
              messageId: message.messageId,
              seqNo: message.seqNo,
            }
          : {
              type: "AI_INTERVENTION" as const,
              messageId: message.messageId,
              seqNo: message.seqNo,
            },
      ),
      ...context.publicPrep.map((prep) => ({
        type: "PUBLIC_PREP" as const,
        prepAnswerId: prep.prepAnswerId,
      })),
      ...context.bookContext.sections.flatMap((section) =>
        section.items.map((item) => ({
          type: "BOOK_CONTEXT_ITEM" as const,
          packVersionId: context.bookContext.packVersionId,
          itemId: item.itemId,
        })),
      ),
    ];
    return new Set(references.map((reference) => publicEvidenceRefKey(reference)));
  }

  private fail(code: string, causeCode: string | null = null): never {
    throw new PublicEvaluatorValidationError(code, causeCode);
  }
}
