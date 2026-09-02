import {
  BookContextDocumentV1Fixture,
  HostInterventionOutputV1Schema,
  LivingWikiVersionV1Fixture,
  OpeningContextV1Schema,
  OpeningOutputV1Schema,
  PolicyInterventionDecisionV1Fixture,
  PublicContextV1Schema,
  PublicEvaluatorOutputV1Fixture,
  type AiProviderRunV1,
  type PublicEvidenceRef,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../config/environment.js";
import {
  OpenAiGateway,
  createOpenAiClient,
} from "../infrastructure/ai/openai-ai.gateway.js";
import type { PublicEvidenceResolver } from "../modules/ai-context/public-evidence-reference.resolver.js";
import { HostContextBuilder } from "../modules/ai-host/host-context.builder.js";
import { publicEvaluatorPromptInput } from "../modules/ai-context/public-context-evidence.js";
import { HostOutputValidator } from "../modules/ai-host/host-output.validator.js";
import { OpeningOutputValidator } from "../modules/ai-host/opening-output.validator.js";
import { PublicAiOutputSafetyValidator } from "../modules/ai-host/public-ai-output-safety.validator.js";
import { LivingWikiEvaluatorConsistencyValidator } from "../modules/living-wiki/living-wiki-evaluator-consistency.validator.js";
import { LivingWikiCommitService } from "../modules/living-wiki/living-wiki-commit.service.js";
import { LivingWikiPatchEngine } from "../modules/living-wiki/living-wiki-patch.engine.js";
import type { LivingWikiRepository } from "../modules/living-wiki/living-wiki.repository.js";
import { TopicCheckpointValidator } from "../modules/living-wiki/topic-checkpoint.validator.js";
import { DeterministicPolicyEngine } from "../modules/policy/deterministic-policy.engine.js";
import {
  hostInterventionTask,
  openingTask,
  publicEvaluatorTask,
} from "../modules/ai-provider/ai-task.catalog.js";
import {
  evaluatorContext,
  evaluatorJob,
} from "../modules/public-evaluator/public-evaluator.fixture.js";
import { PublicEvaluatorOutputValidator } from "../modules/public-evaluator/public-evaluator-output.validator.js";

type EvalReport = Readonly<{
  taskAlias: string;
  model: string;
  latencyMs: number;
  requestMetrics: AiProviderRunV1["requestMetrics"];
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
const apiKey = hasConfiguredApiKey
  ? configuredApiKey
  : "live-eval-key-not-configured";
const evaluatorRepeatCount = Math.min(
  5,
  Math.max(1, Number.parseInt(process.env.AI_EVALUATOR_REPEAT_COUNT ?? "1", 10) || 1),
);

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "worker",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "s5-live-eval",
  corsOrigins: ["http://localhost:5173"],
  openAiApiKey: apiKey,
  openAiEvaluatorModel:
    process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-5.6-luna",
  openAiHostModel: process.env.OPENAI_HOST_MODEL ?? "gpt-5.6-terra",
  openAiTimeoutMs: 60_000,
  commandFingerprintKey: "s5-live-eval-command-fingerprint-key",
};
const client = createOpenAiClient(environment);
if (client === undefined) throw new LiveEvalError("OPENAI_CLIENT_UNAVAILABLE");
const gateway = new OpenAiGateway(environment, client);

const resolver = {
  resolve: (_scope: unknown, references: readonly PublicEvidenceRef[]) =>
    Promise.resolve(
      references.map((reference) => ({ reference })) as never,
    ),
} as PublicEvidenceResolver;
const safety = new PublicAiOutputSafetyValidator();

function report(run: AiProviderRunV1): EvalReport {
  return {
    taskAlias: run.taskAlias,
    model: run.model,
    latencyMs: run.latencyMs,
    requestMetrics: run.requestMetrics,
    usage: run.usage,
  };
}

async function evaluateOpening(): Promise<EvalReport> {
  const context = OpeningContextV1Schema.parse({
    schemaVersion: "opening-context.v1",
    session: {
      sessionId: evaluatorJob.sessionId,
      roomId: evaluatorContext.session.roomId,
      pinnedPackVersionId: BookContextDocumentV1Fixture.packVersionId,
      phase: "OPENING",
      phaseVersion: 1,
      basedThroughSeq: 0,
    },
    publicPrep: [
      {
        prepAnswerId: "b0000000-0000-4000-8000-000000000010",
        promptType: "QUOTE_THOUGHT",
        body: "질문이 생각을 열어 준다는 대목에 공감했다.",
      },
      {
        prepAnswerId: "b0000000-0000-4000-8000-000000000011",
        promptType: "DISCUSSION_QUESTION",
        body: "질문보다 관계가 생각을 바꾸는 것은 아닌지 이야기하고 싶다.",
      },
    ],
    bookContext: BookContextDocumentV1Fixture,
  });
  const job = {
    ...evaluatorJob,
    jobType: "OPENING" as const,
    baseWikiVersion: 0,
    targetThroughSeq: 0,
    taskSchemaVersion: "opening-output.v1",
  };
  const generated = await gateway.generate(openingTask, context);
  const output = await new OpeningOutputValidator(resolver, safety).validate(
    job,
    context,
    OpeningOutputV1Schema.parse(generated.output),
  );
  const questionCount = output.message.match(/[?？]/g)?.length ?? 0;
  if (questionCount !== 1) throw new LiveEvalError("OPENING_ONE_QUESTION_REQUIRED");
  return report(generated.run);
}

async function evaluateHost(): Promise<EvalReport> {
  const context = new HostContextBuilder().build({
    publicContext: evaluatorContext,
    evaluation: PublicEvaluatorOutputV1Fixture,
    committedWiki: LivingWikiVersionV1Fixture.document,
    policy: PolicyInterventionDecisionV1Fixture,
  });
  const generated = await gateway.generate(hostInterventionTask, context);
  await new HostOutputValidator(resolver, safety).validate(
    context,
    HostInterventionOutputV1Schema.parse(generated.output),
  );
  return report(generated.run);
}

async function evaluatePublicEvaluator(): Promise<EvalReport> {
  const generated = await gateway.generate(
    publicEvaluatorTask("INCREMENTAL"),
    publicEvaluatorPromptInput(evaluatorContext),
  );
  const output = await new PublicEvaluatorOutputValidator(resolver).validate(
    evaluatorJob,
    evaluatorContext,
    generated.output,
  );
  const repository = {
    commitCandidate: () =>
      Promise.resolve({
        evaluationId: evaluatorJob.jobId,
        status: "COMMITTED" as const,
        committedWikiVersion: 2,
        currentWikiVersion: 2,
        currentBasedThroughSeq: evaluatorJob.targetThroughSeq,
        wroteWikiVersion: true,
        shouldRequeue: false,
      }),
    commitInsufficientFinal: () =>
      Promise.reject(new LiveEvalError("UNEXPECTED_INSUFFICIENT_FINAL")),
  } satisfies LivingWikiRepository;
  await new LivingWikiCommitService(
    new LivingWikiPatchEngine(resolver),
    new TopicCheckpointValidator(),
    new LivingWikiEvaluatorConsistencyValidator(),
    repository,
  ).commitPatch({
    job: evaluatorJob,
    roomId: evaluatorContext.session.roomId,
    pinnedPackVersionId: evaluatorContext.session.pinnedPackVersionId,
    currentWiki: evaluatorContext.baseWiki,
    evaluatorOutput: output,
  });
  return report(generated.run);
}

async function evaluateOpeningPerspectiveDetection(): Promise<EvalReport> {
  const secondParticipantId = "b7000000-0000-4000-8000-000000000099";
  const context = PublicContextV1Schema.parse({
    ...evaluatorContext,
    builtAt: "2026-09-02T04:00:00.000Z",
    session: {
      ...evaluatorContext.session,
      phase: "OPENING",
      phaseVersion: 1,
      targetThroughSeq: 2,
      latestMessageSeq: 2,
    },
    baseWiki: null,
    messages: [
      {
        ...evaluatorContext.messages[0],
        messageId: "b8000000-0000-4000-8000-000000000001",
        seqNo: 1,
        authorParticipantId: evaluatorContext.participants[0]!.participantId,
        body: "조르바의 자유는 사회 규칙보다 개인의 생명력을 앞세운다는 점에서 긍정적이라고 봐요.",
      },
      {
        ...evaluatorContext.messages[1],
        messageId: "b8000000-0000-4000-8000-000000000002",
        seqNo: 2,
        authorParticipantId: secondParticipantId,
        authorProfileName: "두 번째 참가자",
        body: "반대로 타인에 대한 책임이 빠진 자유는 해방이 아니라 방종이어서 경계해야 한다고 생각해요.",
      },
    ],
    participants: [
      {
        ...evaluatorContext.participants[0],
        messageCountThroughCursor: 1,
        lastMessageSeq: 1,
      },
      {
        ...evaluatorContext.participants[0],
        participantId: secondParticipantId,
        profileName: "두 번째 참가자",
        role: "PARTICIPANT",
        messageCountThroughCursor: 1,
        lastMessageSeq: 2,
      },
    ],
    objectiveMetrics: {
      ...evaluatorContext.objectiveMetrics,
      registeredParticipantCount: 2,
      actualParticipantCount: 2,
      connectedParticipantCount: 2,
      recentSpeakerCount: 2,
      silenceSeconds: 60,
    },
  });
  const job = {
    ...evaluatorJob,
    baseWikiVersion: 0,
    targetThroughSeq: 2,
  };
  const generated = await gateway.generate(
    publicEvaluatorTask("INCREMENTAL"),
    publicEvaluatorPromptInput(context),
  );
  const output = await new PublicEvaluatorOutputValidator(resolver).validate(
    job,
    context,
    generated.output,
  );
  const decision = new DeterministicPolicyEngine().decide({
    evaluationId: evaluatorJob.jobId,
    committedWikiVersion: 1,
    context,
    evaluation: output,
    trigger: "PARTICIPATION_THRESHOLD",
    hostHelpReason: null,
  });
  if (decision.action !== "TRANSITION") {
    throw new LiveEvalError("OPENING_DISTINCT_PERSPECTIVES_NOT_DETECTED");
  }
  return report(generated.run);
}

function safeCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return "S5_LIVE_EVAL_FAILED";
}

if (!hasConfiguredApiKey) {
  process.stderr.write(
    `${JSON.stringify({ status: "FAILED", errorCode: "OPENAI_API_KEY_REQUIRED" })}\n`,
  );
  process.exitCode = 1;
} else {
  try {
    const results = [];
    for (let index = 0; index < evaluatorRepeatCount; index += 1) {
      results.push(await evaluatePublicEvaluator());
    }
    results.push(await evaluateOpeningPerspectiveDetection());
    results.push(await evaluateOpening());
    results.push(await evaluateHost());
    process.stdout.write(`${JSON.stringify({ status: "PASSED", results })}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ status: "FAILED", errorCode: safeCode(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
