import {
  BookContextDocumentV1Fixture,
  HostInterventionOutputV1Schema,
  LivingWikiVersionV1Fixture,
  OpeningContextV1Schema,
  OpeningOutputV1Schema,
  PolicyInterventionDecisionV1Fixture,
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
import { LivingWikiPatchEngine } from "../modules/living-wiki/living-wiki-patch.engine.js";
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
  const candidate = await new LivingWikiPatchEngine(resolver).apply({
    scope: {
      sessionId: evaluatorContext.session.sessionId,
      roomId: evaluatorContext.session.roomId,
      pinnedPackVersionId: evaluatorContext.session.pinnedPackVersionId,
      targetThroughSeq: evaluatorContext.session.targetThroughSeq,
    },
    currentWiki: evaluatorContext.baseWiki,
    patch: output.wikiPatch,
  });
  new LivingWikiEvaluatorConsistencyValidator().assertConsistent(
    output,
    candidate.document,
  );
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
    results.push(await evaluatePublicEvaluator());
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
