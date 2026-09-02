import * as React from "react";
import type {
  ClosingResponseCommandResponse,
  DeleteClosingResponseRequest,
  EndSessionRequest,
  EndSessionResponse,
  ExtendSessionRequest,
  ExtendSessionResponse,
  GetDiscussionResultResponse,
  RetryDiscussionResultResponse,
  SendSessionMessageRequest,
  SendSessionMessageResponse,
  SessionEvent,
  SessionHeartbeatResponse,
  SessionMessagePage,
  SessionSnapshot,
  SessionSyncQuery,
  SessionTypingBroadcast,
  StartSessionResponse,
  StartSynthesisRequest,
  StartSynthesisResponse,
  UpsertClosingResponseRequest,
} from "@bookseasoning/contracts/public";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionClientError, type SessionApi } from "../../data/session-api";
import type { RoomApi } from "../../data/room-api";
import type {
  SessionRealtimeClient,
  SessionRealtimeListener,
  SessionRealtimeSubscription,
} from "../../data/session-realtime";
import {
  hostUserId,
  messageEventFixture,
  messageFixture,
  participantUserId,
  roomId,
  sessionId,
  sessionSnapshotFixture,
} from "../../test/session-fixture";
import { roomApiStub } from "../../test/runtime-stubs";
import { DiscussionSessionPage } from "./discussion-session-page";

class FakeSessionApi implements SessionApi {
  public snapshot: SessionSnapshot = sessionSnapshotFixture();
  public readonly syncQueries: SessionSyncQuery[] = [];
  public readonly sent: SendSessionMessageRequest[] = [];
  public readonly extended: ExtendSessionRequest[] = [];
  public readonly synthesisStarted: StartSynthesisRequest[] = [];
  public readonly ended: EndSessionRequest[] = [];
  public readonly closingUpserts: UpsertClosingResponseRequest[] = [];
  public readonly closingDeletes: DeleteClosingResponseRequest[] = [];
  public failNextSend = false;
  public resultResponse: GetDiscussionResultResponse = {
    roomId,
    sessionId,
    status: "INSUFFICIENT",
    canRetry: false,
    record: null,
    closingLines: [],
    readyAt: null,
    serverTime: "2026-09-02T10:01:00.000Z",
  };

  public async sync(_roomId: string, query: SessionSyncQuery): Promise<SessionSnapshot> {
    this.syncQueries.push(query);
    return this.snapshot;
  }

  public async getMessagePage(): Promise<SessionMessagePage> {
    return {
      sessionId,
      serverTime: this.snapshot.serverTime,
      messages: [],
      page: { oldestMessageSeq: null, newestMessageSeq: null, hasMoreBefore: false },
    };
  }

