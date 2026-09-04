import { z } from "zod";

import {
  EndSessionResponseSchema,
  ExtendSessionResponseSchema,
  SendSessionMessageResponseSchema,
  RequestSessionAiHelpResponseSchema,
  SessionHeartbeatResponseSchema,
  SessionMessagePageSchema,
  SessionSnapshotSchema,
  StartSessionResponseSchema,
  StartSynthesisResponseSchema,
  type EndSessionResponse,
  type ExtendSessionResponse,
  type SendSessionMessageResponse,
  type RequestSessionAiHelpResponse,
  type SessionHeartbeatResponse,
  type SessionMessagePage,
  type SessionSnapshot,
  type StartSessionResponse,
  type StartSynthesisResponse,
} from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { supabaseRpcErrorCode } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  SessionGatewayError,
  type AppendSessionMessageGatewayInput,
  type SessionGateway,
  type SessionHeartbeatGatewayInput,
  type SessionMessagePageGatewayInput,
  type SessionSyncGatewayInput,
  type SessionControlGatewayInput,
  type RequestSessionAiHelpGatewayInput,
  type StartSessionGatewayInput,
} from "./session.gateway.js";

const AppendSessionMessageRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  message_id: z.uuid(),
  seq_no: z.number().int().positive(),
  kind: z.literal("PARTICIPANT"),
  author_user_id: z.uuid(),
  author_profile_name: z.string().min(1),
  client_message_id: z.uuid(),
  body: z.string().min(1).max(2000),
  reply_to_message_id: z.uuid().nullable(),
  reply_author_profile_name: z.string().min(1).nullable(),
  reply_quote: z.string().min(1).max(2000).nullable(),
  confirmed_at: z.iso.datetime({ offset: true }),
  aggregate_version: z.number().int().positive(),
  event_cursor: z.number().int().positive(),
  channel_epoch: z.number().int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const SessionSyncRowSchema = z.strictObject({ snapshot: z.unknown() });
const SessionMessagePageRowSchema = z.strictObject({ page: z.unknown() });

const SessionSnapshotTimestampKeys = new Set([
  "serverTime",
  "scheduledStartAt",
  "startedAt",
  "endedAt",
  "discussionEndsAt",
  "extensionPromptedAt",
  "extensionDecisionDeadlineAt",
  "closingStartedAt",
  "closingEndsAt",
  "confirmedAt",
  "occurredAt",
  "retryAvailableAt",
  "updatedAt",
]);

