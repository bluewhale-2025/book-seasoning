import { vi } from "vitest";

import type { AccountApi } from "../data/account-api";
import type { BookBuilderAdminApi } from "../data/book-builder-admin-api";
import type { RoomApi } from "../data/room-api";
import type { SessionApi } from "../data/session-api";

export function accountApiStub(overrides: Partial<AccountApi> = {}): AccountApi {
  return {
    getDeletionPreview: vi.fn(),
    deleteAccount: vi.fn(),
    ...overrides,
  };
}

export function bookBuilderAdminApiStub(overrides: Partial<BookBuilderAdminApi> = {}): BookBuilderAdminApi {
  return {
    searchBooks: vi.fn(),
    listPacks: vi.fn(),
    createPack: vi.fn(),
    getPack: vi.fn(),
    updateDraft: vi.fn(),
    requestReview: vi.fn(),
    returnToDraft: vi.fn(),
    publish: vi.fn(),
    retire: vi.fn(),
    retryRun: vi.fn(),
    regenerate: vi.fn(),
    applyProposal: vi.fn(),
    discardProposal: vi.fn(),
    ...overrides,
  };
}

export function roomApiStub(overrides: Partial<RoomApi> = {}): RoomApi {
  return {
    searchRooms: vi.fn(),
    getMyRooms: vi.fn(),
    getRoom: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    updateRoom: vi.fn(),
    cancelMembership: vi.fn(),
    cancelRoom: vi.fn(),
    transferHost: vi.fn(),
    removeMember: vi.fn(),
    getPrepEntries: vi.fn(),
    upsertPrepEntry: vi.fn(),
    deletePrepEntry: vi.fn(),
    ...overrides,
  };
}

export function sessionApiStub(overrides: Partial<SessionApi> = {}): SessionApi {
  return {
    sync: vi.fn(),
    getMessagePage: vi.fn(),
    sendMessage: vi.fn(),
    heartbeat: vi.fn(),
    startSession: vi.fn(),
    extendSession: vi.fn(),
    startSynthesis: vi.fn(),
    endSession: vi.fn(),
    upsertClosingResponse: vi.fn(),
    deleteClosingResponse: vi.fn(),
    getDiscussionResult: vi.fn(),
    retryDiscussionResult: vi.fn(),
    ...overrides,
  };
}
