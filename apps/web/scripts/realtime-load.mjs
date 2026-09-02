import { Buffer } from "node:buffer";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";

import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "REALTIME_LOAD_ACCESS_TOKEN",
];
const missing = required.filter((key) => !process.env[key]);
if (!process.env.REALTIME_LOAD_SESSION_ID && !process.env.REALTIME_LOAD_SESSION_IDS) {
  missing.push("REALTIME_LOAD_SESSION_ID or REALTIME_LOAD_SESSION_IDS");
}
if (missing.length > 0) {
  process.stderr.write(`Missing load-test environment: ${missing.join(", ")}\n`);
  process.exit(2);
}

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const accessToken = process.env.REALTIME_LOAD_ACCESS_TOKEN;
const sessionIds = (process.env.REALTIME_LOAD_SESSION_IDS ?? process.env.REALTIME_LOAD_SESSION_ID)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const userId = process.env.REALTIME_LOAD_USER_ID ?? JSON.parse(
  Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
).sub;
const epoch = Number(process.env.REALTIME_LOAD_CHANNEL_EPOCH ?? "1");
const clientCount = Number(process.env.REALTIME_LOAD_CLIENTS ?? "10");
const activeSendersPerRound = Number(
  process.env.REALTIME_LOAD_ACTIVE_SENDERS ?? String(Math.min(15, Math.max(1, Math.ceil(clientCount * 0.1)))),
);
const durationSeconds = Number(process.env.REALTIME_LOAD_DURATION_SECONDS ?? "30");
const joinP95BudgetMs = Number(process.env.REALTIME_LOAD_JOIN_P95_MS ?? "3000");
const deliveryP95BudgetMs = Number(process.env.REALTIME_LOAD_DELIVERY_P95_MS ?? "1000");
const deliveryRatioMinimum = Number(process.env.REALTIME_LOAD_DELIVERY_RATIO ?? "0.95");

if (
  !Number.isInteger(clientCount) ||
  clientCount < 1 ||
  clientCount > 200 ||
  !Number.isInteger(activeSendersPerRound) ||
  activeSendersPerRound < 1 ||
  activeSendersPerRound > clientCount ||
  !Number.isFinite(durationSeconds) ||
  durationSeconds < 1
) {
  process.stderr.write("Invalid REALTIME_LOAD_CLIENTS or REALTIME_LOAD_DURATION_SECONDS\n");
  process.exit(2);
}

function percentile(values, quantile) {
  if (values.length === 0) return null;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * quantile) - 1)];
}

function subscribe(channel, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("subscription_timeout")), timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timeout);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timeout);
        reject(new Error(status));
      }
    });
  });
}

const joinLatencies = [];
const deliveryLatencies = [];
const sentAtStarts = new Map();
const resources = [];
let sends = 0;
let expectedDeliveries = 0;

try {
  await Promise.all(
    Array.from({ length: clientCount }, async (_, index) => {
      const sessionId = sessionIds[index % sessionIds.length];
      const eventTopic = `session:${sessionId}:v${epoch}`;
      const ephemeralTopic = `${eventTopic}:ephemeral`;
      const client = createClient(supabaseUrl, publishableKey, {
        accessToken: async () => accessToken,
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      });
      client.realtime.setAuth(accessToken);
      const official = client.channel(eventTopic, { config: { private: true } });
      const ephemeral = client
        .channel(ephemeralTopic, {
          config: {
            private: true,
            broadcast: { self: true },
            presence: { key: `${userId}:${index}` },
          },
        })
        .on("broadcast", { event: "typing" }, (message) => {
          const sentAt = message.payload?.sentAt;
          const started = typeof sentAt === "string" ? sentAtStarts.get(sentAt) : undefined;
          if (started !== undefined) deliveryLatencies.push(performance.now() - started);
        });
      const started = performance.now();
      await Promise.all([subscribe(official), subscribe(ephemeral)]);
      joinLatencies.push(performance.now() - started);
      await ephemeral.track({ userId, loadClient: index, onlineAt: new Date().toISOString() });
      resources.push({ client, official, ephemeral, index, sessionId });
    }),
  );

  const deadline = performance.now() + durationSeconds * 1000;
  let round = 0;
  while (performance.now() < deadline) {
    const activeResources = Array.from(
      { length: activeSendersPerRound },
      (_, offset) => resources[(round * activeSendersPerRound + offset) % resources.length],
    );
    await Promise.all(
      activeResources.map(async ({ ephemeral, index, sessionId }) => {
        const sentAt = new Date(Date.now() + round * clientCount + index).toISOString();
        sentAtStarts.set(sentAt, performance.now());
        const result = await ephemeral.send({
          type: "broadcast",
          event: "typing",
          payload: { userId, typing: true, sentAt },
        });
        if (result !== "ok") throw new Error("broadcast_send_failed");
        sends += 1;
        expectedDeliveries += resources.filter(
          (resource) => resource.sessionId === sessionId,
        ).length;
      }),
    );
    round += 1;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  await new Promise((resolve) => setTimeout(resolve, 1000));
} catch (error) {
  process.stderr.write(`Realtime load harness failed: ${error instanceof Error ? error.message : "unknown"}\n`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(
    resources.flatMap(({ client, official, ephemeral }) => [
      client.removeChannel(official),
      client.removeChannel(ephemeral),
    ]),
  );
  for (const { client } of resources) client.realtime.disconnect();
}

const report = {
  clients: clientCount,
  sessionCount: sessionIds.length,
  activeSendersPerRound,
  durationSeconds,
  channelsPerClient: 2,
  sends,
  received: deliveryLatencies.length,
  deliveryRatio: expectedDeliveries === 0 ? 0 : deliveryLatencies.length / expectedDeliveries,
  joinLatencyMs: {
    p50: percentile(joinLatencies, 0.5),
    p95: percentile(joinLatencies, 0.95),
  },
  typingDeliveryLatencyMs: {
    p50: percentile(deliveryLatencies, 0.5),
    p95: percentile(deliveryLatencies, 0.95),
  },
  thresholds: {
    joinP95BudgetMs,
    deliveryP95BudgetMs,
    deliveryRatioMinimum,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (
  process.exitCode !== 1 &&
  (report.joinLatencyMs.p95 === null ||
    report.joinLatencyMs.p95 > joinP95BudgetMs ||
    report.typingDeliveryLatencyMs.p95 === null ||
    report.typingDeliveryLatencyMs.p95 > deliveryP95BudgetMs ||
    report.deliveryRatio < deliveryRatioMinimum)
) {
  process.exitCode = 1;
}
