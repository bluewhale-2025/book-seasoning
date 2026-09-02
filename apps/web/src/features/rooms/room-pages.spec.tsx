import * as React from "react";
import type { RoomDetail, SessionSnapshot } from "@bookseasoning/contracts/public";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRuntimeProvider, type AppRuntime } from "../../app/app-runtime";
import type { AuthApi } from "../../data/auth-api";
import { AuthenticatedHttpClient, HttpClientError } from "../../data/http-client";
import type { ProfileApi } from "../../data/profile-api";
import type { RoomApi } from "../../data/room-api";
import type { SessionApi } from "../../data/session-api";
import { accountApiStub, bookBuilderAdminApiStub, roomApiStub, sessionApiStub } from "../../test/runtime-stubs";
import { CreateRoomPage } from "./create-room-page";
import { RoomDetailPage } from "./room-detail-page";

const roomId = "90000000-0000-4000-8000-000000000001";
const commandId = "93000000-0000-4000-8000-000000000001";
const hostUserId = "90000000-0000-4000-8000-000000000003";
const participantUserId = "90000000-0000-4000-8000-000000000004";
const book = {
  packVersionId: "91000000-0000-4000-8000-000000000001",
  bookId: "92000000-0000-4000-8000-000000000001",
  title: "채식주의자",
  author: "한강",
  publisher: "창비",
  publicationYear: 2007,
  coverUrl: null,
  shortDescription: "한 사람의 선택을 둘러싼 이야기",
  packVersion: 1,
  publishedAt: "2026-09-02T10:00:00.000Z",
};

function waitingDetail(actorRole: "HOST" | "PARTICIPANT" = "HOST"): RoomDetail {
  return {
    roomId,
    aggregateVersion: 1,
    title: "몸과 선택의 경계",
    scheduledStartAt: "2026-01-05T20:00:00.000Z",
    displayStatus: "WAITING",
    availability: "OPEN",
    participantCount: 2,
    minParticipants: 2,
    maxParticipants: 6,
    actorRole,
    membershipStatus: "REGISTERED",
    packVersionId: book.packVersionId,
    bookTitle: book.title,
    bookAuthor: book.author,
    bookCoverUrl: null,
    members: [
      { userId: hostUserId, profileName: "민수", membershipStatus: "REGISTERED", isHost: true },
      { userId: participantUserId, profileName: "수진", membershipStatus: "REGISTERED", isHost: false },
    ],
  };
}

function waitingSnapshot(actorRole: "HOST" | "PARTICIPANT" = "HOST"): SessionSnapshot {
  const detail = waitingDetail(actorRole);
  const sessionId = "90000000-0000-4000-8000-000000000002";
  return {
    sessionId,
    serverTime: "2026-09-02T10:00:00.000Z",
    room: {
      roomId,
      title: detail.title,
      scheduledStartAt: detail.scheduledStartAt,
      packVersionId: detail.packVersionId,
      bookTitle: detail.bookTitle,
      bookAuthor: detail.bookAuthor,
      bookCoverUrl: null,
    },
    actor: {
      userId: actorRole === "HOST" ? hostUserId : participantUserId,
      role: actorRole,
      membershipStatus: "REGISTERED",
      actualParticipation: false,
    },
    state: {
      phase: "SCHEDULED",
      phaseVersion: 0,
      aggregateVersion: 1,
      channelEpoch: 1,
      startedAt: null,
      endedAt: null,
      extensionCount: 0,
      deadlines: {
        discussionEndsAt: null,
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: null,
        closingStartedAt: null,
        closingEndsAt: null,
      },
    },
    participants: [
      { userId: hostUserId, profileName: "민수", role: "HOST", membershipStatus: "REGISTERED", connectionStatus: "ONLINE", actualParticipation: false },
      { userId: participantUserId, profileName: "수진", role: "PARTICIPANT", membershipStatus: "REGISTERED", connectionStatus: "OFFLINE", actualParticipation: false },
    ],
    connectedParticipantCount: 1,
    messages: [],
    events: [],
    cursors: { eventCursor: 0, latestMessageSeq: 0, oldestMessageSeq: null, hasMoreMessagesBefore: false, hasMoreMessagesAfter: false, hasMoreEventsAfter: false },
    publicDiscussion: { currentTopic: null },
    ai: { extensionOpinion: null, latestHostHelpRequest: null },
    closing: null,
    result: { status: "NOT_STARTED", canRetry: false },
    realtime: { eventTopic: `session:${sessionId}:v1`, ephemeralTopic: `session:${sessionId}:v1:ephemeral` },
  };
}

