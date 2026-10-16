import { AdminAiDiagnosticsSchema } from "@bookseasoning/contracts/admin";

export function createAiDiagnosticsFixture() {
  const metric = { level: "HIGH", reasonCodes: ["CURRENT_ISSUE_REMAINS_FOCUSED"] };
  return AdminAiDiagnosticsSchema.parse({
    checkedAt: "2026-10-16T00:20:00.000Z",
    sessionId: "5d260e93-be2b-4825-9f5e-4398f05c2433",
    phase: "OPENING",
    lastMessageSeq: 8,
    lastParticipantMessageAt: "2026-10-16T00:12:16.000Z",
    lastInterventionAt: "2026-10-16T00:13:29.000Z",
    silenceSeconds: 464,
    cooldownRemainingSeconds: 0,
    awaitingParticipantResponse: true,
    latestJob: null,
    evaluations: [{
      id: "ac100000-0000-4000-8000-000000000001",
      createdAt: "2026-10-16T00:13:27.000Z",
      throughSeq: 7,
      commitStatus: "COMMITTED",
      metrics: { depth: metric, expansion: metric, bookGrounding: metric, saturation: metric,
        participationBalance: metric, relevance: metric, activity: metric },
      confidence: "HIGH",
      action: "REVIVE",
      reasonCodes: ["OBJECTIVE_SILENCE_WITH_EXPLORATION_REMAINING"],
    }],
  });
}
