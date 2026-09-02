import {
  DiscussionRecordContextV1Schema,
  DiscussionRecordOutputV1Schema,
  LivingWikiVersionV1Fixture,
  PublicContextV1Schema,
  SynthesisOutputV1Schema,
  collectPublicEvidenceRefs,
  publicEvidenceRefKey,
  type AiProviderRunV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../config/environment.js";
import {
  OpenAiGateway,
  createOpenAiClient,
} from "../infrastructure/ai/openai-ai.gateway.js";
import { PublicAiOutputSafetyValidator } from "../modules/ai-host/public-ai-output-safety.validator.js";
import {
  discussionRecordTask,
  synthesisTask,
} from "../modules/ai-provider/ai-task.catalog.js";
import { evaluatorContext } from "../modules/public-evaluator/public-evaluator.fixture.js";

type SafeRunReport = Readonly<{
  taskAlias: string;
  model: string;
  latencyMs: number;
  usage: AiProviderRunV1["usage"];
}>;

class LiveEvalError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "LiveEvalError";
  }
}

const configuredApiKey = process.env.OPENAI_API_KEY;
const hasConfiguredApiKey =
  configuredApiKey !== undefined && configuredApiKey.length >= 20;
const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "worker",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "s6-results-live-eval",
  corsOrigins: ["http://localhost:5173"],
  openAiApiKey: configuredApiKey ?? "live-eval-key-not-configured",
  openAiEvaluatorModel:
    process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-5.6-luna",
  openAiHostModel: process.env.OPENAI_HOST_MODEL ?? "gpt-5.6-terra",
  openAiTimeoutMs: 60_000,
  commandFingerprintKey: "s6-results-live-eval-command-fingerprint-key",
};

const report = (run: AiProviderRunV1): SafeRunReport => ({
  taskAlias: run.taskAlias,
  model: run.model,
  latencyMs: run.latencyMs,
  usage: run.usage,
});

const assertReferences = (
  actual: readonly PublicEvidenceRef[],
  allowed: readonly PublicEvidenceRef[],
  code: string,
): void => {
  const keys = new Set(allowed.map(publicEvidenceRefKey));
  if (actual.some((reference) => !keys.has(publicEvidenceRefKey(reference)))) {
    throw new LiveEvalError(code);
  }
};

const safeCode = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "S6_RESULTS_LIVE_EVAL_FAILED";
};

if (!hasConfiguredApiKey) {
  process.stderr.write(
    `${JSON.stringify({ status: "FAILED", errorCode: "OPENAI_API_KEY_REQUIRED" })}\n`,
  );
  process.exitCode = 1;
} else {
  const client = createOpenAiClient(environment);
  if (client === undefined) throw new LiveEvalError("OPENAI_CLIENT_UNAVAILABLE");
  const gateway = new OpenAiGateway(environment, client);
  const safety = new PublicAiOutputSafetyValidator();
  try {
    const synthesisContext = PublicContextV1Schema.parse({
      ...evaluatorContext,
      session: { ...evaluatorContext.session, phase: "SYNTHESIS" },
    });
    const synthesisGenerated = await gateway.generate(
      synthesisTask,
      synthesisContext,
    );
    const synthesis = SynthesisOutputV1Schema.parse(synthesisGenerated.output);
    if (
      synthesis.packVersionId !== synthesisContext.session.pinnedPackVersionId ||
      synthesis.basedThroughSeq !== synthesisContext.session.targetThroughSeq
    ) {
      throw new LiveEvalError("SYNTHESIS_ENVELOPE_MISMATCH");
    }
    safety.assertSafe(synthesis.message, {
      maxLength: 2_000,
      forbiddenProfileNames: synthesisContext.participants.map(
        (participant) => participant.profileName,
      ),
    });
    assertReferences(
      synthesis.supportingEvidenceRefs,
      collectPublicEvidenceRefs(synthesisContext),
      "SYNTHESIS_EVIDENCE_NOT_IN_CONTEXT",
    );

    const recordContext = DiscussionRecordContextV1Schema.parse({
      schemaVersion: "discussion-record-context.v1",
      sessionId: evaluatorContext.session.sessionId,
      roomId: evaluatorContext.session.roomId,
      pinnedPackVersionId: evaluatorContext.session.pinnedPackVersionId,
      finalWiki: { ...LivingWikiVersionV1Fixture, kind: "FINAL" },
      messages: evaluatorContext.messages,
      closingLines: [
        {
          responseId: "d0000000-0000-4000-8000-000000000001",
          profileName: "참가자",
          body: "질문은 답보다 관계를 새롭게 보게 했다.",
        },
      ],
    });
    const recordGenerated = await gateway.generate(
      discussionRecordTask,
      recordContext,
    );
    const record = DiscussionRecordOutputV1Schema.parse(recordGenerated.output);
    if (
      record.sessionId !== recordContext.sessionId ||
      record.finalWikiVersion !== recordContext.finalWiki.version ||
      record.basedThroughSeq !== recordContext.finalWiki.basedThroughSeq
    ) {
      throw new LiveEvalError("DISCUSSION_RECORD_ENVELOPE_MISMATCH");
    }
    safety.assertSafe(JSON.stringify(record.record), {
      maxLength: 30_000,
      forbiddenProfileNames: recordContext.messages.map(
        (message) => message.authorProfileName,
      ),
    });
    assertReferences(
      record.supportingEvidenceRefs,
      [
        ...collectPublicEvidenceRefs(recordContext.finalWiki),
        ...recordContext.messages.map((message) =>
          message.kind === "PARTICIPANT"
            ? ({
                type: "MESSAGE",
                messageId: message.messageId,
                seqNo: message.seqNo,
              } satisfies PublicEvidenceRef)
            : ({
                type: "AI_INTERVENTION",
                messageId: message.messageId,
                seqNo: message.seqNo,
              } satisfies PublicEvidenceRef),
        ),
      ],
      "DISCUSSION_RECORD_EVIDENCE_NOT_IN_CONTEXT",
    );

    process.stdout.write(
      `${JSON.stringify({
        status: "PASSED",
        synthesis: report(synthesisGenerated.run),
        discussionRecord: report(recordGenerated.run),
        counts: {
          synthesisPerspectives: synthesis.perspectiveSummaries.length,
          recordIssues: record.record.keyIssues.length,
          changesAndExpansions: record.record.changesAndExpansions.length,
          remainingQuestions: record.record.remainingQuestions.length,
        },
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ status: "FAILED", errorCode: safeCode(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
