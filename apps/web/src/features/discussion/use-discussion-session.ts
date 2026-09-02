import * as React from "react";
import type { SessionMessage, SessionSnapshot } from "@bookseasoning/contracts/public";
import { useQuery } from "@tanstack/react-query";

import type { SessionApi } from "../../data/session-api";
import type { SessionRealtimeClient } from "../../data/session-realtime";
import { useSessionStoreApi } from "./session-store";
import { useSessionConnection } from "./use-session-connection";
import { useSessionMessaging } from "./use-session-messaging";

export const sessionQueryKey = (roomId: string) => ["session", roomId] as const;

export type DiscussionSessionController = Readonly<{
  snapshot: SessionSnapshot | undefined;
  loading: boolean;
  error: Error | null;
  loadingOlder: boolean;
  composerEnabled: boolean;
  sendMessage(body: string): Promise<void>;
  retryMessage(clientMessageId: string): Promise<void>;
  loadOlder(): Promise<void>;
  setLocalTyping(typing: boolean): void;
  recover(): Promise<void>;
  replyTo(message: SessionMessage): void;
  controlBusy: "extend" | "synthesis" | "end" | null;
  controlError: string | null;
  extendSession(): Promise<boolean>;
  startSynthesis(): Promise<boolean>;
  endSession(): Promise<boolean>;
}>;

export function useDiscussionSession(
  roomId: string,
  api: SessionApi,
  realtime: SessionRealtimeClient,
): DiscussionSessionController {
  const store = useSessionStoreApi();
  const queryKey = React.useMemo(() => sessionQueryKey(roomId), [roomId]);
  const query = useQuery({
    queryKey,
    queryFn: () =>
      api.sync(roomId, {
        afterEventCursor: 0,
        afterMessageSeq: 0,
        messageLimit: 100,
      }),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const connection = useSessionConnection({
    roomId,
    api,
    realtime,
    snapshot: query.data,
    queryKey,
  });
  const messaging = useSessionMessaging({
    roomId,
    api,
    snapshot: query.data,
    queryKey,
    recover: connection.recover,
    broadcastTyping: connection.broadcastTyping,
  });
  const [controlBusy, setControlBusy] = React.useState<
    "extend" | "synthesis" | "end" | null
  >(null);
  const [controlError, setControlError] = React.useState<string | null>(null);
  const controlInFlightRef = React.useRef(false);

  const runControl = React.useCallback(
    async (
      action: "extend" | "synthesis" | "end",
      command: (
        request: Readonly<{
          commandId: string;
          expectedPhaseVersion: number;
          payload: Readonly<Record<string, never>>;
        }>,
      ) => Promise<unknown>,
    ) => {
      const snapshot = query.data;
      if (snapshot === undefined || controlInFlightRef.current) return false;
      controlInFlightRef.current = true;
      setControlBusy(action);
      setControlError(null);
      try {
        await command({
          commandId: crypto.randomUUID(),
          expectedPhaseVersion: snapshot.state.phaseVersion,
          payload: {},
        });
        await connection.recover();
        return true;
      } catch (error) {
        setControlError(
          error instanceof Error
            ? error.message
            : "세션 상태를 변경하지 못했습니다. 최신 상태를 확인해 주세요.",
        );
        await connection.recover().catch(() => undefined);
        return false;
      } finally {
        controlInFlightRef.current = false;
        setControlBusy(null);
      }
    },
    [connection, query.data],
  );

  return {
    snapshot: query.data,
    loading: query.isPending,
    error: query.error instanceof Error ? query.error : null,
    ...messaging,
    recover: connection.recover,
    controlBusy,
    controlError,
    extendSession: () =>
      runControl("extend", (request) => api.extendSession(roomId, request)),
    startSynthesis: () =>
      runControl("synthesis", (request) => api.startSynthesis(roomId, request)),
    endSession: () =>
      runControl("end", (request) => api.endSession(roomId, request)),
    replyTo: (message) =>
      store.getState().setReplyTarget({
        messageId: message.messageId,
        body: message.body,
        author: message.author,
      }),
  };
}
