import type { AiJobEnvelopeV1 } from "./ai-job.js";

export const AiJobEnvelopeV1Fixture = {
  schemaVersion: "ai-job.v1",
  jobId: "c0000000-0000-4000-8000-000000000001",
  jobType: "PUBLIC_EVALUATION",
  sessionId: "90000000-0000-4000-8000-000000000001",
  baseWikiVersion: 1,
  targetThroughSeq: 4,
  taskSchemaVersion: "public-evaluator-output.v1",
} satisfies AiJobEnvelopeV1;

export const AiJobContentLeakFixture = {
  ...AiJobEnvelopeV1Fixture,
  messageBody: "queue payload must never carry discussion content",
};

export const AiJobPrivateLeakFixture = {
  ...AiJobEnvelopeV1Fixture,
  aiPrivate: "AI_PRIVATE_CANARY_QUEUE_DO_NOT_DISCLOSE",
};
