import { describe, expect, it } from "vitest";

import {
  SESSION_TIMING_MS,
  canHostDecideExtension,
  extendedSessionTiming,
  initialSessionTiming,
  nextDueSessionTransition,
  type TimedSessionState,
} from "./index.js";

function activeState(overrides: Partial<TimedSessionState> = {}): TimedSessionState {
  return {
    phase: "CORE",
    extensionCount: 0,
    discussionEndsAtMs: 30 * 60 * 1_000,
    extensionPromptedAtMs: null,
    extensionDecisionDeadlineAtMs: 25 * 60 * 1_000,
    closingEndsAtMs: null,
    ...overrides,
  };
}

describe("session machine", () => {
  it("creates a 30 minute discussion with a decision deadline at five minutes remaining", () => {
    expect(initialSessionTiming(1_000)).toEqual({
      discussionEndsAtMs: 1_000 + SESSION_TIMING_MS.discussion,
      extensionDecisionDeadlineAtMs:
        1_000 +
        SESSION_TIMING_MS.discussion -
        SESSION_TIMING_MS.extensionDecisionBeforeEnd,
    });
  });

  it("opens the extension window at seven minutes and times out to synthesis at five", () => {
    const state = activeState();
    expect(nextDueSessionTransition(state, 23 * 60 * 1_000)).toEqual({
      reason: "EXTENSION_WINDOW_OPENED",
      phase: "CORE",
    });
    expect(nextDueSessionTransition(state, 25 * 60 * 1_000)).toEqual({
      reason: "SYNTHESIS_STARTED_BY_TIMEOUT",
      phase: "SYNTHESIS",
    });
  });

  it("allows repeated extension only while the current decision window is open", () => {
    const prompted = activeState({ extensionPromptedAtMs: 23 * 60 * 1_000 });
    expect(canHostDecideExtension(prompted, 24 * 60 * 1_000)).toBe(true);
    expect(canHostDecideExtension(prompted, 25 * 60 * 1_000)).toBe(false);

    const first = extendedSessionTiming(prompted);
    const second = extendedSessionTiming({ ...prompted, ...first });
    expect(first.extensionCount).toBe(1);
    expect(second.extensionCount).toBe(2);
    expect(second.discussionEndsAtMs).toBe(60 * 60 * 1_000);
  });

  it("starts a five minute closing and ends it at the authoritative deadline", () => {
    const synthesis = activeState({
      phase: "SYNTHESIS",
      extensionDecisionDeadlineAtMs: null,
    });
    const closing = nextDueSessionTransition(synthesis, synthesis.discussionEndsAtMs);
    expect(closing).toEqual({
      reason: "CLOSING_STARTED",
      phase: "CLOSING",
      closingEndsAtMs: synthesis.discussionEndsAtMs + SESSION_TIMING_MS.closing,
    });
    expect(
      nextDueSessionTransition(
        activeState({
          phase: "CLOSING",
          closingEndsAtMs: synthesis.discussionEndsAtMs + SESSION_TIMING_MS.closing,
        }),
        synthesis.discussionEndsAtMs + SESSION_TIMING_MS.closing,
      ),
    ).toEqual({ reason: "CLOSING_EXPIRED", phase: "ENDED" });
  });
});
