import { describe, expect, it } from "vitest";

import {
  mapAppendSessionMessageRow,
  mapEndSessionRow,
  mapExtendSessionRow,
  mapSessionMessagePageRow,
  mapRequestSessionAiHelpRow,
  mapSessionHeartbeatRow,
  mapSessionSyncRow,
  mapStartSessionRow,
  mapStartSynthesisRow,
} from "./supabase-session.gateway.js";

describe("SupabaseSessionGateway row mappers", () => {
  it("validates an authoritative sync row including private topic epochs", () => {
    const result = mapSessionSyncRow({
      snapshot: {
        sessionId: "73000000-0000-4000-8000-000000000002",
        serverTime: "2026-09-02T00:00:00+00:00",
        room: {
          roomId: "73000000-0000-4000-8000-000000000001",
          title: "동기화 방",
          scheduledStartAt: "2026-09-02T00:00:00+00:00",
          packVersionId: "73000000-0000-4000-8000-000000000009",
          bookTitle: "책",
          bookAuthor: "작가",
          bookCoverUrl: null,
        },
        actor: {
          userId: "73000000-0000-4000-8000-000000000005",
          role: "PARTICIPANT",
          membershipStatus: "PARTICIPATED",
          actualParticipation: true,
        },
        state: {
          phase: "CORE",
          phaseVersion: 2,
          aggregateVersion: 4,
          channelEpoch: 3,
          startedAt: "2026-09-02T00:00:00+00:00",
          endedAt: null,
          extensionCount: 0,
          deadlines: {
            discussionEndsAt: "2026-09-02T00:30:00+00:00",
            extensionPromptedAt: null,
            extensionDecisionDeadlineAt: "2026-09-02T00:25:00+00:00",
            closingStartedAt: null,
            closingEndsAt: null,
          },
        },
        participants: [],
        connectedParticipantCount: 0,
        messages: [],
        events: [],
        cursors: {
          eventCursor: 4,
          latestMessageSeq: 2,
          oldestMessageSeq: null,
          hasMoreMessagesBefore: false,
          hasMoreMessagesAfter: false,
          hasMoreEventsAfter: false,
        },
        publicDiscussion: { currentTopic: null },
        ai: { extensionOpinion: null, latestHostHelpRequest: null },
        closing: null,
        result: { status: "NOT_STARTED", canRetry: false },
        realtime: {
          eventTopic: "session:73000000-0000-4000-8000-000000000002:v3",
          ephemeralTopic:
            "session:73000000-0000-4000-8000-000000000002:v3:ephemeral",
        },
      },
    });

    expect(result).toMatchObject({
      serverTime: "2026-09-02T00:00:00.000Z",
      room: { scheduledStartAt: "2026-09-02T00:00:00.000Z" },
      state: { phase: "CORE", channelEpoch: 3 },
      realtime: {
        eventTopic: "session:73000000-0000-4000-8000-000000000002:v3",
      },
    });
  });

  it("validates an empty backward message page", () => {
    expect(
      mapSessionMessagePageRow({
        page: {
          sessionId: "73000000-0000-4000-8000-000000000002",
          serverTime: "2026-09-02T00:00:00.000Z",
          messages: [],
          page: {
            oldestMessageSeq: null,
            newestMessageSeq: null,
            hasMoreBefore: false,
          },
        },
      }),
    ).toMatchObject({ messages: [], page: { hasMoreBefore: false } });
  });

  it("maps an inline reply and its original event cursor", () => {
    const result = mapAppendSessionMessageRow({
      room_id: "73000000-0000-4000-8000-000000000001",
      session_id: "73000000-0000-4000-8000-000000000002",
      message_id: "73000000-0000-4000-8000-000000000004",
      seq_no: 2,
      kind: "PARTICIPANT",
      author_user_id: "73000000-0000-4000-8000-000000000005",
      author_profile_name: "답장 작성자",
      client_message_id: "73000000-0000-4000-8000-000000000006",
      body: "이 관점에 동의해요.",
      reply_to_message_id: "73000000-0000-4000-8000-000000000007",
      reply_author_profile_name: "원문 작성자",
      reply_quote: "원문입니다.",
      confirmed_at: "2026-09-01T12:00:01+00:00",
      aggregate_version: 3,
      event_cursor: 3,
      channel_epoch: 1,
      duplicate: true,
      server_time: "2026-09-01T12:00:02+00:00",
    });

    expect(result).toMatchObject({
      message: {
        seqNo: 2,
        reply: {
          authorProfileName: "원문 작성자",
          quote: "원문입니다.",
        },
      },
      eventCursor: 3,
      duplicate: true,
    });
  });

  it("maps a heartbeat row into the public contract", () => {
    expect(
      mapSessionHeartbeatRow({
        room_id: "73000000-0000-4000-8000-000000000001",
        session_id: "73000000-0000-4000-8000-000000000002",
        device_id: "73000000-0000-4000-8000-000000000003",
        membership_status: "REGISTERED",
        aggregate_version: 0,
        event_cursor: 0,
        channel_epoch: 1,
        connected_participant_count: 1,
        heartbeat_interval_seconds: 15,
        online_threshold_seconds: 30,
        last_seen_at: "2026-09-01T12:00:00+00:00",
        server_time: "2026-09-01T12:00:00+00:00",
      }),
    ).toMatchObject({
      connectedParticipantCount: 1,
      lastSeenAt: "2026-09-01T12:00:00.000Z",
    });
  });

  it("maps a host-help queue receipt without provider details", () => {
    expect(
      mapRequestSessionAiHelpRow({
        room_id: "73000000-0000-4000-8000-000000000001",
        session_id: "73000000-0000-4000-8000-000000000002",
        request_id: "73000000-0000-4000-8000-000000000010",
        job_id: "73000000-0000-4000-8000-000000000011",
        request_status: "QUEUED",
        retry_available_at: "2026-09-01T12:01:30+00:00",
        duplicate: false,
        server_time: "2026-09-01T12:00:00+00:00",
      }),
    ).toEqual({
      roomId: "73000000-0000-4000-8000-000000000001",
      sessionId: "73000000-0000-4000-8000-000000000002",
      requestId: "73000000-0000-4000-8000-000000000010",
      jobId: "73000000-0000-4000-8000-000000000011",
      status: "QUEUED",
      retryAvailableAt: "2026-09-01T12:01:30.000Z",
      duplicate: false,
      serverTime: "2026-09-01T12:00:00.000Z",
    });
  });

  it("maps an opening transition with authoritative deadlines", () => {
    const result = mapStartSessionRow({
      room_id: "73000000-0000-4000-8000-000000000001",
      session_id: "73000000-0000-4000-8000-000000000002",
      phase: "OPENING",
      phase_version: 1,
      aggregate_version: 1,
      channel_epoch: 1,
      event_cursor: 1,
      connected_participant_count: 2,
      min_participants: 2,
      started_at: "2026-09-01T12:00:00+00:00",
      discussion_ends_at: "2026-09-01T12:30:00+00:00",
      extension_decision_deadline_at: "2026-09-01T12:25:00+00:00",
      duplicate: false,
      server_time: "2026-09-01T12:00:00+00:00",
    });

    expect(result.state).toMatchObject({
      phase: "OPENING",
      phaseVersion: 1,
      deadlines: {
        discussionEndsAt: "2026-09-01T12:30:00.000Z",
        extensionDecisionDeadlineAt: "2026-09-01T12:25:00.000Z",
      },
    });
  });

  it("normalizes authoritative control-state timestamps", () => {
    const base = {
      room_id: "73000000-0000-4000-8000-000000000001",
      session_id: "73000000-0000-4000-8000-000000000002",
      state: {
        phase: "EXTENDED",
        phaseVersion: 3,
        aggregateVersion: 4,
        channelEpoch: 1,
        startedAt: "2026-09-01T12:00:00+00:00",
        endedAt: null,
        extensionCount: 1,
        deadlines: {
          discussionEndsAt: "2026-09-01T12:45:00+00:00",
          extensionPromptedAt: null,
          extensionDecisionDeadlineAt: "2026-09-01T12:40:00+00:00",
          closingStartedAt: null,
          closingEndsAt: null,
        },
      },
      event_cursor: 4,
      duplicate: false,
      server_time: "2026-09-01T12:23:00+00:00",
    };

    expect(mapExtendSessionRow(base).state.deadlines.discussionEndsAt).toBe(
      "2026-09-01T12:45:00.000Z",
    );
    expect(
      mapStartSynthesisRow({
        ...base,
        state: { ...base.state, phase: "SYNTHESIS" },
      }).state.phase,
    ).toBe("SYNTHESIS");
    expect(
      mapEndSessionRow({
        ...base,
        state: {
          ...base.state,
          phase: "ENDED",
          endedAt: "2026-09-01T12:24:00+00:00",
        },
      }).state.endedAt,
    ).toBe("2026-09-01T12:24:00.000Z");
  });
});
