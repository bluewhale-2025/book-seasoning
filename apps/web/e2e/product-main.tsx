import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AuthApi } from "../src/data/auth-api";
import { AuthenticatedHttpClient } from "../src/data/http-client";
import type { SessionApi } from "../src/data/session-api";
import type { AppRuntime } from "../src/app/app-runtime";
import type { RoomDetail, SessionSnapshot } from "@bookseasoning/contracts/public";
import { AppRuntimeProvider } from "../src/app/app-runtime";
import { AuthProvider } from "../src/app/auth-provider";
import { AppShell } from "../src/app/app-shell";
import { CreateRoomPage } from "../src/features/rooms/create-room-page";
import { MyDiscussionsPage } from "../src/features/rooms/my-discussions-page";
import { RoomDetailPage } from "../src/features/rooms/room-detail-page";
import { RoomSearchPage } from "../src/features/rooms/room-search-page";
import { ProfilePage } from "../src/features/profile/profile-page";
import { BookContextPackListPage } from "../src/features/admin/book-context-pack-list-page";
import { BookContextPackPage } from "../src/features/admin/book-context-pack-page";
import { createBookContextPackSnapshot } from "../src/test/book-builder-fixture";
import { DiscussionSessionPage } from "../src/features/discussion/discussion-session-page";
import type { SessionRealtimeClient } from "../src/data/session-realtime";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "../src/styles/globals.css";

const roomId = "90000000-0000-4000-8000-000000000001";
const sessionId = "90000000-0000-4000-8000-000000000002";
const hostUserId = "90000000-0000-4000-8000-000000000003";
const route = new URLSearchParams(location.search).get("route");
const adminSnapshot = createBookContextPackSnapshot();
const packVersionId = "91000000-0000-4000-8000-000000000001";
const book = {
  packVersionId,
  bookId: "92000000-0000-4000-8000-000000000001",
  title: "소년이 온다",
  author: "한강",
  publisher: "창비",
  publicationYear: 2014,
  coverUrl: null,
  shortDescription: "한 사람의 기억에서 공동체의 기억으로 이어지는 이야기",
  packVersion: 1,
  publishedAt: "2026-09-01T10:00:00.000Z",
};
const scheduledAt = "2030-09-05T20:00:00.000Z";

const detail: RoomDetail = {
  roomId,
  aggregateVersion: 1,
  title: "침묵과 책임에 관하여",
  scheduledStartAt: scheduledAt,
  displayStatus: "SCHEDULED",
  availability: "OPEN",
  participantCount: 3,
  minParticipants: 2,
  maxParticipants: 8,
  actorRole: "HOST",
  membershipStatus: "REGISTERED",
  packVersionId,
  bookTitle: book.title,
  bookAuthor: book.author,
  bookCoverUrl: null,
  members: [
    { userId: hostUserId, profileName: "지윤", membershipStatus: "REGISTERED", isHost: true },
    { userId: "90000000-0000-4000-8000-000000000004", profileName: "수진", membershipStatus: "REGISTERED", isHost: false },
    { userId: "90000000-0000-4000-8000-000000000005", profileName: "민수", membershipStatus: "REGISTERED", isHost: false },
  ],
};

