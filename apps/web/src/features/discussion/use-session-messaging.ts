import * as React from "react";
import type {
  SendSessionMessageRequest,
  SessionSnapshot,
  SessionTypingBroadcast,
} from "@bookseasoning/contracts/public";
import { useQueryClient } from "@tanstack/react-query";

import type { SessionApi } from "../../data/session-api";
import { canComposeSessionMessage } from "./session-capabilities";
import { prependMessagePage, projectConfirmedMessage } from "./session-projection";
import { useSessionStore, useSessionStoreApi } from "./session-store";

const LOCAL_TYPING_IDLE_MS = 2_500;

type SessionMessagingInput = Readonly<{
  roomId: string;
  api: SessionApi;
  snapshot: SessionSnapshot | undefined;
  queryKey: readonly ["session", string];
  recover(): Promise<void>;
  broadcastTyping(signal: SessionTypingBroadcast): boolean;
}>;

export type SessionMessagingController = Readonly<{
  loadingOlder: boolean;
  composerEnabled: boolean;
  sendMessage(body: string): Promise<void>;
  retryMessage(clientMessageId: string): Promise<void>;
  loadOlder(): Promise<void>;
  setLocalTyping(typing: boolean): void;
}>;

export function useSessionMessaging({
  roomId,
  api,
  snapshot,
  queryKey,
  recover,
  broadcastTyping,
}: SessionMessagingInput): SessionMessagingController {
  const queryClient = useQueryClient();
  const store = useSessionStoreApi();
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const replyTarget = useSessionStore((state) => state.replyTarget);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const typingIdleRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = React.useRef(false);

  const transmitMessage = React.useCallback(
    async (request: SendSessionMessageRequest) => {
      store.getState().enqueueMessage({ ...request, status: "pending" });
      try {
        const response = await api.sendMessage(roomId, request);
        let gap = false;
        queryClient.setQueryData<SessionSnapshot>(queryKey, (current) => {
          if (current === undefined) return current;
          const projected = projectConfirmedMessage(current, response);
          gap = projected.kind === "gap";
          return projected.snapshot;
        });
        store.getState().removeMessage(request.clientMessageId);
        store.getState().setReplyTarget(null);
        if (gap) await recover();
      } catch (error) {
        const code =
          error instanceof Error && "code" in error && typeof error.code === "string"
            ? error.code
            : "MESSAGE_SEND_FAILED";
        store.getState().failMessage(request.clientMessageId, code);
      }
    },
    [api, queryClient, queryKey, recover, roomId, store],
  );

  const sendMessage = React.useCallback(
    async (body: string) => {
      await transmitMessage({
        clientMessageId: crypto.randomUUID(),
        body,
        replyToMessageId: replyTarget?.messageId ?? null,
      });
    },
    [replyTarget?.messageId, transmitMessage],
  );

  const retryMessage = React.useCallback(
    async (clientMessageId: string) => {
      const pending = store
        .getState()
        .pendingMessages.find((message) => message.clientMessageId === clientMessageId);
      if (!pending) return;
      await transmitMessage({
        clientMessageId: pending.clientMessageId,
        body: pending.body,
        replyToMessageId: pending.replyToMessageId,
      });
    },
    [store, transmitMessage],
  );

  const loadOlder = React.useCallback(async () => {
    const current = queryClient.getQueryData<SessionSnapshot>(queryKey);
    if (!current?.cursors.hasMoreMessagesBefore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await api.getMessagePage(
        roomId,
        current.cursors.oldestMessageSeq ?? undefined,
      );
      queryClient.setQueryData<SessionSnapshot>(queryKey, (latest) =>
        latest === undefined ? latest : prependMessagePage(latest, page),
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [api, loadingOlder, queryClient, queryKey, roomId]);

  const setLocalTyping = React.useCallback(
    (typing: boolean) => {
      const current = queryClient.getQueryData<SessionSnapshot>(queryKey);
      if (!current || !canComposeSessionMessage(current)) return;

      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
      const send = (nextTyping: boolean) => {
        if (lastTypingSentRef.current === nextTyping) return;
        const signal: SessionTypingBroadcast = {
          userId: current.actor.userId,
          typing: nextTyping,
          sentAt: new Date().toISOString(),
        };
        if (broadcastTyping(signal)) lastTypingSentRef.current = nextTyping;
      };

      send(typing);
      if (typing) {
        typingIdleRef.current = setTimeout(() => send(false), LOCAL_TYPING_IDLE_MS);
      }
    },
    [broadcastTyping, queryClient, queryKey],
  );

  React.useEffect(
    () => () => {
      if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
    },
    [],
  );

  React.useEffect(() => {
    if (connectionStatus !== "connected") lastTypingSentRef.current = false;
  }, [connectionStatus]);

  React.useEffect(() => {
    const stopTypingInBackground = () => {
      if (document.visibilityState === "hidden") setLocalTyping(false);
    };
    document.addEventListener("visibilitychange", stopTypingInBackground);
    return () => document.removeEventListener("visibilitychange", stopTypingInBackground);
  }, [setLocalTyping]);

  return {
    loadingOlder,
    composerEnabled:
      snapshot !== undefined &&
      canComposeSessionMessage(snapshot) &&
      connectionStatus === "connected",
    sendMessage,
    retryMessage,
    loadOlder,
    setLocalTyping,
  };
}
