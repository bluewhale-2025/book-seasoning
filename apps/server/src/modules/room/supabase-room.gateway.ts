import type {
  CreateRoomResponse,
  JoinRoomResponse,
  MyRoomSummary,
  PrepEntry,
  PrepEntryCommandResponse,
  RoomCommandResponse,
  RoomDetail,
  RoomMember,
  RoomSearchQuery,
  RoomSummary,
} from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import {
  createSecretSupabaseClient,
  createUserSupabaseClient,
} from "../../infrastructure/supabase/user-client.js";
import { supabaseRpcErrorCode } from "../../infrastructure/supabase/supabase-error.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  RoomGatewayError,
  type CreateRoomGatewayInput,
  type DeletePrepGatewayInput,
  type JoinRoomGatewayInput,
  type RoomCommandGatewayInput,
  type RoomGateway,
  type RoomJoinChallenge,
  type UpdateRoomGatewayInput,
  type UpsertPrepGatewayInput,
} from "./room.gateway.js";
import {
  mapCreateRoomRow,
  mapJoinRoomRow,
  mapMyRoomSummaryRows,
  mapPrepCommandRow,
  mapPrepEntryRows,
  mapRoomCommandRow,
  mapRoomDetailRow,
  mapRoomJoinChallenge,
  mapRoomMemberRows,
  mapRoomSummaryRows,
  parseRoomDetailRow,
} from "./room-row.mapper.js";

function gatewayError(
  error: Readonly<{ code?: string; message: string }>,
  fallback: string,
): never {
  throw new RoomGatewayError(supabaseRpcErrorCode(error, fallback));
}

