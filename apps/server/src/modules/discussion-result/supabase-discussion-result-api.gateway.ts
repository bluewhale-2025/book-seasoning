import { z } from "zod";

import {
  ClosingResponseCommandResponseSchema,
  GetDiscussionResultResponseSchema,
  RetryDiscussionResultResponseSchema,
  SessionClosingStateSchema,
  type ClosingResponseCommandResponse,
  type GetDiscussionResultResponse,
  type RetryDiscussionResultResponse,
} from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { supabaseRpcErrorCode } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  DiscussionResultGatewayError,
  type DiscussionResultApiGateway,
} from "./discussion-result-api.gateway.js";

const ClosingRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  closing: z.unknown(),
  aggregate_version: z.number().int().positive(),
  event_cursor: z.number().int().positive(),
  duplicate: z.boolean(),
  officially_ended: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const ResultRowSchema = z.strictObject({ result: z.unknown() });

const ResultTimestampKeys = new Set(["readyAt", "serverTime", "updatedAt"]);

function normalizeResultTimestamps(value: unknown, key?: string): unknown {
  if (typeof value === "string" && key && ResultTimestampKeys.has(key)) {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeResultTimestamps(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeResultTimestamps(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

const RetryRowSchema = z.strictObject({
  room_id: z.uuid(),
  session_id: z.uuid(),
  job_id: z.uuid(),
  status: z.enum(["PENDING", "PROCESSING", "RETRYING"]),
  duplicate: z.boolean(),
  server_time: z.iso.datetime({ offset: true }),
});

const fail = (
  error: Readonly<{ code?: string; message: string }>,
  fallback: string,
): never => {
  throw new DiscussionResultGatewayError(supabaseRpcErrorCode(error, fallback));
};

export class SupabaseDiscussionResultApiGateway
  implements DiscussionResultApiGateway
{
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async upsertClosing(
    actor: AuthenticatedActor,
    input: Parameters<DiscussionResultApiGateway["upsertClosing"]>[1],
  ): Promise<ClosingResponseCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("upsert_session_closing_response", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_phase_version: input.expectedPhaseVersion,
        p_expected_revision: input.expectedRevision,
        p_status: input.status,
        p_body: input.body,
      })
      .single();
    if (error !== null) fail(error, "closing_response_failed");
    return this.mapClosing(data);
  }

  public async deleteClosing(
    actor: AuthenticatedActor,
    input: Parameters<DiscussionResultApiGateway["deleteClosing"]>[1],
  ): Promise<ClosingResponseCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("delete_session_closing_response", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_phase_version: input.expectedPhaseVersion,
        p_expected_revision: input.expectedRevision,
      })
      .single();
    if (error !== null) fail(error, "closing_response_delete_failed");
    return this.mapClosing(data);
  }

  public async getResult(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<GetDiscussionResultResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("get_discussion_result", { p_room_id: roomId })
      .single();
    if (error !== null) fail(error, "discussion_result_failed");
    const row = ResultRowSchema.parse(data);
    return GetDiscussionResultResponseSchema.parse(
      normalizeResultTimestamps(row.result),
    );
  }

  public async retryResult(
    actor: AuthenticatedActor,
    input: Parameters<DiscussionResultApiGateway["retryResult"]>[1],
  ): Promise<RetryDiscussionResultResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("retry_discussion_result", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
      })
      .single();
    if (error !== null) fail(error, "discussion_result_retry_failed");
    const row = RetryRowSchema.parse(data);
    return RetryDiscussionResultResponseSchema.parse({
      roomId: row.room_id,
      sessionId: row.session_id,
      jobId: row.job_id,
      status: row.status,
      duplicate: row.duplicate,
      serverTime: new Date(row.server_time).toISOString(),
    });
  }

  private mapClosing(value: unknown): ClosingResponseCommandResponse {
    const row = ClosingRowSchema.parse(value);
    return ClosingResponseCommandResponseSchema.parse({
      roomId: row.room_id,
      sessionId: row.session_id,
      closing: SessionClosingStateSchema.parse(
        normalizeResultTimestamps(row.closing),
      ),
      aggregateVersion: row.aggregate_version,
      eventCursor: row.event_cursor,
      duplicate: row.duplicate,
      officiallyEnded: row.officially_ended,
      serverTime: new Date(row.server_time).toISOString(),
    });
  }
}
