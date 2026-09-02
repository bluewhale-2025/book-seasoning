export const SESSION_TIMING_MS = Object.freeze({
  discussion: 30 * 60 * 1_000,
  extension: 15 * 60 * 1_000,
  extensionPromptBeforeEnd: 7 * 60 * 1_000,
  extensionDecisionBeforeEnd: 5 * 60 * 1_000,
  closing: 5 * 60 * 1_000,
});

export type ActiveDiscussionPhase = "OPENING" | "CORE" | "EXTENDED";
export type TimedSessionPhase = ActiveDiscussionPhase | "SYNTHESIS" | "CLOSING" | "ENDED";

export type TimedSessionState = Readonly<{
  phase: TimedSessionPhase;
  extensionCount: number;
  discussionEndsAtMs: number;
  extensionPromptedAtMs: number | null;
  extensionDecisionDeadlineAtMs: number | null;
  closingEndsAtMs: number | null;
}>;

export type DueSessionTransition = Readonly<
  | { reason: "EXTENSION_WINDOW_OPENED"; phase: ActiveDiscussionPhase }
  | { reason: "SYNTHESIS_STARTED_BY_TIMEOUT"; phase: "SYNTHESIS" }
  | { reason: "CLOSING_STARTED"; phase: "CLOSING"; closingEndsAtMs: number }
  | { reason: "CLOSING_EXPIRED"; phase: "ENDED" }
>;

export function initialSessionTiming(nowMs: number): Pick<
  TimedSessionState,
  "discussionEndsAtMs" | "extensionDecisionDeadlineAtMs"
> {
  const discussionEndsAtMs = nowMs + SESSION_TIMING_MS.discussion;
  return {
    discussionEndsAtMs,
    extensionDecisionDeadlineAtMs:
      discussionEndsAtMs - SESSION_TIMING_MS.extensionDecisionBeforeEnd,
  };
}

export function canHostDecideExtension(
  state: TimedSessionState,
  nowMs: number,
): boolean {
  return (
    isActiveDiscussionPhase(state.phase) &&
    state.extensionPromptedAtMs !== null &&
    state.extensionDecisionDeadlineAtMs !== null &&
    nowMs < state.extensionDecisionDeadlineAtMs
  );
}

export function extendedSessionTiming(
  state: TimedSessionState,
): Pick<
  TimedSessionState,
  | "phase"
  | "extensionCount"
  | "discussionEndsAtMs"
  | "extensionPromptedAtMs"
  | "extensionDecisionDeadlineAtMs"
> {
  const discussionEndsAtMs = state.discussionEndsAtMs + SESSION_TIMING_MS.extension;
  return {
    phase: "EXTENDED",
    extensionCount: state.extensionCount + 1,
    discussionEndsAtMs,
    extensionPromptedAtMs: null,
    extensionDecisionDeadlineAtMs:
      discussionEndsAtMs - SESSION_TIMING_MS.extensionDecisionBeforeEnd,
  };
}

export function nextDueSessionTransition(
  state: TimedSessionState,
  nowMs: number,
): DueSessionTransition | null {
  if (isActiveDiscussionPhase(state.phase)) {
    if (
      state.extensionDecisionDeadlineAtMs !== null &&
      nowMs >= state.extensionDecisionDeadlineAtMs
    ) {
      return { reason: "SYNTHESIS_STARTED_BY_TIMEOUT", phase: "SYNTHESIS" };
    }
    if (
      state.extensionPromptedAtMs === null &&
      nowMs >= state.discussionEndsAtMs - SESSION_TIMING_MS.extensionPromptBeforeEnd
    ) {
      return { reason: "EXTENSION_WINDOW_OPENED", phase: state.phase };
    }
    return null;
  }
  if (state.phase === "SYNTHESIS" && nowMs >= state.discussionEndsAtMs) {
    return {
      reason: "CLOSING_STARTED",
      phase: "CLOSING",
      closingEndsAtMs: nowMs + SESSION_TIMING_MS.closing,
    };
  }
  if (
    state.phase === "CLOSING" &&
    state.closingEndsAtMs !== null &&
    nowMs >= state.closingEndsAtMs
  ) {
    return { reason: "CLOSING_EXPIRED", phase: "ENDED" };
  }
  return null;
}

export function canHostEndSession(phase: TimedSessionPhase): boolean {
  return phase !== "ENDED";
}

function isActiveDiscussionPhase(
  phase: TimedSessionPhase,
): phase is ActiveDiscussionPhase {
  return phase === "OPENING" || phase === "CORE" || phase === "EXTENDED";
}