function unusedAuth(): AuthApi {
  return {
    getCurrentUser: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    signUp: vi.fn(),
    signIn: vi.fn(),
    requestPasswordReset: vi.fn(),
    exchangePasswordResetCode: vi.fn(),
    updatePassword: vi.fn(),
    signOut: vi.fn(),
    getAccessToken: vi.fn(),
    refreshAccessToken: vi.fn(),
  };
}

function renderPage(
  element: React.ReactElement,
  options: Readonly<{
    books?: AppRuntime["books"];
    rooms: RoomApi;
    sessions?: SessionApi;
    initialEntry: string;
    extraRoute?: React.ReactNode;
  }>,
) {
  const runtime: AppRuntime = {
    account: accountApiStub(),
    auth: unusedAuth(),
    bookBuilder: bookBuilderAdminApiStub(),
    books: options.books ?? { getCatalog: vi.fn().mockResolvedValue({ items: [] }) },
    http: new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
    }),
    profile: { getProfile: vi.fn(), updateProfile: vi.fn() } satisfies ProfileApi,
    rooms: options.rooms,
    sessions: options.sessions ?? sessionApiStub(),
  };
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[options.initialEntry]}>
        <AppRuntimeProvider runtime={runtime}>
          <Routes>
            <Route path={options.initialEntry.startsWith("/rooms/new") ? "/rooms/new" : "/rooms/:roomId"} element={element} />
            {options.extraRoute}
          </Routes>
        </AppRuntimeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("room product routes", () => {
  it("keeps the selected exact pack through the three-step create flow", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(commandId);
    const createRoom = vi.fn().mockResolvedValue({
      roomId,
      aggregateVersion: 1,
      duplicate: false,
      serverTime: "2026-09-02T10:00:00.000Z",
    });
    renderPage(<CreateRoomPage />, {
      initialEntry: "/rooms/new",
      books: { getCatalog: vi.fn().mockResolvedValue({ items: [book] }) },
      rooms: roomApiStub({ createRoom }),
      extraRoute: <Route path={`/rooms/${roomId}`} element={<p>생성된 토론</p>} />,
    });
    const interaction = userEvent.setup();

    await interaction.click(await screen.findByRole("button", { name: /채식주의자/ }));
    await interaction.click(screen.getByRole("button", { name: "다음" }));
    await interaction.type(screen.getByLabelText("방 제목"), "몸과 선택의 경계");
    fireEvent.change(screen.getByLabelText("시작 예정 시각"), {
      target: { value: "2030-09-05T20:00" },
    });
    await interaction.type(screen.getByLabelText("참가 패스워드"), "join-us");
    await interaction.click(screen.getByRole("button", { name: "다음" }));
    await interaction.click(screen.getByRole("button", { name: "토론 만들기" }));

    expect(await screen.findByText("생성된 토론")).toBeInTheDocument();
    expect(createRoom).toHaveBeenCalledWith({
      commandId,
      payload: expect.objectContaining({
        title: "몸과 선택의 경계",
        packVersionId: book.packVersionId,
        password: "join-us",
        minParticipants: 2,
        maxParticipants: 6,
      }),
    });
  });

  it("clears an invalid room password and keeps the error beside the field", async () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(commandId);
    const joinRoom = vi.fn().mockRejectedValue(
      new HttpClientError("ROOM_PASSWORD_INVALID", 403, "provider text"),
    );
    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({
        getRoom: vi.fn().mockResolvedValue({
          roomId,
          aggregateVersion: 1,
          title: "몸과 선택의 경계",
          scheduledStartAt: "2030-09-05T20:00:00.000Z",
          displayStatus: "SCHEDULED",
          availability: "OPEN",
          participantCount: 1,
          minParticipants: 2,
          maxParticipants: 6,
          actorRole: "NONE",
          membershipStatus: null,
          packVersionId: book.packVersionId,
          bookTitle: book.title,
          bookAuthor: book.author,
          bookCoverUrl: null,
          members: [],
        }),
        joinRoom,
      }),
    });
    const interaction = userEvent.setup();
    await interaction.click(await screen.findByRole("button", { name: "참가하기" }));
    const password = screen.getByLabelText("참가 패스워드");
    await interaction.type(password, "wrong");
    await interaction.click(screen.getByRole("button", { name: "참가하기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("패스워드가 올바르지 않습니다");
    await waitFor(() => expect(password).toHaveValue(""));
    await waitFor(() => expect(password).toHaveFocus());
  });

  it("uses the scheduled session snapshot for waiting-room presence and start readiness", async () => {
    const detail = waitingDetail("HOST");
    const snapshot = waitingSnapshot("HOST");
    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({
        getRoom: vi.fn().mockResolvedValue(detail),
        getPrepEntries: vi.fn().mockResolvedValue({ items: [] }),
      }),
      sessions: sessionApiStub({
        sync: vi.fn().mockResolvedValue(snapshot),
        heartbeat: vi.fn().mockResolvedValue({
          roomId,
          sessionId: snapshot.sessionId,
          deviceId: commandId,
          membershipStatus: "REGISTERED",
          aggregateVersion: 1,
          eventCursor: 0,
          channelEpoch: 1,
          connectedParticipantCount: 1,
          heartbeatIntervalSeconds: 300,
          onlineThresholdSeconds: 30,
          lastSeenAt: snapshot.serverTime,
          serverTime: snapshot.serverTime,
        }),
      }),
    });

    expect(await screen.findByRole("heading", { name: "참가자" })).toBeInTheDocument();
    expect(await screen.findByText("접속 중")).toBeInTheDocument();
    expect(await screen.findByText("오프라인")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 설정" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "토론 시작" })).toBeDisabled();
    expect(screen.getByText("1명이 더 접속하면 시작할 수 있어요.")).toBeInTheDocument();
  });

  it("refreshes room membership after a waiting-room heartbeat", async () => {
    const detail = waitingDetail("HOST");
    const staleDetail: RoomDetail = {
      ...detail,
      participantCount: 1,
      members: detail.members.slice(0, 1),
    };
    const snapshot = {
      ...waitingSnapshot("HOST"),
      connectedParticipantCount: 2,
      participants: waitingSnapshot("HOST").participants.map((participant) => ({
        ...participant,
        connectionStatus: "ONLINE" as const,
      })),
    };
    const getRoom = vi.fn()
      .mockResolvedValueOnce(staleDetail)
      .mockResolvedValue(detail);

    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({
        getRoom,
        getPrepEntries: vi.fn().mockResolvedValue({ items: [] }),
      }),
      sessions: sessionApiStub({
        sync: vi.fn().mockResolvedValue(snapshot),
        heartbeat: vi.fn().mockResolvedValue({
          roomId,
          sessionId: snapshot.sessionId,
          deviceId: commandId,
          membershipStatus: "REGISTERED",
          aggregateVersion: 2,
          eventCursor: 0,
          channelEpoch: 1,
          connectedParticipantCount: 2,
          heartbeatIntervalSeconds: 300,
          onlineThresholdSeconds: 30,
          lastSeenAt: snapshot.serverTime,
          serverTime: snapshot.serverTime,
        }),
      }),
    });

    expect(await screen.findByText("수진")).toBeInTheDocument();
    expect(screen.getByText("현재 2명 · 최대 6명")).toBeInTheDocument();
    expect(getRoom).toHaveBeenCalledTimes(2);
  });

  it("keeps host controls hidden from a waiting participant", async () => {
    const detail = waitingDetail("PARTICIPANT");
    const snapshot = waitingSnapshot("PARTICIPANT");
    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({
        getRoom: vi.fn().mockResolvedValue(detail),
        getPrepEntries: vi.fn().mockResolvedValue({ items: [] }),
      }),
      sessions: sessionApiStub({
        sync: vi.fn().mockResolvedValue(snapshot),
        heartbeat: vi.fn().mockResolvedValue({
          roomId,
          sessionId: snapshot.sessionId,
          deviceId: commandId,
          membershipStatus: "REGISTERED",
          aggregateVersion: 1,
          eventCursor: 0,
          channelEpoch: 1,
          connectedParticipantCount: 1,
          heartbeatIntervalSeconds: 300,
          onlineThresholdSeconds: 30,
          lastSeenAt: snapshot.serverTime,
          serverTime: snapshot.serverTime,
        }),
      }),
    });

    await screen.findByRole("heading", { name: "참가자" });
    expect(screen.queryByRole("button", { name: "방 설정" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "토론 시작" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "참가 취소" })).toBeInTheDocument();
  });

  it("sends an AI-only prep entry through the private-capable prep endpoint", async () => {
    const detail = waitingDetail("PARTICIPANT");
    const snapshot = waitingSnapshot("PARTICIPANT");
    const upsertPrepEntry = vi.fn().mockResolvedValue({
      entryId: commandId,
      revision: 1,
      duplicate: false,
      serverTime: snapshot.serverTime,
    });
    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({
        getRoom: vi.fn().mockResolvedValue(detail),
        getPrepEntries: vi.fn().mockResolvedValue({ items: [] }),
        upsertPrepEntry,
      }),
      sessions: sessionApiStub({
        sync: vi.fn().mockResolvedValue(snapshot),
        heartbeat: vi.fn().mockResolvedValue({
          roomId,
          sessionId: snapshot.sessionId,
          deviceId: commandId,
          membershipStatus: "REGISTERED",
          aggregateVersion: 1,
          eventCursor: 0,
          channelEpoch: 1,
          connectedParticipantCount: 1,
          heartbeatIntervalSeconds: 300,
          onlineThresholdSeconds: 30,
          lastSeenAt: snapshot.serverTime,
          serverTime: snapshot.serverTime,
        }),
      }),
    });
    const interaction = userEvent.setup();
    await interaction.click(await screen.findByRole("button", { name: "사전 생각 남기기" }));
    await interaction.type(screen.getByLabelText("내 생각"), "나만의 조용한 관점");
    await interaction.click(screen.getByRole("radio", { name: "AI에게만" }));
    await interaction.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(upsertPrepEntry).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ payload: expect.objectContaining({ visibility: "AI_PRIVATE", body: "나만의 조용한 관점" }) }),
    ));
  });

  it("limits an active room's settings to password and capacity growth", async () => {
    const base = waitingDetail("HOST");
    const detail: RoomDetail = {
      ...base,
      displayStatus: "DISCUSSING",
      membershipStatus: "PARTICIPATED",
      members: base.members.map((member) => ({ ...member, membershipStatus: "PARTICIPATED" as const })),
    };
    renderPage(<RoomDetailPage />, {
      initialEntry: `/rooms/${roomId}`,
      rooms: roomApiStub({ getRoom: vi.fn().mockResolvedValue(detail) }),
    });
    const interaction = userEvent.setup();

    await interaction.click(await screen.findByRole("button", { name: "방 설정" }));
    expect(screen.getByLabelText("새 참가 패스워드")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "최대 참가 인원" })).toBeInTheDocument();
    expect(screen.queryByLabelText("방 제목")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("시작 예정 시각")).not.toBeInTheDocument();
    await interaction.click(screen.getByRole("button", { name: "취소" }));
    expect(await screen.findByRole("button", { name: "수진 관리" })).toBeInTheDocument();
  });
});
