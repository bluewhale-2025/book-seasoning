import { z } from "zod";

import { SessionPhaseSchema } from "../public/session.js";

const CodeSchema = z.string().max(100).regex(/^[A-Z][A-Z0-9_]*$/)
  .refine((value) => !value.includes("AI_PRIVATE"), "Private-lane codes are not diagnostic output");
const CodesSchema = z.array(CodeSchema).max(30);
const TimeSchema = z.iso.datetime({ offset: true });
const MetricSchema = z.strictObject({
  level: z.enum(["LOW", "MEDIUM", "HIGH"]),
  reasonCodes: CodesSchema,
});

// A deliberately narrow projection: never accept text, evidence or participant data.
export const AdminAiDiagnosticsSchema = z.strictObject({
  checkedAt: TimeSchema,
  sessionId: z.uuid(),
  phase: SessionPhaseSchema,
  lastMessageSeq: z.int().nonnegative(),
  lastParticipantMessageAt: TimeSchema.nullable(),
  lastInterventionAt: TimeSchema.nullable(),
  silenceSeconds: z.int().nonnegative().nullable(),
  cooldownRemainingSeconds: z.int().nonnegative(),
  awaitingParticipantResponse: z.boolean(),
  latestJob: z.strictObject({
    id: z.uuid(),
    type: CodeSchema,
    status: z.enum(["PENDING", "PROCESSING", "RETRY_SCHEDULED", "SUCCEEDED", "SUPPRESSED", "FAILED"]),
    attemptCount: z.int().nonnegative(),
    errorCode: CodeSchema.nullable(),
    suppressionReason: CodeSchema.nullable(),
  }).nullable(),
  evaluations: z.array(z.strictObject({
    id: z.uuid(),
    createdAt: TimeSchema,
    throughSeq: z.int().nonnegative(),
    commitStatus: z.enum(["COMMITTED", "PATCH_REJECTED", "SUPPRESSED_STALE_BASE"]),
    metrics: z.strictObject({
      depth: MetricSchema,
      expansion: MetricSchema,
      bookGrounding: MetricSchema,
      saturation: MetricSchema,
      participationBalance: MetricSchema,
      relevance: MetricSchema,
      activity: MetricSchema,
    }),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
    action: z.enum(["WAIT", "DEEPEN", "EXPAND", "RECONNECT", "RECONNECT_TO_BOOK", "RECONNECT_AND_REFLECT", "INVITE", "REVIVE", "SUMMARIZE", "TRANSITION", "RECOMMEND_EXTENSION"]).nullable(),
    reasonCodes: CodesSchema,
  })).max(20),
});

export type AdminAiDiagnostics = z.infer<typeof AdminAiDiagnosticsSchema>;