const waitingSnapshot: SessionSnapshot = {
  sessionId,
  serverTime: "2026-09-02T10:00:00.000Z",
  room: {
    roomId,
    title: detail.title,
    scheduledStartAt: scheduledAt,
    packVersionId,
    bookTitle: book.title,
    bookAuthor: book.author,
    bookCoverUrl: null,
  },
  actor: {
    userId: hostUserId,
    role: "HOST",
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
  participants: detail.members.map((member, index) => ({
    userId: member.userId,
    profileName: member.profileName,
    role: member.isHost ? "HOST" : "PARTICIPANT",
    membershipStatus: "REGISTERED",
    connectionStatus: index < 2 ? "ONLINE" : "OFFLINE",
    actualParticipation: false,
  })),
  connectedParticipantCount: 2,
  messages: [],
  events: [],
  cursors: {
    eventCursor: 0,
    latestMessageSeq: 0,
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
    eventTopic: `session:${sessionId}:v1`,
    ephemeralTopic: `session:${sessionId}:v1:ephemeral`,
  },
};

const endedSnapshot: SessionSnapshot = {
  ...waitingSnapshot,
  serverTime: "2026-09-02T10:40:00.000Z",
  actor: {
    ...waitingSnapshot.actor,
    membershipStatus: "PARTICIPATED",
    actualParticipation: true,
  },
  state: {
    ...waitingSnapshot.state,
    phase: "ENDED",
    phaseVersion: 5,
    aggregateVersion: 8,
    startedAt: "2026-09-02T10:00:00.000Z",
    endedAt: "2026-09-02T10:35:00.000Z",
    deadlines: {
      discussionEndsAt: "2026-09-02T10:30:00.000Z",
      extensionPromptedAt: null,
      extensionDecisionDeadlineAt: null,
      closingStartedAt: "2026-09-02T10:30:00.000Z",
      closingEndsAt: "2026-09-02T10:35:00.000Z",
    },
  },
  participants: waitingSnapshot.participants.map((participant) => ({
    ...participant,
    membershipStatus: "PARTICIPATED" as const,
    connectionStatus: "OFFLINE" as const,
    actualParticipation: true,
  })),
  connectedParticipantCount: 0,
  messages: [
    {
      messageId: "94000000-0000-4000-8000-000000000001",
      sessionId,
      seqNo: 1,
      kind: "PARTICIPANT",
      author: { userId: hostUserId, profileName: "지윤" },
      clientMessageId: "95000000-0000-4000-8000-000000000001",
      body: "침묵을 개인의 선택만으로 볼 수 있을까요?",
      reply: null,
      confirmedAt: "2026-09-02T10:03:00.000Z",
    },
  ],
  cursors: {
    eventCursor: 8,
    latestMessageSeq: 1,
    oldestMessageSeq: 1,
    hasMoreMessagesBefore: false,
    hasMoreMessagesAfter: false,
    hasMoreEventsAfter: false,
  },
  closing: {
    eligibleParticipantCount: 3,
    completedParticipantCount: 3,
    actorResponse: {
      status: "SUBMITTED",
      revision: 1,
      body: "타인의 침묵을 쉽게 단정하지 않겠다.",
      updatedAt: "2026-09-02T10:33:00.000Z",
    },
  },
  result: { status: "READY", canRetry: false },
  realtime: null,
};

const closingSnapshot: SessionSnapshot = {
  ...endedSnapshot,
  serverTime: "2026-09-02T10:31:00.000Z",
  state: {
    ...endedSnapshot.state,
    phase: "CLOSING",
    phaseVersion: 4,
    aggregateVersion: 7,
    endedAt: null,
  },
  connectedParticipantCount: 3,
  closing: {
    eligibleParticipantCount: 3,
    completedParticipantCount: 1,
    actorResponse: {
      status: "PENDING",
      revision: 0,
      body: null,
      updatedAt: null,
    },
  },
  result: { status: "NOT_STARTED", canRetry: false },
  realtime: waitingSnapshot.realtime,
};

const sessions: SessionApi = {
  sync: async () => route === "result"
    ? endedSnapshot
    : route === "closing"
      ? closingSnapshot
      : waitingSnapshot,
  heartbeat: async (_roomId, deviceId) => ({
    roomId,
    sessionId,
    deviceId,
    membershipStatus: "REGISTERED",
    aggregateVersion: 1,
    eventCursor: 0,
    channelEpoch: 1,
    connectedParticipantCount: 2,
    heartbeatIntervalSeconds: 300,
    onlineThresholdSeconds: 30,
    lastSeenAt: new Date().toISOString(),
    serverTime: new Date().toISOString(),
  }),
  getMessagePage: async () => { throw new Error("not used"); },
  sendMessage: async () => { throw new Error("not used"); },
  startSession: async () => { throw new Error("not used"); },
  extendSession: async () => { throw new Error("not used"); },
  startSynthesis: async () => { throw new Error("not used"); },
  endSession: async () => { throw new Error("not used"); },
  upsertClosingResponse: async () => { throw new Error("not used"); },
  deleteClosingResponse: async () => { throw new Error("not used"); },
  getDiscussionResult: async () => ({
    roomId,
    sessionId,
    status: "READY",
    canRetry: false,
    record: {
      schemaVersion: "discussion-record.v1",
      keyIssues: [
        {
          title: "침묵은 선택인가",
          perspectives: [
            { summary: "침묵은 상처로부터 자신을 지키는 선택으로 읽혔다." },
            { summary: "말하지 않는 행동 역시 관계에 영향을 준다는 관점이 이어졌다." },
          ],
          connections: ["개인의 생존과 공동체의 책임이 한 장면에서 만났다."],
        },
        {
          title: "기억을 나누는 책임",
          perspectives: [
            { summary: "기억은 혼자 보존하는 것이 아니라 서로 확인하는 과정이라는 의견이 나왔다." },
          ],
          connections: [],
        },
      ],
      changesAndExpansions: ["침묵을 단순한 회피로 판단하던 시선이 조금 넓어졌다."],
      remainingQuestions: ["우리는 다른 사람의 침묵을 어디까지 해석해도 될까?"],
    },
    closingLines: [
      {
        responseId: "97000000-0000-4000-8000-000000000001",
        profileName: "지윤",
        body: "타인의 침묵을 쉽게 단정하지 않겠다.",
      },
      {
        responseId: "97000000-0000-4000-8000-000000000002",
        profileName: "수진",
        body: "기억은 함께 말할 때 더 선명해진다.",
      },
    ],
    readyAt: "2026-09-02T10:37:00.000Z",
    serverTime: "2026-09-02T10:40:00.000Z",
  }),
  retryDiscussionResult: async () => { throw new Error("not used"); },
};

const realtime: SessionRealtimeClient = {
  subscribe: async (_channels, _actorUserId, listener) => {
    listener.onStatus("connected");
    listener.onPresence(new Set(endedSnapshot.participants.map((participant) => participant.userId)));
    return {
      sendTyping: async () => undefined,
      close: async () => undefined,
    };
  },
};

const auth: AuthApi = {
  getCurrentUser: async () => ({ userId: hostUserId, email: "reader@example.com" }),
  subscribe: () => () => undefined,
  signUp: async () => ({ userId: hostUserId, email: "reader@example.com" }),
  signIn: async () => ({ userId: hostUserId, email: "reader@example.com" }),
  requestPasswordReset: async () => undefined,
  exchangePasswordResetCode: async () => undefined,
  updatePassword: async () => undefined,
  signOut: async () => undefined,
  getAccessToken: async () => "fake-token",
  refreshAccessToken: async () => "fake-token",
};

const runtime: AppRuntime = {
  account: {
    getDeletionPreview: async () => route === "profile-blocked" ? ({
      allowed: false,
      blockers: ["ACTIVE_PARTICIPATION", "HOSTED_ROOM_REQUIRES_TRANSFER_OR_CANCEL"],
      affected: { messages: 18, publicPrep: 2, privatePrep: 1, closingResponses: 1 },
    }) : ({
      allowed: true,
      blockers: [],
      affected: { messages: 18, publicPrep: 2, privatePrep: 1, closingResponses: 1 },
    }),
    deleteAccount: async () => ({
      deletionId: "b3000000-0000-4000-8000-000000000001",
      status: "COMPLETED",
      duplicate: false,
      serverTime: new Date().toISOString(),
    }),
  },
  auth,
  bookBuilder: {
    listPacks: async () => [adminSnapshot.pack],
    createPack: async () => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "DRAFT", revision: 0, run: adminSnapshot.pack.builderRun!, duplicate: false, serverTime: adminSnapshot.pack.updatedAt }),
    getPack: async () => adminSnapshot,
    updateDraft: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "DRAFT", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    requestReview: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "REVIEW", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    returnToDraft: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "DRAFT", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    publish: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "PUBLISHED", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    retire: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "RETIRED", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    retryRun: async () => ({ ...adminSnapshot.pack.builderRun!, jobId: "b1000000-0000-4000-8000-000000000099", duplicate: false, serverTime: new Date().toISOString() }),
    regenerate: async () => ({ run: { ...adminSnapshot.pack.builderRun!, scope: "FULL" }, jobId: "b1000000-0000-4000-8000-000000000099", duplicate: false, serverTime: new Date().toISOString() }),
    applyProposal: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "DRAFT", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
    discardProposal: async (_id, request) => ({ packVersionId: adminSnapshot.pack.packVersionId, status: "DRAFT", revision: request.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
  },
  books: { getCatalog: async () => ({ items: [book] }) },
  http: new AuthenticatedHttpClient({
    apiBaseUrl: "http://127.0.0.1:4174",
    getAccessToken: async () => "fake-token",
  }),
  profile: {
    getProfile: async () => ({
      userId: hostUserId,
      profileName: "지윤",
      role: route?.startsWith("admin") ? "ADMIN" : "USER",
      updatedAt: "2026-09-02T10:00:00.000Z",
    }),
    updateProfile: async (request) => ({
      userId: hostUserId,
      profileName: request.profileName,
      role: route?.startsWith("admin") ? "ADMIN" : "USER",
      updatedAt: new Date().toISOString(),
    }),
  },
  rooms: {
    searchRooms: async () => ({
      items: [
        {
          roomId,
          title: detail.title,
          scheduledStartAt: scheduledAt,
          displayStatus: "SCHEDULED",
          availability: "OPEN",
          participantCount: 3,
          maxParticipants: 8,
          hostProfileName: "지윤",
          packVersionId,
          bookTitle: book.title,
          bookAuthor: book.author,
          bookCoverUrl: null,
        },
        {
          roomId: "90000000-0000-4000-8000-000000000006",
          title: "몸과 선택의 경계",
          scheduledStartAt: "2030-09-02T18:00:00.000Z",
          displayStatus: "DISCUSSING",
          availability: "OPEN",
          participantCount: 4,
          maxParticipants: 6,
          hostProfileName: "수진",
          packVersionId,
          bookTitle: "채식주의자",
          bookAuthor: "한강",
          bookCoverUrl: null,
        },
      ],
    }),
    getMyRooms: async () => ({
      items: [
        {
          roomId,
          title: detail.title,
          scheduledStartAt: scheduledAt,
          displayStatus: "SCHEDULED",
          actorRole: "HOST",
          membershipStatus: "REGISTERED",
          packVersionId,
          bookTitle: book.title,
          bookAuthor: book.author,
          bookCoverUrl: null,
        },
      ],
    }),
    getRoom: async () => detail,
    createRoom: async () => ({
      roomId,
      aggregateVersion: 1,
      duplicate: false,
      serverTime: new Date().toISOString(),
    }),
    joinRoom: async () => ({
      roomId,
      aggregateVersion: 2,
      duplicate: false,
      serverTime: new Date().toISOString(),
      membershipStatus: "REGISTERED",
      participantCount: 4,
    }),
    updateRoom: async () => ({ roomId, aggregateVersion: 2, duplicate: false, serverTime: new Date().toISOString() }),
    cancelMembership: async () => ({ roomId, aggregateVersion: 2, duplicate: false, serverTime: new Date().toISOString() }),
    cancelRoom: async () => ({ roomId, aggregateVersion: 2, duplicate: false, serverTime: new Date().toISOString() }),
    transferHost: async () => ({ roomId, aggregateVersion: 2, duplicate: false, serverTime: new Date().toISOString() }),
    removeMember: async () => ({ roomId, aggregateVersion: 2, duplicate: false, serverTime: new Date().toISOString() }),
    getPrepEntries: async () => ({
      items: [
        {
          entryId: "93000000-0000-4000-8000-000000000001",
          promptType: "DISCUSSION_QUESTION",
          visibility: "PUBLIC",
          body: "기억하지 않는 것도 하나의 선택일까요?",
          authorUserId: "90000000-0000-4000-8000-000000000004",
          authorProfileName: "수진",
          mine: false,
          revision: 1,
          updatedAt: "2026-09-02T10:00:00.000Z",
        },
        {
          entryId: "93000000-0000-4000-8000-000000000002",
          promptType: "QUOTE_THOUGHT",
          visibility: "AI_PRIVATE",
          body: "나는 침묵을 회피라고만 생각하고 있었다.",
          authorUserId: hostUserId,
          authorProfileName: "지윤",
          mine: true,
          revision: 1,
          updatedAt: "2026-09-02T10:01:00.000Z",
        },
      ],
    }),
    upsertPrepEntry: async (_roomId, request) => ({ entryId: request.payload.entryId, revision: 1, duplicate: false, serverTime: new Date().toISOString() }),
    deletePrepEntry: async (_roomId, request) => ({ entryId: request.payload.entryId, revision: request.payload.expectedRevision + 1, duplicate: false, serverTime: new Date().toISOString() }),
  },
  sessions,
};

const initialEntry = route === "find"
  ? "/discussions/find"
  : route === "create"
    ? "/rooms/new"
    : route === "waiting"
      ? `/rooms/${roomId}`
      : route === "result" || route === "closing"
        ? `/rooms/${roomId}/session`
        : route === "admin-list"
          ? "/admin/book-context"
          : route === "admin-pack"
            ? `/admin/book-context/${adminSnapshot.pack.packVersionId}`
            : route === "profile" || route === "profile-blocked"
              ? "/profile"
        : "/discussions";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AppRuntimeProvider runtime={runtime}>
          <AuthProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/discussions" element={<MyDiscussionsPage />} />
                <Route path="/discussions/find" element={<RoomSearchPage />} />
                <Route path="/rooms/new" element={<CreateRoomPage />} />
                <Route path="/rooms/:roomId" element={<RoomDetailPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/admin/book-context" element={<BookContextPackListPage />} />
                <Route path="/admin/book-context/:packVersionId" element={<BookContextPackPage />} />
              </Route>
              <Route
                path="/rooms/:roomId/session"
                element={
                  <DiscussionSessionPage
                    roomId={roomId}
                    dependencies={{ api: sessions, rooms: runtime.rooms, realtime }}
                  />
                }
              />
            </Routes>
          </AuthProvider>
        </AppRuntimeProvider>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
