import * as React from "react";
import type { SessionMessage } from "@bookseasoning/contracts/public";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useStore } from "zustand";

import type { RealtimeConnectionStatus } from "../../data/session-realtime";

export type PendingMessage = Readonly<{
  clientMessageId: string;
  body: string;
  replyToMessageId: string | null;
  status: "pending" | "failed";
  errorCode?: string;
}>;

export type ReplyTarget = Pick<SessionMessage, "messageId" | "body" | "author">;

export type SessionEphemeralState = Readonly<{
  connectionStatus: RealtimeConnectionStatus;
  pendingMessages: readonly PendingMessage[];
  presenceUserIds: ReadonlySet<string>;
  typingUserIds: ReadonlySet<string>;
  replyTarget: ReplyTarget | null;
  newMessageCount: number;
  setConnectionStatus(status: RealtimeConnectionStatus): void;
  enqueueMessage(message: PendingMessage): void;
  failMessage(clientMessageId: string, errorCode: string): void;
  removeMessage(clientMessageId: string): void;
  setPresence(userIds: ReadonlySet<string>): void;
  setTyping(userId: string, typing: boolean): void;
  setReplyTarget(target: ReplyTarget | null): void;
  incrementNewMessageCount(): void;
  clearNewMessageCount(): void;
}>;

export function createSessionEphemeralStore(): StoreApi<SessionEphemeralState> {
  return createStore<SessionEphemeralState>((set) => ({
    connectionStatus: "connecting",
    pendingMessages: [],
    presenceUserIds: new Set(),
    typingUserIds: new Set(),
    replyTarget: null,
    newMessageCount: 0,
    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
    enqueueMessage: (message) =>
      set((state) => ({
        pendingMessages: [
          ...state.pendingMessages.filter(
            (candidate) => candidate.clientMessageId !== message.clientMessageId,
          ),
          message,
        ],
      })),
    failMessage: (clientMessageId, errorCode) =>
      set((state) => ({
        pendingMessages: state.pendingMessages.map((message) =>
          message.clientMessageId === clientMessageId
            ? { ...message, status: "failed", errorCode }
            : message,
        ),
      })),
    removeMessage: (clientMessageId) =>
      set((state) => ({
        pendingMessages: state.pendingMessages.filter(
          (message) => message.clientMessageId !== clientMessageId,
        ),
      })),
    setPresence: (presenceUserIds) => set({ presenceUserIds: new Set(presenceUserIds) }),
    setTyping: (userId, typing) =>
      set((state) => {
        const typingUserIds = new Set(state.typingUserIds);
        if (typing) typingUserIds.add(userId);
        else typingUserIds.delete(userId);
        return { typingUserIds };
      }),
    setReplyTarget: (replyTarget) => set({ replyTarget }),
    incrementNewMessageCount: () =>
      set((state) => ({ newMessageCount: state.newMessageCount + 1 })),
    clearNewMessageCount: () => set({ newMessageCount: 0 }),
  }));
}

const SessionStoreContext = React.createContext<StoreApi<SessionEphemeralState> | null>(null);

export function SessionStoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = React.useRef<StoreApi<SessionEphemeralState> | null>(null);
  storeRef.current ??= createSessionEphemeralStore();
  return (
    <SessionStoreContext.Provider value={storeRef.current}>
      {children}
    </SessionStoreContext.Provider>
  );
}

export function useSessionStore<T>(selector: (state: SessionEphemeralState) => T): T {
  const store = React.useContext(SessionStoreContext);
  if (store === null) throw new Error("SessionStoreProvider is missing");
  return useStore(store, selector);
}

export function useSessionStoreApi(): StoreApi<SessionEphemeralState> {
  const store = React.useContext(SessionStoreContext);
  if (store === null) throw new Error("SessionStoreProvider is missing");
  return store;
}