export class SupabaseRoomGateway implements RoomGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async create(
    actor: AuthenticatedActor,
    input: CreateRoomGatewayInput,
  ): Promise<CreateRoomResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { payload } = input;
    const { data, error } = await client
      .rpc("create_room", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_title: payload.title,
        p_pack_version_id: payload.packVersionId,
        p_scheduled_start_at: payload.scheduledStartAt,
        p_password_hash: payload.passwordHash,
        p_min_participants: payload.minParticipants,
        p_max_participants: payload.maxParticipants,
      })
      .single();

    if (error !== null) gatewayError(error, "room_create_failed");
    return mapCreateRoomRow(data);
  }

  public async search(
    actor: AuthenticatedActor,
    query: RoomSearchQuery,
  ): Promise<readonly RoomSummary[]> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("search_rooms", {
      p_query: query.query,
      p_limit: query.limit,
    });

    if (error !== null) gatewayError(error, "room_search_failed");
    return mapRoomSummaryRows(data);
  }

  public async getJoinChallenge(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<RoomJoinChallenge> {
    const client = createSecretSupabaseClient(this.environment);
    const { data, error } = await client
      .rpc("get_room_join_challenge", {
        p_actor_user_id: actor.userId,
        p_room_id: roomId,
      })
      .single();
    if (error !== null) gatewayError(error, "room_join_challenge_failed");
    return mapRoomJoinChallenge(data);
  }

  public async recordPasswordFailure(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<void> {
    const client = createSecretSupabaseClient(this.environment);
    const { error } = await client.rpc("record_room_password_failure", {
      p_actor_user_id: actor.userId,
      p_room_id: roomId,
    });
    if (error !== null) gatewayError(error, "room_password_failure_record_failed");
  }

  public async authorizeJoin(
    actor: AuthenticatedActor,
    roomId: string,
    passwordVersion: number,
    tokenHash: string,
  ): Promise<void> {
    const client = createSecretSupabaseClient(this.environment);
    const { error } = await client.rpc("authorize_room_join", {
      p_actor_user_id: actor.userId,
      p_room_id: roomId,
      p_password_version: passwordVersion,
      p_token_hash: tokenHash,
    });
    if (error !== null) gatewayError(error, "room_join_authorization_failed");
  }

  public async join(
    actor: AuthenticatedActor,
    input: JoinRoomGatewayInput,
  ): Promise<JoinRoomResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("join_room", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_authorization_token: input.authorizationToken ?? null,
      })
      .single();
    if (error !== null) gatewayError(error, "room_join_failed");
    return mapJoinRoomRow(data);
  }

  public async getDetail(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<RoomDetail> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("get_room_detail", { p_room_id: roomId })
      .single();
    if (error !== null) gatewayError(error, "room_detail_failed");

    const row = parseRoomDetailRow(data);
    let members: readonly RoomMember[] = [];
    if (row.actor_role !== "NONE") {
      const memberResult = await client.rpc("list_room_members", { p_room_id: roomId });
      if (memberResult.error !== null) {
        gatewayError(memberResult.error, "room_members_failed");
      }
      members = mapRoomMemberRows(memberResult.data);
    }
    return mapRoomDetailRow(row, members);
  }

  public async listMine(actor: AuthenticatedActor): Promise<readonly MyRoomSummary[]> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("list_my_rooms");
    if (error !== null) gatewayError(error, "my_rooms_failed");
    return mapMyRoomSummaryRows(data);
  }

  public async update(
    actor: AuthenticatedActor,
    input: UpdateRoomGatewayInput,
  ): Promise<RoomCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("update_room", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_version: input.expectedVersion,
        p_title: input.payload.title ?? null,
        p_pack_version_id: input.payload.packVersionId ?? null,
        p_scheduled_start_at: input.payload.scheduledStartAt ?? null,
        p_password_hash: input.payload.passwordHash ?? null,
        p_min_participants: input.payload.minParticipants ?? null,
        p_max_participants: input.payload.maxParticipants ?? null,
      })
      .single();
    if (error !== null) gatewayError(error, "room_update_failed");
    return mapRoomCommandRow(data);
  }

  public cancelMembership(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse> {
    return this.executeRoomCommand(actor, "cancel_room_membership", input);
  }

  public cancelRoom(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse> {
    return this.executeRoomCommand(actor, "cancel_room", input);
  }

  public transferHost(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse> {
    return this.executeRoomCommand(actor, "transfer_room_host", input);
  }

  public removeMember(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse> {
    return this.executeRoomCommand(actor, "remove_room_member", input);
  }

  public async listPrep(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<readonly PrepEntry[]> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client.rpc("list_room_prep", { p_room_id: roomId });
    if (error !== null) gatewayError(error, "room_prep_list_failed");
    return mapPrepEntryRows(data);
  }

  public async upsertPrep(
    actor: AuthenticatedActor,
    input: UpsertPrepGatewayInput,
  ): Promise<PrepEntryCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { payload } = input;
    const { data, error } = await client
      .rpc("upsert_room_prep", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_entry_id: payload.entryId,
        p_expected_revision: payload.expectedRevision ?? null,
        p_prompt_type: payload.promptType,
        p_visibility: payload.visibility,
        p_body: payload.body,
      })
      .single();
    if (error !== null) gatewayError(error, "room_prep_upsert_failed");
    return mapPrepCommandRow(data);
  }

  public async deletePrep(
    actor: AuthenticatedActor,
    input: DeletePrepGatewayInput,
  ): Promise<PrepEntryCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("delete_room_prep", {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_entry_id: input.payload.entryId,
        p_expected_revision: input.payload.expectedRevision,
      })
      .single();
    if (error !== null) gatewayError(error, "room_prep_delete_failed");
    return mapPrepCommandRow(data);
  }

  private async executeRoomCommand(
    actor: AuthenticatedActor,
    functionName:
      | "cancel_room_membership"
      | "cancel_room"
      | "transfer_room_host"
      | "remove_room_member",
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc(functionName, {
        p_command_id: input.commandId,
        p_request_fingerprint: input.requestFingerprint,
        p_room_id: input.roomId,
        p_expected_version: input.expectedVersion,
        ...(input.targetUserId === undefined
          ? {}
          : { p_target_user_id: input.targetUserId }),
      })
      .single();
    if (error !== null) gatewayError(error, `${functionName}_failed`);
    return mapRoomCommandRow(data);
  }
}
