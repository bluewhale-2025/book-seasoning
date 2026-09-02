import { describe, expect, it } from "vitest";

import {
  messageEventFixture,
  messageFixture,
  sessionSnapshotFixture,
} from "../../test/session-fixture";
import {
  mergeSessionSync,
  prependMessagePage,
  projectSessionEvent,
} from "./session-projection";

describe("session projection", () => {
  it("applies a contiguous event once and ignores its duplicate", () => {
    const initial = sessionSnapshotFixture();
    const event = messageEventFixture(messageFixture(2));
    const applied = projectSessionEvent(initial, event);

    expect(applied.kind).toBe("applied");
    expect(applied.snapshot.messages.map((message) => message.seqNo)).toEqual([1, 2]);
    expect(projectSessionEvent(applied.snapshot, event).kind).toBe("duplicate");
  });

  it("does not guess across an event cursor gap", () => {
    const result = projectSessionEvent(
      sessionSnapshotFixture(),
      messageEventFixture(messageFixture(3)),
    );

    expect(result.kind).toBe("gap");
    expect(result.snapshot.cursors.eventCursor).toBe(1);
    expect(result.snapshot.messages).toHaveLength(1);
  });

  it("projects a committed extension opinion without changing message cursors", () => {
    const initial = sessionSnapshotFixture();
    const result = projectSessionEvent(initial, {
      eventId: "75000000-0000-4000-8000-000000000090",
      sessionId: initial.sessionId,
      eventCursor: 2,
      aggregateVersion: 2,
      channelEpoch: 1,
      occurredAt: initial.serverTime,
      type: "SESSION_AI_STATE_CHANGED",
      payload: {
        extensionOpinion: {
          phaseVersion: 2,
          status: "READY",
          recommendation: "EXTEND",
          reason: "새 관점이 이어지고 있습니다.",
          basedThroughSeq: 1,
        },
      },
    });

    expect(result.kind).toBe("applied");
    expect(result.snapshot.ai.extensionOpinion?.recommendation).toBe("EXTEND");
    expect(result.snapshot.cursors.latestMessageSeq).toBe(1);
  });

  it("projects Closing progress without exposing another participant response", () => {
    const initial = sessionSnapshotFixture();
    const result = projectSessionEvent(initial, {
      eventId: "75000000-0000-4000-8000-000000000091",
      sessionId: initial.sessionId,
      eventCursor: 2,
      aggregateVersion: 2,
      channelEpoch: 1,
      occurredAt: initial.serverTime,
      type: "SESSION_CLOSING_PROGRESS_CHANGED",
      payload: {
        eligibleParticipantCount: 2,
        completedParticipantCount: 1,
      },
    });

    expect(result.kind).toBe("applied");
    expect(result.snapshot.closing).toEqual({
      eligibleParticipantCount: 2,
      completedParticipantCount: 1,
      actorResponse: null,
    });
  });

  it("projects the durable discussion result state", () => {
    const initial = sessionSnapshotFixture();
    const result = projectSessionEvent(initial, {
      eventId: "75000000-0000-4000-8000-000000000092",
      sessionId: initial.sessionId,
      eventCursor: 2,
      aggregateVersion: 2,
      channelEpoch: 1,
      occurredAt: initial.serverTime,
      type: "SESSION_RESULT_STATE_CHANGED",
      payload: { result: { status: "PROCESSING", canRetry: false } },
    });

    expect(result.kind).toBe("applied");
    expect(result.snapshot.result).toEqual({
      status: "PROCESSING",
      canRetry: false,
    });
  });

  it("merges reconnect gaps and older pages without duplicate messages", () => {
    const initial = sessionSnapshotFixture([messageFixture(3)]);
    const incoming = sessionSnapshotFixture([messageFixture(4), messageFixture(5)]);
    const merged = mergeSessionSync(initial, incoming);
    const withHistory = prependMessagePage(merged, {
      sessionId: initial.sessionId,
      serverTime: initial.serverTime,
      messages: [messageFixture(1), messageFixture(2), messageFixture(3)],
      page: { oldestMessageSeq: 1, newestMessageSeq: 3, hasMoreBefore: false },
    });

    expect(withHistory.messages.map((message) => message.seqNo)).toEqual([1, 2, 3, 4, 5]);
    expect(withHistory.cursors.hasMoreMessagesBefore).toBe(false);
  });
});
