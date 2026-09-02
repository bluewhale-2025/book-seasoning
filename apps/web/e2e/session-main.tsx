import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  SessionRealtimeBroadcastPayloadSchema,
  SessionTypingBroadcastSchema,
} from "@bookseasoning/contracts/public";
import type {
  SessionRealtimeClient,
  SessionRealtimeListener,
  SessionRealtimeSubscription,
} from "../src/data/session-realtime";
import { AuthenticatedHttpClient } from "../src/data/http-client";
import { HttpRoomApi } from "../src/data/room-api";
import { HttpSessionApi } from "../src/data/session-api";
import { DiscussionSessionPage } from "../src/features/discussion/discussion-session-page";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "../src/styles/globals.css";

const apiBase = "http://127.0.0.1:4174";
const actor = new URLSearchParams(location.search).get("actor") === "participant"
  ? "participant"
  : "host";
const userId =
  actor === "participant"
    ? "90000000-0000-4000-8000-000000000004"
    : "90000000-0000-4000-8000-000000000003";

class EventSourceRealtimeClient implements SessionRealtimeClient {
  public async subscribe(
    _channels: Parameters<SessionRealtimeClient["subscribe"]>[0],
    _actorUserId: string,
    listener: SessionRealtimeListener,
  ): Promise<SessionRealtimeSubscription> {
    listener.onStatus("connecting");
    const source = new EventSource(`${apiBase}/events?actor=${actor}`);
    source.addEventListener("open", () => {
      listener.onPresence(
        new Set([
          "90000000-0000-4000-8000-000000000003",
          "90000000-0000-4000-8000-000000000004",
        ]),
      );
      listener.onStatus("connected");
    });
    source.addEventListener("session_event", (raw) => {
      const parsed = SessionRealtimeBroadcastPayloadSchema.safeParse(
        JSON.parse((raw as MessageEvent<string>).data),
      );
      if (parsed.success) listener.onEvent(parsed.data.event);
      else listener.onProtocolError();
    });
    source.addEventListener("typing", (raw) => {
      const parsed = SessionTypingBroadcastSchema.safeParse(
        JSON.parse((raw as MessageEvent<string>).data),
      );
      if (parsed.success && parsed.data.userId !== userId) listener.onTyping(parsed.data);
    });
    source.addEventListener("error", () => listener.onStatus("reconnecting"));

    await new Promise<void>((resolve) => {
      if (source.readyState === EventSource.OPEN) resolve();
      else source.addEventListener("open", () => resolve(), { once: true });
    });
    return {
      sendTyping: async (signal) => {
        await fetch(`${apiBase}/typing`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(signal),
        });
      },
      close: async () => source.close(),
    };
  }
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const http = new AuthenticatedHttpClient({ apiBaseUrl: apiBase, getAccessToken: async () => actor });
const api = new HttpSessionApi(http);
const rooms = new HttpRoomApi(http);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <DiscussionSessionPage
        roomId="90000000-0000-4000-8000-000000000001"
        dependencies={{ api, rooms, realtime: new EventSourceRealtimeClient() }}
      />
    </QueryClientProvider>
  </StrictMode>,
);