  public async sendMessage(
    _roomId: string,
    request: SendSessionMessageRequest,
  ): Promise<SendSessionMessageResponse> {
    this.sent.push(request);
    if (this.failNextSend) {
      this.failNextSend = false;
      throw new SessionClientError("NETWORK_UNAVAILABLE", 0);
    }
    const message = {
      ...messageFixture(this.snapshot.cursors.latestMessageSeq + 1, hostUserId, request.body),
      clientMessageId: request.clientMessageId,
      reply:
        request.replyToMessageId === null
          ? null
          : {
              messageId: request.replyToMessageId,
              authorProfileName: "민수",
              quote: "확정 메시지 1",
            },
    };
    return {
      roomId,
      message,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      eventCursor: this.snapshot.cursors.eventCursor + 1,
      channelEpoch: 1,
      duplicate: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async heartbeat(_roomId: string, deviceId: string): Promise<SessionHeartbeatResponse> {
    return {
      roomId,
      sessionId,
      deviceId,
      membershipStatus: "PARTICIPATED",
      aggregateVersion: this.snapshot.state.aggregateVersion,
      eventCursor: this.snapshot.cursors.eventCursor,
      channelEpoch: 1,
      connectedParticipantCount: 2,
      heartbeatIntervalSeconds: 300,
      onlineThresholdSeconds: 30,
      lastSeenAt: this.snapshot.serverTime,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async startSession(): Promise<StartSessionResponse> {
    throw new Error("not used by the discussion screen");
  }

  public async extendSession(
    _roomId: string,
    request: ExtendSessionRequest,
  ): Promise<ExtendSessionResponse> {
    this.extended.push(request);
    const currentEnd = this.snapshot.state.deadlines.discussionEndsAt;
    if (currentEnd === null) throw new Error("discussion deadline missing");
    const state = {
      ...this.snapshot.state,
      phase: "EXTENDED" as const,
      endedAt: null,
      phaseVersion: this.snapshot.state.phaseVersion + 1,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      extensionCount: this.snapshot.state.extensionCount + 1,
      deadlines: {
        ...this.snapshot.state.deadlines,
        discussionEndsAt: new Date(Date.parse(currentEnd) + 15 * 60_000).toISOString(),
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: new Date(
          Date.parse(currentEnd) + 10 * 60_000,
        ).toISOString(),
      },
    };
    this.snapshot = this.withState(state);
    return {
      roomId,
      sessionId,
      state,
      eventCursor: this.snapshot.cursors.eventCursor,
      duplicate: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async startSynthesis(
    _roomId: string,
    request: StartSynthesisRequest,
  ): Promise<StartSynthesisResponse> {
    this.synthesisStarted.push(request);
    const state = {
      ...this.snapshot.state,
      phase: "SYNTHESIS" as const,
      endedAt: null,
      phaseVersion: this.snapshot.state.phaseVersion + 1,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      deadlines: {
        ...this.snapshot.state.deadlines,
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: null,
      },
    };
    this.snapshot = this.withState(state);
    return {
      roomId,
      sessionId,
      state,
      eventCursor: this.snapshot.cursors.eventCursor,
      duplicate: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async endSession(
    _roomId: string,
    request: EndSessionRequest,
  ): Promise<EndSessionResponse> {
    this.ended.push(request);
    const state = {
      ...this.snapshot.state,
      phase: "ENDED" as const,
      phaseVersion: this.snapshot.state.phaseVersion + 1,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      endedAt: this.snapshot.serverTime,
      deadlines: {
        ...this.snapshot.state.deadlines,
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: null,
      },
    };
    this.snapshot = { ...this.withState(state), realtime: null };
    return {
      roomId,
      sessionId,
      state,
      eventCursor: this.snapshot.cursors.eventCursor,
      duplicate: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async upsertClosingResponse(
    _roomId: string,
    request: UpsertClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    this.closingUpserts.push(request);
    const previous = this.snapshot.closing;
    if (previous === null) throw new Error("closing state missing");
    const closing = {
      ...previous,
      completedParticipantCount:
        previous.actorResponse?.status === "PENDING"
          ? previous.completedParticipantCount + 1
          : previous.completedParticipantCount,
      actorResponse: {
        status: request.status,
        revision: request.expectedRevision + 1,
        body: request.body,
        updatedAt: this.snapshot.serverTime,
      },
    };
    this.snapshot = { ...this.snapshot, closing };
    return {
      roomId,
      sessionId,
      closing,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      eventCursor: this.snapshot.cursors.eventCursor + 1,
      duplicate: false,
      officiallyEnded: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async deleteClosingResponse(
    _roomId: string,
    request: DeleteClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    this.closingDeletes.push(request);
    const previous = this.snapshot.closing;
    if (previous === null) throw new Error("closing state missing");
    const closing = {
      ...previous,
      completedParticipantCount: Math.max(0, previous.completedParticipantCount - 1),
      actorResponse: {
        status: "PENDING" as const,
        revision: request.expectedRevision + 1,
        body: null,
        updatedAt: this.snapshot.serverTime,
      },
    };
    this.snapshot = { ...this.snapshot, closing };
    return {
      roomId,
      sessionId,
      closing,
      aggregateVersion: this.snapshot.state.aggregateVersion + 1,
      eventCursor: this.snapshot.cursors.eventCursor + 1,
      duplicate: false,
      officiallyEnded: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  public async getDiscussionResult(): Promise<GetDiscussionResultResponse> {
    return this.resultResponse;
  }

  public async retryDiscussionResult(): Promise<RetryDiscussionResultResponse> {
    return {
      roomId,
      sessionId,
      jobId: "90000000-0000-4000-8000-000000000099",
      status: "RETRYING",
      duplicate: false,
      serverTime: this.snapshot.serverTime,
    };
  }

  private withState(state: SessionSnapshot["state"]): SessionSnapshot {
    return {
      ...this.snapshot,
      state,
      cursors: {
        ...this.snapshot.cursors,
        eventCursor: this.snapshot.cursors.eventCursor + 1,
      },
    };
  }
}

class FakeRealtime implements SessionRealtimeClient {
  public listener: SessionRealtimeListener | null = null;
  public readonly typingSignals: SessionTypingBroadcast[] = [];

  public async subscribe(
    _channels: SessionSnapshot["realtime"] & {},
    _actorUserId: string,
    listener: SessionRealtimeListener,
  ): Promise<SessionRealtimeSubscription> {
    this.listener = listener;
    listener.onStatus("connected");
    listener.onPresence(new Set([hostUserId, participantUserId]));
    return {
      sendTyping: async (signal) => {
        this.typingSignals.push(signal);
      },
      close: async () => undefined,
    };
  }

  public event(event: SessionEvent) {
    this.listener?.onEvent(event);
  }

  public typing(signal: SessionTypingBroadcast) {
    this.listener?.onTyping(signal);
  }
}

function renderSession(
  api = new FakeSessionApi(),
  realtime = new FakeRealtime(),
  rooms: Pick<RoomApi, "getPrepEntries"> = roomApiStub({
    getPrepEntries: vi.fn().mockResolvedValue({ items: [] }),
  }),
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <DiscussionSessionPage
        roomId={roomId}
        dependencies={{
          api,
          realtime,
          rooms,
        }}
      />
    </QueryClientProvider>,
  );
  return { ...result, api, realtime };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DiscussionSessionPage", () => {
  it("keeps a failed message and retries with the same client id", async () => {
    const user = userEvent.setup();
    const { api } = renderSession();
    api.failNextSend = true;
    const composer = await screen.findByRole("textbox", { name: "토론 메시지" });
    await waitFor(() => expect(composer).toBeEnabled());

    await user.type(composer, "실패해도 보존되는 생각");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("전송하지 못했습니다");
    await user.click(screen.getByRole("button", { name: "같은 메시지 다시 보내기" }));

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("실패해도 보존되는 생각")).toBeInTheDocument();
    expect(api.sent).toHaveLength(2);
    expect(api.sent[0]?.clientMessageId).toBe(api.sent[1]?.clientMessageId);
  });

  it("recovers a realtime cursor gap from the authoritative snapshot", async () => {
    const { api, realtime } = renderSession();
    await screen.findByText("확정 메시지 1");
    await waitFor(() => expect(realtime.listener).not.toBeNull());
    const baselineSyncCount = api.syncQueries.length;
    const second = messageFixture(2, participantUserId, "복구된 누락 메시지");
    const third = messageFixture(3, participantUserId, "gap 이후 메시지");
    api.snapshot = sessionSnapshotFixture(
      [messageFixture(1), second, third],
      [messageEventFixture(second), messageEventFixture(third)],
    );

    realtime.event(messageEventFixture(third));

    expect(await screen.findByText("복구된 누락 메시지")).toBeInTheDocument();
    expect(screen.getByText("gap 이후 메시지")).toBeInTheDocument();
    expect(api.syncQueries.length).toBeGreaterThan(baselineSyncCount);
  });

  it("shows only known participant names for ephemeral typing signals", async () => {
    const { realtime } = renderSession();
    await screen.findByText("확정 메시지 1");
    await waitFor(() => expect(realtime.listener).not.toBeNull());

    realtime.typing({
      userId: participantUserId,
      typing: true,
      sentAt: "2026-09-02T10:02:00.000Z",
    });

    expect(await screen.findByText("수진님이 입력 중…")).toBeInTheDocument();
  });

  it("lets only the host choose a prompted fifteen-minute extension", async () => {
    const user = userEvent.setup();
    const api = new FakeSessionApi();
    api.snapshot = {
      ...api.snapshot,
      state: {
        ...api.snapshot.state,
        phase: "CORE",
        phaseVersion: 2,
        deadlines: {
          ...api.snapshot.state.deadlines,
          discussionEndsAt: "2026-09-02T10:08:00.000Z",
          extensionPromptedAt: "2026-09-02T10:01:00.000Z",
          extensionDecisionDeadlineAt: "2026-09-02T10:03:00.000Z",
        },
      },
    };
    renderSession(api);

    await user.click(await screen.findByRole("button", { name: "15분 연장" }));

    await waitFor(() => expect(api.extended).toHaveLength(1));
    expect(api.extended[0]).toMatchObject({ expectedPhaseVersion: 2, payload: {} });
    expect(await screen.findByText("연장 중")).toBeInTheDocument();
  });

  it("shows participants the decision state without host controls", async () => {
    const api = new FakeSessionApi();
    api.snapshot = {
      ...api.snapshot,
      actor: { ...api.snapshot.actor, userId: participantUserId, role: "PARTICIPANT" },
      state: {
        ...api.snapshot.state,
        phase: "CORE",
        deadlines: {
          ...api.snapshot.state.deadlines,
          extensionPromptedAt: "2026-09-02T10:01:00.000Z",
          extensionDecisionDeadlineAt: "2026-09-02T10:03:00.000Z",
        },
      },
    };
    renderSession(api);

    expect(
      await screen.findByText("방장이 토론 연장 여부를 결정하고 있어요"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "15분 연장" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "토론 종료" })).not.toBeInTheDocument();
  });

  it("requires confirmation before the host irreversibly ends the session", async () => {
    const user = userEvent.setup();
    const { api } = renderSession();
    await user.click(await screen.findByRole("button", { name: "토론 종료" }));

    expect(await screen.findByText("지금 토론을 종료할까요?")).toBeInTheDocument();
    expect(api.ended).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "토론 종료하기" }));

    await waitFor(() => expect(api.ended).toHaveLength(1));
    expect(await screen.findByText("공식 토론 기록을 만들기 어려웠어요"))
      .toBeInTheDocument();
  });

  it("keeps closing lines private while the actor saves and edits their own response", async () => {
    const user = userEvent.setup();
    const api = new FakeSessionApi();
    api.snapshot = {
      ...api.snapshot,
      state: {
        ...api.snapshot.state,
        phase: "CLOSING",
        phaseVersion: 4,
        deadlines: {
          ...api.snapshot.state.deadlines,
          closingStartedAt: "2026-09-02T10:01:00.000Z",
          closingEndsAt: "2026-09-02T10:06:00.000Z",
        },
      },
      closing: {
        eligibleParticipantCount: 2,
        completedParticipantCount: 0,
        actorResponse: {
          status: "PENDING",
          revision: 0,
          body: null,
          updatedAt: null,
        },
      },
    };
    renderSession(api);

    const closing = await screen.findByRole("textbox", { name: "마지막 한 줄" });
    await user.type(closing, "침묵도 하나의 선택이라는 생각이 남았다.");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(api.closingUpserts).toHaveLength(1));
    expect(api.closingUpserts[0]).toMatchObject({
      expectedPhaseVersion: 4,
      expectedRevision: 0,
      status: "SUBMITTED",
      body: "침묵도 하나의 선택이라는 생각이 남았다.",
    });
    expect(await screen.findByText("저장되었습니다")).toBeInTheDocument();
    expect(screen.getByText("다른 사람의 답변은 마감 전까지 보이지 않아요."))
      .toBeInTheDocument();
  });

  it("renders the anonymous official record and filters read-only private prep", async () => {
    const user = userEvent.setup();
    const api = new FakeSessionApi();
    api.snapshot = {
      ...api.snapshot,
      state: {
        ...api.snapshot.state,
        phase: "ENDED",
        endedAt: "2026-09-02T10:35:00.000Z",
      },
      result: { status: "READY", canRetry: false },
      realtime: null,
    };
    api.resultResponse = {
      roomId,
      sessionId,
      status: "READY",
      canRetry: false,
      record: {
        schemaVersion: "discussion-record.v1",
        keyIssues: [
          {
            title: "침묵의 의미",
            perspectives: [
              { summary: "침묵은 자기 보호로 읽혔다." },
              { summary: "동시에 타인에게 영향을 주는 선택으로 보였다." },
            ],
            connections: ["인물의 선택과 독자의 책임이 이어졌다."],
          },
          {
            title: "기억하는 방식",
            perspectives: [{ summary: "기억은 각자의 위치에 따라 달라졌다." }],
            connections: [],
          },
        ],
        changesAndExpansions: ["말하지 않는 행동도 관계를 바꾼다는 생각이 더해졌다."],
        remainingQuestions: ["우리는 타인의 침묵을 어디까지 해석할 수 있을까?"],
      },
      closingLines: [
        {
          responseId: "90000000-0000-4000-8000-000000000040",
          profileName: "민수",
          body: "한 사람의 침묵을 쉽게 단정하지 않겠다.",
        },
      ],
      readyAt: "2026-09-02T10:36:00.000Z",
      serverTime: "2026-09-02T10:36:00.000Z",
    };
    const rooms = roomApiStub({
      getPrepEntries: vi.fn().mockResolvedValue({
        items: [
          {
            entryId: "90000000-0000-4000-8000-000000000050",
            promptType: "DISCUSSION_QUESTION",
            visibility: "PUBLIC",
            body: "침묵은 언제 선택이 되는가?",
            authorUserId: participantUserId,
            authorProfileName: "수진",
            mine: false,
            revision: 1,
            updatedAt: "2026-09-02T09:00:00.000Z",
          },
          {
            entryId: "90000000-0000-4000-8000-000000000051",
            promptType: "QUOTE_THOUGHT",
            visibility: "AI_PRIVATE",
            body: "내가 AI에게만 남긴 생각",
            authorUserId: hostUserId,
            authorProfileName: "민수",
            mine: true,
            revision: 1,
            updatedAt: "2026-09-02T09:01:00.000Z",
          },
          {
            entryId: "90000000-0000-4000-8000-000000000052",
            promptType: "IMPRESSIVE_PART",
            visibility: "AI_PRIVATE",
            body: "다른 사람의 비공개 원문",
            authorUserId: participantUserId,
            authorProfileName: "수진",
            mine: false,
            revision: 1,
            updatedAt: "2026-09-02T09:02:00.000Z",
          },
        ],
      }),
    });
    renderSession(api, new FakeRealtime(), rooms);

    expect(await screen.findByText("침묵의 의미")).toBeInTheDocument();
    expect(screen.getByText(/한 사람의 침묵을 쉽게 단정하지 않겠다/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "사전 입력" }));
    expect(await screen.findByText("침묵은 언제 선택이 되는가?")).toBeInTheDocument();
    expect(screen.getByText("내가 AI에게만 남긴 생각")).toBeInTheDocument();
    expect(screen.queryByText("다른 사람의 비공개 원문")).not.toBeInTheDocument();
  });
});
