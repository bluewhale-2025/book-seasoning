import { createServer } from "node:http";
import process from "node:process";
import { URL } from "node:url";

const port = 4174;
const roomId = "90000000-0000-4000-8000-000000000001";
const sessionId = "90000000-0000-4000-8000-000000000002";
const hostUserId = "90000000-0000-4000-8000-000000000003";
const participantUserId = "90000000-0000-4000-8000-000000000004";
const clients = new Set();

function actorIdentity(actor) {
  return actor === "participant"
    ? { userId: participantUserId, profileName: "수진", role: "PARTICIPANT" }
    : { userId: hostUserId, profileName: "민수", role: "HOST" };
}

function makeMessage(seqNo, actor, body, clientMessageId, replyToMessageId = null) {
  const identity = actorIdentity(actor);
  const target = state.messages.find((message) => message.messageId === replyToMessageId);
  return {
    messageId: `94000000-0000-4000-8000-${String(seqNo).padStart(12, "0")}`,
    sessionId,
    seqNo,
    kind: "PARTICIPANT",
    author: { userId: identity.userId, profileName: identity.profileName },
    clientMessageId,
    body,
    reply: target
      ? {
          messageId: target.messageId,
          authorProfileName: target.author.profileName,
          quote: target.body.slice(0, 120),
        }
      : null,
    confirmedAt: new Date().toISOString(),
  };
}

function initialState() {
  const first = makeMessage(
    1,
    "host",
    "첫 번째 확정 메시지",
    "95000000-0000-4000-8000-000000000001",
  );
  return {
    messages: [first],
    events: [],
    aggregateVersion: 1,
    eventCursor: 1,
    dedupe: new Map(),
    failedOnce: new Set(),
  };
}

let state = { messages: [], events: [], aggregateVersion: 0, eventCursor: 0, dedupe: new Map(), failedOnce: new Set() };
state = initialState();

function headers(response, status = 200, contentType = "application/json") {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "cache-control": "no-store",
    "content-type": contentType,
  });
}

function json(response, payload, status = 200) {
  headers(response, status);
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) reject(new Error("body_too_large"));
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function actorFrom(request) {
  return request.headers.authorization?.replace(/^Bearer /, "") === "participant"
    ? "participant"
    : "host";
}

function snapshot(actor, afterEventCursor, afterMessageSeq) {
  const identity = actorIdentity(actor);
  const initial = afterEventCursor === 0 && afterMessageSeq === 0;
  const messages = initial
    ? state.messages.slice(-100)
    : state.messages.filter((message) => message.seqNo > afterMessageSeq).slice(0, 100);
  const events = initial
    ? []
    : state.events.filter((event) => event.eventCursor > afterEventCursor).slice(0, 200);
  return {
    sessionId,
    serverTime: new Date().toISOString(),
    room: {
      roomId,
      title: "브라우저 실시간 토론",
      scheduledStartAt: "2026-09-02T10:00:00.000Z",
      packVersionId: "90000000-0000-4000-8000-000000000005",
      bookTitle: "소년이 온다",
      bookAuthor: "한강",
      bookCoverUrl: null,
    },
    actor: {
      userId: identity.userId,
      role: identity.role,
      membershipStatus: "PARTICIPATED",
      actualParticipation: true,
    },
    state: {
      phase: "OPENING",
      phaseVersion: 1,
      aggregateVersion: state.aggregateVersion,
      channelEpoch: 1,
      startedAt: "2026-09-02T10:00:00.000Z",
      endedAt: null,
      extensionCount: 0,
      deadlines: {
        discussionEndsAt: "2099-09-02T10:30:00.000Z",
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: "2099-09-02T10:25:00.000Z",
        closingStartedAt: null,
        closingEndsAt: null,
      },
    },
    participants: [
      {
        userId: hostUserId,
        profileName: "민수",
        role: "HOST",
        membershipStatus: "PARTICIPATED",
        connectionStatus: "ONLINE",
        actualParticipation: true,
      },
      {
        userId: participantUserId,
        profileName: "수진",
        role: "PARTICIPANT",
        membershipStatus: "PARTICIPATED",
        connectionStatus: "ONLINE",
        actualParticipation: true,
      },
    ],
    connectedParticipantCount: 2,
    messages,
    events,
    cursors: {
      eventCursor: state.eventCursor,
      latestMessageSeq: state.messages.at(-1)?.seqNo ?? 0,
      oldestMessageSeq: messages[0]?.seqNo ?? null,
      hasMoreMessagesBefore: initial && state.messages.length > messages.length,
      hasMoreMessagesAfter: false,
      hasMoreEventsAfter: false,
    },
    publicDiscussion: { currentTopic: "침묵은 어떤 선택이었을까요?" },
    ai: { extensionOpinion: null, latestHostHelpRequest: null },
    closing: null,
    result: { status: "NOT_STARTED", canRetry: false },
    realtime: {
      eventTopic: `session:${sessionId}:v1`,
      ephemeralTopic: `session:${sessionId}:v1:ephemeral`,
    },
  };
}