function normalizeSessionSnapshotTimestamps(value: unknown, key?: string): unknown {
  if (typeof value === "string" && key && SessionSnapshotTimestampKeys.has(key)) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeSessionSnapshotTimestamps(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeSessionSnapshotTimestamps(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

const SessionHeartbeatRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  device_id: z.uuid(),
  membership_status: z.enum(["REGISTERED", "PARTICIPATED"]),
  aggregate_version: z.number().int().nonnegative(),
  event_cursor: z.number().int().nonnegative(),
  channel_epoch: z.number().int().positive(),
  connected_participant_count: z.number().int().nonnegative(),
  heartbeat_interval_seconds: z.number().int().min(5).max(300),
  online_threshold_seconds: z.number().int().min(5).max(300),
  last_seen_at: z.iso.datetime({ offset: true }),
  server_time: z.iso.datetime({ offset: true }),
});

const RequestSessionAiHelpRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  request_id: z.uuid(),
  job_id: z.uuid(),
  request_status: z.enum([
    "QUEUED",
    "PROCESSING",
    "RETRYING",
    "SUCCEEDED",
    "FAILED",
  ]),
  retry_available_at: z.iso.datetime({ offset: true }),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const StartSessionRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  phase: z.literal("OPENING"),
  phase_version: z.number().int().positive(),
  aggregate_version: z.number().int().positive(),
  channel_epoch: z.number().int().positive(),
  event_cursor: z.number().int().positive(),
  connected_participant_count: z.number().int().min(2).max(15),
  min_participants: z.number().int().min(2).max(15),
  started_at: z.iso.datetime({ offset: true }),
  discussion_ends_at: z.iso.datetime({ offset: true }),
  extension_decision_deadline_at: z.iso.datetime({ offset: true }),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const SessionControlStateRowSchema = z.strictObject({
  phase: z.enum(["OPENING", "CORE", "EXTENDED", "SYNTHESIS", "CLOSING", "ENDED"]),
  phaseVersion: z.number().int().positive(),
  aggregateVersion: z.number().int().positive(),
  channelEpoch: z.number().int().positive(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  extensionCount: z.number().int().nonnegative(),
  deadlines: z.strictObject({
    discussionEndsAt: z.iso.datetime({ offset: true }).nullable(),
    extensionPromptedAt: z.iso.datetime({ offset: true }).nullable(),
    extensionDecisionDeadlineAt: z.iso.datetime({ offset: true }).nullable(),
    closingStartedAt: z.iso.datetime({ offset: true }).nullable(),
    closingEndsAt: z.iso.datetime({ offset: true }).nullable(),
  }),
});

const SessionControlRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  state: SessionControlStateRowSchema,
  event_cursor: z.number().int().positive(),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

function gatewayError(
  error: Readonly<{ code?: string; message: string }>,
  fallback: string,
): never {
  throw new SessionGatewayError(supabaseRpcErrorCode(error, fallback));
}

export function mapSessionHeartbeatRow(value: unknown): SessionHeartbeatResponse {
  const row = SessionHeartbeatRowSchema.parse(value);
  return SessionHeartbeatResponseSchema.parse({
    roomId: row.room_id,
    sessionId: row.session_id,
    deviceId: row.device_id,
    membershipStatus: row.membership_status,
    aggregateVersion: row.aggregate_version,
    eventCursor: row.event_cursor,
    channelEpoch: row.channel_epoch,
    connectedParticipantCount: row.connected_participant_count,
    heartbeatIntervalSeconds: row.heartbeat_interval_seconds,
    onlineThresholdSeconds: row.online_threshold_seconds,
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    serverTime: new Date(row.server_time).toISOString(),
  });
}

export function mapRequestSessionAiHelpRow(
  value: unknown,
): RequestSessionAiHelpResponse {
  const row = RequestSessionAiHelpRowSchema.parse(value);
  return RequestSessionAiHelpResponseSchema.parse({
    roomId: row.room_id,
    sessionId: row.session_id,
    requestId: row.request_id,
    jobId: row.job_id,
    status: row.request_status,
    retryAvailableAt: new Date(row.retry_available_at).toISOString(),
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}

export function mapSessionSyncRow(value: unknown): SessionSnapshot {
  const row = SessionSyncRowSchema.parse(value);
  return SessionSnapshotSchema.parse(normalizeSessionSnapshotTimestamps(row.snapshot));
}

export function mapSessionMessagePageRow(value: unknown): SessionMessagePage {
  const row = SessionMessagePageRowSchema.parse(value);
  return SessionMessagePageSchema.parse(row.page);
}

export function mapAppendSessionMessageRow(
  value: unknown,
): SendSessionMessageResponse {
  const row = AppendSessionMessageRowSchema.parse(value);
  const hasReply = row.reply_to_message_id !== null;
  if (
    hasReply !== (row.reply_author_profile_name !== null) ||
    hasReply !== (row.reply_quote !== null)
  ) {
    throw new SessionGatewayError("message_reply_snapshot_invalid");
  }

  return SendSessionMessageResponseSchema.parse({
    roomId: row.room_id,
    message: {
      messageId: row.message_id,
      sessionId: row.session_id,
      seqNo: row.seq_no,
      kind: row.kind,
      author: {
        userId: row.author_user_id,
        profileName: row.author_profile_name,
      },
      clientMessageId: row.client_message_id,
      body: row.body,
      reply: hasReply
        ? {
            messageId: row.reply_to_message_id,
            authorProfileName: row.reply_author_profile_name,
            quote: row.reply_quote,
          }
        : null,
      confirmedAt: new Date(row.confirmed_at).toISOString(),
    },
    aggregateVersion: row.aggregate_version,
    eventCursor: row.event_cursor,
    channelEpoch: row.channel_epoch,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}

export function mapStartSessionRow(value: unknown): StartSessionResponse {
  const row = StartSessionRowSchema.parse(value);
  return StartSessionResponseSchema.parse({
    roomId: row.room_id,
    sessionId: row.session_id,
    state: {
      phase: row.phase,
      phaseVersion: row.phase_version,
      aggregateVersion: row.aggregate_version,
      channelEpoch: row.channel_epoch,
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: null,
      extensionCount: 0,
      deadlines: {
        discussionEndsAt: new Date(row.discussion_ends_at).toISOString(),
        extensionPromptedAt: null,
        extensionDecisionDeadlineAt: new Date(
          row.extension_decision_deadline_at,
        ).toISOString(),
        closingStartedAt: null,
        closingEndsAt: null,
      },
    },
    eventCursor: row.event_cursor,
    connectedParticipantCount: row.connected_participant_count,
    minParticipants: row.min_participants,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  });
}

function mapSessionControlRow(value: unknown) {
  const row = SessionControlRowSchema.parse(value);
  const timestamp = (candidate: string | null) =>
    candidate === null ? null : new Date(candidate).toISOString();
  return {
    roomId: row.room_id,
    sessionId: row.session_id,
    state: {
      ...row.state,
      startedAt: timestamp(row.state.startedAt),
      endedAt: timestamp(row.state.endedAt),
      deadlines: {
        discussionEndsAt: timestamp(row.state.deadlines.discussionEndsAt),
        extensionPromptedAt: timestamp(row.state.deadlines.extensionPromptedAt),
        extensionDecisionDeadlineAt: timestamp(
          row.state.deadlines.extensionDecisionDeadlineAt,
        ),
        closingStartedAt: timestamp(row.state.deadlines.closingStartedAt),
        closingEndsAt: timestamp(row.state.deadlines.closingEndsAt),
      },
    },
    eventCursor: row.event_cursor,
    duplicate: row.duplicate,
    serverTime: new Date(row.server_time).toISOString(),
  };
}

export function mapExtendSessionRow(value: unknown): ExtendSessionResponse {
  return ExtendSessionResponseSchema.parse(mapSessionControlRow(value));
}

export function mapStartSynthesisRow(value: unknown): StartSynthesisResponse {
  return StartSynthesisResponseSchema.parse(mapSessionControlRow(value));
}

export function mapEndSessionRow(value: unknown): EndSessionResponse {
  return EndSessionResponseSchema.parse(mapSessionControlRow(value));
}

export class SupabaseSessionGateway implements SessionGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async sync(
    actor: AuthenticatedActor,
    input: SessionSyncGatewayInput,
  ): Promise<SessionSnapshot> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("get_session_sync_with_results", {
        p_room_id: input.roomId,
        p_after_event_cursor: input.afterEventCursor,
        p_after_message_seq: input.afterMessageSeq,
        p_message_limit: input.messageLimit,
      })
      .single();
    if (error !== null) {
      gatewayError(error, "session_sync_failed");
    }
    return mapSessionSyncRow(data);
  }


  public async requestAiHelp(
    actor: AuthenticatedActor,
    input: RequestSessionAiHelpGatewayInput,
  ): Promise<RequestSessionAiHelpResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("request_session_ai_help", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_phase_version: input.expectedPhaseVersion,
        p_reason: input.reason,
      })
      .single();
    if (error !== null) gatewayError(error, "session_ai_help_request_failed");
    return mapRequestSessionAiHelpRow(data);
  }

  public async getMessagePage(
    actor: AuthenticatedActor,
    input: SessionMessagePageGatewayInput,
  ): Promise<SessionMessagePage> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("get_session_message_page", {
        p_room_id: input.roomId,
        p_before_seq: input.beforeSeq ?? null,
        p_limit: input.limit,
      })
      .single();
    if (error !== null) {
      gatewayError(error, "session_message_page_failed");
    }
    return mapSessionMessagePageRow(data);
  }

  public async appendMessage(
    actor: AuthenticatedActor,
    input: AppendSessionMessageGatewayInput,
  ): Promise<SendSessionMessageResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("append_session_message", {
        p_room_id: input.roomId,
        p_client_message_id: input.clientMessageId,
        p_body: input.body,
        p_reply_to_message_id: input.replyToMessageId,
      })
      .single();
    if (error !== null) {
      gatewayError(error, "session_message_append_failed");
    }
    return mapAppendSessionMessageRow(data);
  }

  public async heartbeat(
    actor: AuthenticatedActor,
    input: SessionHeartbeatGatewayInput,
  ): Promise<SessionHeartbeatResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("heartbeat_session", {
        p_room_id: input.roomId,
        p_device_id: input.deviceId,
      })
      .single();
    if (error !== null) {
      gatewayError(error, "session_heartbeat_failed");
    }
    return mapSessionHeartbeatRow(data);
  }

  public async start(
    actor: AuthenticatedActor,
    input: StartSessionGatewayInput,
  ): Promise<StartSessionResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("start_session", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_phase_version: input.expectedPhaseVersion,
      })
      .single();
    if (error !== null) {
      gatewayError(error, "session_start_failed");
    }
    return mapStartSessionRow(data);
  }

  public async extend(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<ExtendSessionResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("extend_session", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_room_id: input.roomId,
      p_expected_phase_version: input.expectedPhaseVersion,
    }).single();
    if (error !== null) gatewayError(error, "session_extension_failed");
    return mapExtendSessionRow(data);
  }

  public async startSynthesis(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<StartSynthesisResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("start_session_synthesis", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_room_id: input.roomId,
      p_expected_phase_version: input.expectedPhaseVersion,
    }).single();
    if (error !== null) gatewayError(error, "session_synthesis_failed");
    return mapStartSynthesisRow(data);
  }

  public async end(
    actor: AuthenticatedActor,
    input: SessionControlGatewayInput,
  ): Promise<EndSessionResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("end_session", {
      p_command_id: input.commandId,
      p_request_fingerprint: input.requestFingerprint,
      p_room_id: input.roomId,
      p_expected_phase_version: input.expectedPhaseVersion,
    }).single();
    if (error !== null) gatewayError(error, "session_end_failed");
    return mapEndSessionRow(data);
  }
}
