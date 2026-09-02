import { randomUUID } from "node:crypto";

import type {
  AiProviderRunV1,
  BookBuilderDraftV1,
  BookBuilderInputV1,
  BookBuilderStage,
} from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../config/environment.js";
import {
  OpenAiGateway,
  createOpenAiClient,
} from "../infrastructure/ai/openai-ai.gateway.js";
import type { ClaimedBookBuilderJob } from "../modules/book-builder/book-builder.queue.js";
import { BookBuilderService } from "../modules/book-builder/book-builder.service.js";

type SafeRunReport = Readonly<{
  taskAlias: string;
  model: string;
  latencyMs: number;
  usage: AiProviderRunV1["usage"];
}>;

const sectionCodes = [
  "METADATA",
  "STRUCTURE",
  "THEMES",
  "ENTITIES",
  "SCENES_AND_CLAIMS",
  "DISCUSSION_ISSUES",
  "INTERPRETATION_CAUTIONS",
] as const;

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
  release: "s7-builder-live-eval",
  corsOrigins: ["http://localhost:5173"],
  openAiApiKey: configuredApiKey ?? "live-eval-key-not-configured",
  openAiEvaluatorModel:
    process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-5.6-luna",
  openAiHostModel: process.env.OPENAI_HOST_MODEL ?? "gpt-5.6-terra",
  openAiTimeoutMs: 120_000,
  commandFingerprintKey: "s7-builder-live-eval-command-fingerprint-key",
};

const initialDraft: BookBuilderDraftV1 = {
  schemaVersion: "book-builder-draft.v1",
  shortDescription: "어린 왕자 Book Context Pack 생성 전 초기 초안",
  book: {
    title: "어린 왕자",
    author: "앙투안 드 생텍쥐페리",
    publisher: null,
    publicationYear: null,
    genre: null,
    edition: null,
    translator: null,
    isbn: null,
    identityNote: "한국어 번역본 일반 정보 기준이며 판본별 차이를 출처와 함께 보존한다.",
  },
  sections: sectionCodes.map((code, displayOrder) => ({
    sectionId: randomUUID(),
    code,
    displayOrder,
    coverage: "MISSING",
    reviewStatus: "UNREVIEWED",
    items: [],
  })),
  sources: [],
  itemLinks: [],
  itemSources: [],
};

const runId = randomUUID();
const packVersionId = randomUUID();
const jobFor = (stage: BookBuilderStage): ClaimedBookBuilderJob => ({
  schemaVersion: "book-builder-job.v1",
  jobId: randomUUID(),
  runId,
  packVersionId,
  stage,
  generationNo: 1,
  expectedRevision: 0,
  queueMessageId: "live-eval",
  queueReadCount: 1,
  attemptNo: 1,
  maxAttempts: 1,
  leaseExpiresAt: new Date(Date.now() + 180_000).toISOString(),
});

const inputFor = (
  job: ClaimedBookBuilderJob,
  artifacts: BookBuilderInputV1["artifacts"],
): BookBuilderInputV1 => ({
  jobId: job.jobId,
  runId,
  packVersionId,
  stage: job.stage,
  expectedRevision: 0,
  scope: "INITIAL",
  targetItemId: null,
  draft: initialDraft,
  artifacts,
});

const report = (run: AiProviderRunV1 | null): SafeRunReport => {
  if (run === null) throw new LiveEvalError("PROVIDER_RUN_MISSING");
  return {
    taskAlias: run.taskAlias,
    model: run.model,
    latencyMs: run.latencyMs,
    usage: run.usage,
  };
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
  return "S7_BUILDER_LIVE_EVAL_FAILED";
};

if (!hasConfiguredApiKey) {
  process.stderr.write(
    `${JSON.stringify({ status: "FAILED", errorCode: "OPENAI_API_KEY_REQUIRED" })}\n`,
  );
  process.exitCode = 1;
} else {
  const client = createOpenAiClient(environment);
  if (client === undefined) throw new LiveEvalError("OPENAI_CLIENT_UNAVAILABLE");
  const service = new BookBuilderService(new OpenAiGateway(environment, client));
  try {
    const researchJob = jobFor("DISCOVER_SOURCES");
    const research = await service.run(researchJob, inputFor(researchJob, []));
    const draftJob = jobFor("BUILD_SECTIONS");
    const built = await service.run(
      draftJob,
      inputFor(draftJob, [research.artifact]),
    );
    const validationJob = jobFor("VALIDATE_DRAFT");
    const validated = await service.run(
      validationJob,
      inputFor(validationJob, [research.artifact, built.artifact]),
    );
    const draft = validated.artifact as BookBuilderDraftV1;
    process.stdout.write(
      `${JSON.stringify({
        status: "PASSED",
        research: report(research.providerRun),
        draft: report(built.providerRun),
        counts: {
          sources: Array.isArray(research.artifact["sources"])
            ? research.artifact["sources"].length
            : 0,
          claims: Array.isArray(research.artifact["claims"])
            ? research.artifact["claims"].length
            : 0,
          sections: draft.sections.length,
          items: draft.sections.reduce(
            (sum, section) => sum + section.items.length,
            0,
          ),
          evidenceLinks: draft.itemSources.length,
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
