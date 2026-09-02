import { describe, expect, it } from "vitest";

import type { SessionPhase } from "@bookseasoning/contracts/public";

import { SessionPhasePolicy } from "./session-phase.policy.js";

describe("SessionPhasePolicy", () => {
  const policy = new SessionPhasePolicy();

  it("keeps the waiting room connected while chat remains closed", () => {
    expect(policy.for("SCHEDULED")).toEqual({
      acceptsConnection: true,
      canStart: true,
      canEditPrep: true,
      canSendMessage: false,
      marksActualParticipationOnEntry: false,
      terminal: false,
    });
  });

  it.each<SessionPhase>(["OPENING", "CORE", "EXTENDED", "SYNTHESIS"])(
    "allows confirmed messages during %s",
    (phase) => {
      expect(policy.for(phase).canSendMessage).toBe(true);
      expect(policy.for(phase).marksActualParticipationOnEntry).toBe(true);
    },
  );

  it("keeps reconnect and participation open while closing chat", () => {
    expect(policy.for("CLOSING")).toMatchObject({
      acceptsConnection: true,
      canSendMessage: false,
      marksActualParticipationOnEntry: true,
      terminal: false,
    });
  });

  it.each<SessionPhase>(["ENDED", "CANCELED"])(
    "closes commands and connections after %s",
    (phase) => {
      expect(policy.for(phase)).toEqual({
        acceptsConnection: false,
        canStart: false,
        canEditPrep: false,
        canSendMessage: false,
        marksActualParticipationOnEntry: false,
        terminal: true,
      });
    },
  );
});
