import type {
  SendSessionMessageResponse,
  SessionEvent,
  SessionMessage,
  SessionMessagePage,
  SessionSnapshot,
} from "@bookseasoning/contracts/public";

export type EventProjectionResult =
  | Readonly<{ kind: "applied" | "duplicate"; snapshot: SessionSnapshot }>
  | Readonly<{ kind: "gap"; snapshot: SessionSnapshot }>;

function orderedMessages(messages: readonly SessionMessage[]): SessionMessage[] {
  return [...new Map(messages.map((message) => [message.messageId, message])).values()].sort(
    (left, right) => left.seqNo - right.seqNo,
  );
}

function orderedEvents(events: readonly SessionEvent[]): SessionEvent[] {
  return [...new Map(events.map((event) => [event.eventId, event])).values()]
    .sort((left, right) => left.eventCursor - right.eventCursor)
    .slice(-200);
}

export function mergeSessionSync(
  current: SessionSnapshot,
  incoming: SessionSnapshot,
): SessionSnapshot {
  return {
    ...incoming,
    messages: orderedMessages([...current.messages, ...incoming.messages]),
    events: orderedEvents([...current.events, ...incoming.events]),
    cursors: {
      ...incoming.cursors,
      oldestMessageSeq:
        orderedMessages([...current.messages, ...incoming.messages])[0]?.seqNo ??
        incoming.cursors.oldestMessageSeq,
      hasMoreMessagesBefore:
        current.cursors.hasMoreMessagesBefore || incoming.cursors.hasMoreMessagesBefore,
    },
  };
}

export function prependMessagePage(
  current: SessionSnapshot,
  page: SessionMessagePage,
): SessionSnapshot {
  const messages = orderedMessages([...page.messages, ...current.messages]);
  return {
    ...current,
    messages,
    cursors: {
      ...current.cursors,
      oldestMessageSeq: messages[0]?.seqNo ?? null,
      hasMoreMessagesBefore: page.page.hasMoreBefore,
    },
  };
}

export function projectSessionEvent(
  current: SessionSnapshot,
  event: SessionEvent,
): EventProjectionResult {
  if (event.sessionId !== current.sessionId) return { kind: "gap", snapshot: current };
  if (event.eventCursor <= current.cursors.eventCursor) {
    return { kind: "duplicate", snapshot: current };
  }
  if (
    event.eventCursor !== current.cursors.eventCursor + 1 ||
    event.aggregateVersion !== current.state.aggregateVersion + 1
  ) {
    return { kind: "gap", snapshot: current };
  }

  let next: SessionSnapshot = {
    ...current,
    events: orderedEvents([...current.events, event]),
    cursors: {
      ...current.cursors,
      eventCursor: event.eventCursor,
      hasMoreEventsAfter: false,
    },
  };

  if (event.type === "MESSAGE_APPENDED") {
    if (event.payload.message.seqNo !== current.cursors.latestMessageSeq + 1) {
      return { kind: "gap", snapshot: current };
    }
    next = {
      ...next,
      messages: orderedMessages([...current.messages, event.payload.message]),
      state: { ...current.state, aggregateVersion: event.aggregateVersion },
      cursors: {
        ...next.cursors,
        latestMessageSeq: event.payload.message.seqNo,
      },
    };
  } else if (event.type === "SESSION_STATE_CHANGED") {
    next = { ...next, state: event.payload.state };
  } else if (event.type === "SESSION_AI_STATE_CHANGED") {
    next = {
      ...next,
      ai: { ...current.ai, extensionOpinion: event.payload.extensionOpinion },
      state: { ...current.state, aggregateVersion: event.aggregateVersion },
    };
  } else if (event.type === "SESSION_CLOSING_PROGRESS_CHANGED") {
    next = {
      ...next,
      closing: {
        eligibleParticipantCount: event.payload.eligibleParticipantCount,
        completedParticipantCount: event.payload.completedParticipantCount,
        actorResponse: current.closing?.actorResponse ?? null,
      },
      state: { ...current.state, aggregateVersion: event.aggregateVersion },
    };
  } else if (event.type === "SESSION_RESULT_STATE_CHANGED") {
    next = {
      ...next,
      result: event.payload.result,
      state: { ...current.state, aggregateVersion: event.aggregateVersion },
    };
  } else if (event.type === "SESSION_PARTICIPANT_CHANGED") {
    const participants = event.payload.participant
      ? [
          ...current.participants.filter(
            (participant) => participant.userId !== event.payload.participantUserId,
          ),
          event.payload.participant,
        ]
      : current.participants.filter(
          (participant) => participant.userId !== event.payload.participantUserId,
        );
    next = {
      ...next,
      participants,
      connectedParticipantCount: event.payload.connectedParticipantCount,
      state: { ...current.state, aggregateVersion: event.aggregateVersion },
    };
  }

  return { kind: "applied", snapshot: next };
}

export function projectConfirmedMessage(
  current: SessionSnapshot,
  response: SendSessionMessageResponse,
): EventProjectionResult {
  if (
    response.message.sessionId === current.sessionId &&
    response.eventCursor === current.cursors.eventCursor + 1 &&
    response.aggregateVersion === current.state.aggregateVersion + 1 &&
    response.message.seqNo === current.cursors.latestMessageSeq + 1
  ) {
    return {
      kind: "applied",
      snapshot: {
        ...current,
        messages: orderedMessages([...current.messages, response.message]),
        state: { ...current.state, aggregateVersion: response.aggregateVersion },
        cursors: {
          ...current.cursors,
          eventCursor: response.eventCursor,
          latestMessageSeq: response.message.seqNo,
        },
      },
    };
  }

  return {
    kind: "gap",
    snapshot: {
      ...current,
      messages: orderedMessages([...current.messages, response.message]),
    },
  };
}
