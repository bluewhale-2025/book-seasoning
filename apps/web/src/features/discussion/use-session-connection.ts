import * as React from "react";
import type {
  SessionEvent,
  SessionSnapshot,
  SessionTypingBroadcast,
} from "@bookseasoning/contracts/public";
import { useQueryClient } from "@tanstack/react-query";

import type { SessionApi } from "../../data/session-api";
import type {
  SessionRealtimeClient,
  SessionRealtimeSubscription,
} from "../../data/session-realtime";
import { mergeSessionSync, projectSessionEvent } from "./session-projection";
import { useSessionStoreApi } from "./session-store";
import { getSessionDeviceId } from "../../lib/session-device-id";

const HEARTBEAT_FALLBACK_MS = 15_000;
const REMOTE_TYPING_EXPIRY_MS = 4_000;

type SessionConnectionInput = Readonly<{
  roomId: string;
  api: SessionApi;
  realtime: SessionRealtimeClient;
  snapshot: SessionSnapshot | undefined;
  queryKey: readonly ["session", string];
}>;

export type SessionConnectionController = Readonly<{
  recover(): Promise<void>;
  broadcastTyping(signal: SessionTypingBroadcast): boolean;
}>;

export function useSessionConnection({
  roomId,
  api,
  realtime,
  snapshot,
  queryKey,
}: SessionConnectionInput): SessionConnectionController {
  const queryClient = useQueryClient();
  const store = useSessionStoreApi();
  const subscriptionRef = React.useRef<SessionRealtimeSubscription | null>(null);
  const recoveryRef = React.useRef<Promise<void> | null>(null);
  const remoteTypingTimersRef = React.useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  const recover = React.useCallback(async (): Promise<void> => {
    if (recoveryRef.current !== null) return recoveryRef.current;

    const operation = (async () => {
      store.getState().setConnectionStatus("reconnecting");
      let current = queryClient.getQueryData<SessionSnapshot>(queryKey);
      if (current === undefined) {
        current = await api.sync(roomId, {
          afterEventCursor: 0,
          afterMessageSeq: 0,
          messageLimit: 100,
        });
        queryClient.setQueryData(queryKey, current);
      }
      if (current === undefined) throw new Error("session_snapshot_unavailable");

      let hasMore = true;
      while (hasMore) {
        const incoming = await api.sync(roomId, {
          afterEventCursor: current.cursors.eventCursor,
          afterMessageSeq: current.cursors.latestMessageSeq,
          messageLimit: 100,
        });
        current = mergeSessionSync(current, incoming);
        queryClient.setQueryData(queryKey, current);
        hasMore =
          incoming.cursors.hasMoreEventsAfter || incoming.cursors.hasMoreMessagesAfter;
      }
      if (current.realtime === null || subscriptionRef.current !== null) {
        store.getState().setConnectionStatus("connected");
      }
    })()
      .catch((error: unknown) => {
        store.getState().setConnectionStatus("failed");
        throw error;
      })
      .finally(() => {
        recoveryRef.current = null;
      });

    recoveryRef.current = operation;
    return operation;
  }, [api, queryClient, queryKey, roomId, store]);

  const applyLiveEvent = React.useCallback(
    (event: SessionEvent) => {
      let gap = false;
      queryClient.setQueryData<SessionSnapshot>(queryKey, (current) => {
        if (current === undefined) {
          gap = true;
          return current;
        }
        const result = projectSessionEvent(current, event);
        gap = result.kind === "gap";
        return result.snapshot;
      });
      if (gap) void recover();
    },
    [queryClient, queryKey, recover],
  );

  const eventTopic = snapshot?.realtime?.eventTopic;
  const ephemeralTopic = snapshot?.realtime?.ephemeralTopic;
  const actorUserId = snapshot?.actor.userId;
  const realtimeDisabled = snapshot?.realtime === null;

  React.useEffect(() => {
    if (!eventTopic || !ephemeralTopic || !actorUserId) {
      if (realtimeDisabled) store.getState().setConnectionStatus("connected");
      return;
    }

    let active = true;
    let buffering = true;
    const bufferedEvents: SessionEvent[] = [];
    store.getState().setConnectionStatus("connecting");

    void realtime
      .subscribe(
        { eventTopic, ephemeralTopic },
        actorUserId,
        {
          onEvent: (event) => {
            if (!active) return;
            if (buffering) bufferedEvents.push(event);
            else applyLiveEvent(event);
          },
          onTyping: (signal) => {
            if (!active) return;
            store.getState().setTyping(signal.userId, signal.typing);
            const previous = remoteTypingTimersRef.current.get(signal.userId);
            if (previous) clearTimeout(previous);
            if (signal.typing) {
              remoteTypingTimersRef.current.set(
                signal.userId,
                setTimeout(() => {
                  store.getState().setTyping(signal.userId, false);
                  remoteTypingTimersRef.current.delete(signal.userId);
                }, REMOTE_TYPING_EXPIRY_MS),
              );
            }
          },
          onPresence: (userIds) => store.getState().setPresence(userIds),
          onStatus: (status) => store.getState().setConnectionStatus(status),
          onProtocolError: () => void recover(),
        },
      )
      .then(async (subscription) => {
        if (!active) {
          await subscription.close();
          return;
        }
        subscriptionRef.current = subscription;
        await recover();
        buffering = false;
        bufferedEvents
          .sort((left, right) => left.eventCursor - right.eventCursor)
          .forEach(applyLiveEvent);
        store.getState().setConnectionStatus("connected");
      })
      .catch(() => {
        if (active) store.getState().setConnectionStatus("failed");
      });

    return () => {
      active = false;
      const subscription = subscriptionRef.current;
      subscriptionRef.current = null;
      if (subscription) void subscription.close();
      for (const timer of remoteTypingTimersRef.current.values()) clearTimeout(timer);
      remoteTypingTimersRef.current.clear();
      store.getState().setPresence(new Set());
    };
  }, [
    actorUserId,
    applyLiveEvent,
    ephemeralTopic,
    eventTopic,
    realtime,
    realtimeDisabled,
    recover,
    store,
  ]);

  const hasRealtime = snapshot?.realtime !== null && snapshot?.realtime !== undefined;
  const sessionId = snapshot?.sessionId;

  React.useEffect(() => {
    if (!hasRealtime || !sessionId) return;
    const deviceId = getSessionDeviceId(roomId);
    let stopped = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const beat = async () => {
      let nextDelay = HEARTBEAT_FALLBACK_MS;
      try {
        const response = await api.heartbeat(roomId, deviceId);
        nextDelay = response.heartbeatIntervalSeconds * 1000;
        const current = queryClient.getQueryData<SessionSnapshot>(queryKey);
        if (
          current !== undefined &&
          (response.channelEpoch !== current.state.channelEpoch ||
            response.eventCursor > current.cursors.eventCursor)
        ) {
          await recover();
        }
      } catch {
        store.getState().setConnectionStatus("reconnecting");
      }
      if (!stopped) timeout = setTimeout(beat, nextDelay);
    };

    void beat();
    return () => {
      stopped = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [api, hasRealtime, queryClient, queryKey, recover, roomId, sessionId, store]);

  React.useEffect(() => {
    const handleOffline = () => store.getState().setConnectionStatus("reconnecting");
    const handleOnline = () => void recover();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void recover();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [recover, store]);

  const broadcastTyping = React.useCallback((signal: SessionTypingBroadcast): boolean => {
    const subscription = subscriptionRef.current;
    if (!subscription) return false;
    void subscription.sendTyping(signal).catch(() => undefined);
    return true;
  }, []);

  return { recover, broadcastTyping };
}
