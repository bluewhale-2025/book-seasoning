import {
  SessionRealtimeBroadcastPayloadSchema,
  SessionTypingBroadcastSchema,
  type SessionEvent,
  type SessionRealtimeChannels,
  type SessionTypingBroadcast,
} from "@bookseasoning/contracts/public";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type RealtimeConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type SessionRealtimeListener = Readonly<{
  onEvent(event: SessionEvent): void;
  onTyping(signal: SessionTypingBroadcast): void;
  onPresence(userIds: ReadonlySet<string>): void;
  onStatus(status: RealtimeConnectionStatus): void;
  onProtocolError(): void;
}>;

export type SessionRealtimeSubscription = Readonly<{
  sendTyping(signal: SessionTypingBroadcast): Promise<void>;
  close(): Promise<void>;
}>;

export type SessionRealtimeClient = Readonly<{
  subscribe(
    channels: SessionRealtimeChannels,
    actorUserId: string,
    listener: SessionRealtimeListener,
  ): Promise<SessionRealtimeSubscription>;
}>;

function waitForSubscription(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !settled) {
        settled = true;
        resolve();
      } else if (
        (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") &&
        !settled
      ) {
        settled = true;
        reject(new Error("realtime_subscription_failed"));
      }
    });
  });
}

function presenceUserIds(channel: RealtimeChannel): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const presences of Object.values(channel.presenceState())) {
    for (const presence of presences) {
      if (
        typeof presence === "object" &&
        presence !== null &&
        "userId" in presence &&
        typeof presence.userId === "string"
      ) {
        ids.add(presence.userId);
      }
    }
  }
  return ids;
}

export class SupabaseSessionRealtimeClient implements SessionRealtimeClient {
  public constructor(private readonly client: SupabaseClient) {}

  public async subscribe(
    channels: SessionRealtimeChannels,
    actorUserId: string,
    listener: SessionRealtimeListener,
  ): Promise<SessionRealtimeSubscription> {
    listener.onStatus("connecting");
    const session = await this.client.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error("realtime_auth_required");
    this.client.realtime.setAuth(accessToken);

    const official = this.client
      .channel(channels.eventTopic, { config: { private: true } })
      .on("broadcast", { event: "session_event" }, (message) => {
        const parsed = SessionRealtimeBroadcastPayloadSchema.safeParse(message.payload);
        if (!parsed.success) {
          listener.onProtocolError();
          return;
        }
        listener.onEvent(parsed.data.event);
      });

    const ephemeral = this.client
      .channel(channels.ephemeralTopic, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: actorUserId },
        },
      })
      .on("broadcast", { event: "typing" }, (message) => {
        const parsed = SessionTypingBroadcastSchema.safeParse(message.payload);
        if (!parsed.success || parsed.data.userId === actorUserId) return;
        listener.onTyping(parsed.data);
      })
      .on("presence", { event: "sync" }, () => {
        listener.onPresence(presenceUserIds(ephemeral));
      });

    try {
      await waitForSubscription(official);
      await waitForSubscription(ephemeral);
      await ephemeral.track({ userId: actorUserId, onlineAt: new Date().toISOString() });
      listener.onPresence(presenceUserIds(ephemeral));
      listener.onStatus("connected");
    } catch (error) {
      await Promise.allSettled([
        this.client.removeChannel(official),
        this.client.removeChannel(ephemeral),
      ]);
      listener.onStatus("failed");
      throw error;
    }

    let closed = false;
    return {
      sendTyping: async (signal) => {
        if (closed) return;
        const parsed = SessionTypingBroadcastSchema.parse(signal);
        const result = await ephemeral.send({
          type: "broadcast",
          event: "typing",
          payload: parsed,
        });
        if (result !== "ok") throw new Error("typing_broadcast_failed");
      },
      close: async () => {
        if (closed) return;
        closed = true;
        await Promise.allSettled([
          this.client.removeChannel(official),
          this.client.removeChannel(ephemeral),
        ]);
      },
    };
  }
}
