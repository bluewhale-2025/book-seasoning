import type { SessionSnapshot } from "@bookseasoning/contracts/public";

const ACTIVE_SESSION_PHASES = [
  "OPENING",
  "CORE",
  "EXTENDED",
  "SYNTHESIS",
  "CLOSING",
] as const;

export function canComposeSessionMessage(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.actor.actualParticipation &&
    ["OPENING", "CORE", "EXTENDED", "SYNTHESIS"].includes(snapshot.state.phase)
  );
}

export function isSessionReadOnly(snapshot: SessionSnapshot): boolean {
  return ["ENDED", "CANCELED", "CLOSING"].includes(snapshot.state.phase);
}

export function canHostEndSession(snapshot: SessionSnapshot): boolean {
  return (
    snapshot.actor.role === "HOST" &&
    ACTIVE_SESSION_PHASES.some((phase) => phase === snapshot.state.phase)
  );
}

export function hasExtensionDecisionWindow(snapshot: SessionSnapshot): boolean {
  return (
    ["OPENING", "CORE", "EXTENDED"].includes(snapshot.state.phase) &&
    snapshot.state.deadlines.extensionPromptedAt !== null &&
    snapshot.state.deadlines.extensionDecisionDeadlineAt !== null
  );
}

export function sessionCountdownDeadline(snapshot: SessionSnapshot): string | null {
  if (snapshot.state.phase === "CLOSING") {
    return snapshot.state.deadlines.closingEndsAt;
  }
  if (
    ["OPENING", "CORE", "EXTENDED", "SYNTHESIS"].includes(
      snapshot.state.phase,
    )
  ) {
    return snapshot.state.deadlines.discussionEndsAt;
  }
  return null;
}