function broadcast(event, payload) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) client.write(frame);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    headers(response, 204);
    response.end();
    return;
  }
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "POST" && url.pathname === "/reset") {
    state = initialState();
    json(response, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/events") {
    headers(response, 200, "text/event-stream");
    response.write("retry: 250\n\n");
    clients.add(response);
    request.on("close", () => clients.delete(response));
    return;
  }

  if (request.method === "GET" && url.pathname.endsWith("/session/sync")) {
    json(
      response,
      snapshot(
        actorFrom(request),
        Number(url.searchParams.get("afterEventCursor") ?? 0),
        Number(url.searchParams.get("afterMessageSeq") ?? 0),
      ),
    );
    return;
  }

  if (request.method === "GET" && url.pathname.endsWith("/session/messages")) {
    const before = Number(url.searchParams.get("beforeSeq") ?? Number.MAX_SAFE_INTEGER);
    const messages = state.messages.filter((message) => message.seqNo < before).slice(-50);
    json(response, {
      sessionId,
      serverTime: new Date().toISOString(),
      messages,
      page: {
        oldestMessageSeq: messages[0]?.seqNo ?? null,
        newestMessageSeq: messages.at(-1)?.seqNo ?? null,
        hasMoreBefore: Boolean(messages[0] && state.messages.some((message) => message.seqNo < messages[0].seqNo)),
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/session/heartbeat")) {
    const body = await readJson(request);
    json(response, {
      roomId,
      sessionId,
      deviceId: body.deviceId,
      membershipStatus: "PARTICIPATED",
      aggregateVersion: state.aggregateVersion,
      eventCursor: state.eventCursor,
      channelEpoch: 1,
      connectedParticipantCount: 2,
      heartbeatIntervalSeconds: 300,
      onlineThresholdSeconds: 30,
      lastSeenAt: new Date().toISOString(),
      serverTime: new Date().toISOString(),
    });
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/session/messages")) {
    const body = await readJson(request);
    if (body.body === "재시도 메시지" && !state.failedOnce.has(body.clientMessageId)) {
      state.failedOnce.add(body.clientMessageId);
      json(response, { code: "TEMPORARY_FAILURE", message: "잠시 후 다시 시도해 주세요." }, 503);
      return;
    }
    const duplicate = state.dedupe.get(body.clientMessageId);
    if (duplicate) {
      json(response, { ...duplicate, duplicate: true });
      return;
    }

    const message = makeMessage(
      state.messages.length + 1,
      actorFrom(request),
      body.body,
      body.clientMessageId,
      body.replyToMessageId,
    );
    state.messages.push(message);
    state.aggregateVersion += 1;
    state.eventCursor += 1;
    const event = {
      eventId: `96000000-0000-4000-8000-${String(state.eventCursor).padStart(12, "0")}`,
      sessionId,
      eventCursor: state.eventCursor,
      aggregateVersion: state.aggregateVersion,
      channelEpoch: 1,
      occurredAt: message.confirmedAt,
      type: "MESSAGE_APPENDED",
      payload: { message },
    };
    state.events.push(event);
    const result = {
      roomId,
      message,
      aggregateVersion: state.aggregateVersion,
      eventCursor: state.eventCursor,
      channelEpoch: 1,
      duplicate: false,
      serverTime: new Date().toISOString(),
    };
    state.dedupe.set(body.clientMessageId, result);
    json(response, result);
    broadcast("session_event", { id: event.eventId, event });
    return;
  }

  if (request.method === "POST" && url.pathname === "/typing") {
    const body = await readJson(request);
    json(response, { ok: true });
    broadcast("typing", body);
    return;
  }

  json(response, { code: "NOT_FOUND", message: "Not found" }, 404);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`fake session server listening on ${port}\n`);
});

function shutdown() {
  for (const client of clients) client.end();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
