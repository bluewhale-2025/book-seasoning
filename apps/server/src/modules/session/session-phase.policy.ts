import { Injectable } from "@nestjs/common";

import type { SessionPhase } from "@bookseasoning/contracts/public";

export type SessionPhaseCapabilities = Readonly<{
  acceptsConnection: boolean;
  canStart: boolean;
  canEditPrep: boolean;
  canSendMessage: boolean;
  marksActualParticipationOnEntry: boolean;
  terminal: boolean;
}>;

const CLOSED_CAPABILITIES: SessionPhaseCapabilities = Object.freeze({
  acceptsConnection: false,
  canStart: false,
  canEditPrep: false,
  canSendMessage: false,
  marksActualParticipationOnEntry: false,
  terminal: true,
});

const PHASE_CAPABILITIES: Readonly<
  Record<SessionPhase, SessionPhaseCapabilities>
> = Object.freeze({
  SCHEDULED: Object.freeze({
    acceptsConnection: true,
    canStart: true,
    canEditPrep: true,
    canSendMessage: false,
    marksActualParticipationOnEntry: false,
    terminal: false,
  }),
  OPENING: activeDiscussionCapabilities(true),
  CORE: activeDiscussionCapabilities(true),
  EXTENDED: activeDiscussionCapabilities(true),
  SYNTHESIS: activeDiscussionCapabilities(true),
  CLOSING: Object.freeze({
    acceptsConnection: true,
    canStart: false,
    canEditPrep: false,
    canSendMessage: false,
    marksActualParticipationOnEntry: true,
    terminal: false,
  }),
  ENDED: CLOSED_CAPABILITIES,
  CANCELED: CLOSED_CAPABILITIES,
});

function activeDiscussionCapabilities(
  canSendMessage: boolean,
): SessionPhaseCapabilities {
  return Object.freeze({
    acceptsConnection: true,
    canStart: false,
    canEditPrep: false,
    canSendMessage,
    marksActualParticipationOnEntry: true,
    terminal: false,
  });
}

@Injectable()
export class SessionPhasePolicy {
  public for(phase: SessionPhase): SessionPhaseCapabilities {
    return PHASE_CAPABILITIES[phase];
  }
}
