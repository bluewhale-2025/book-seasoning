import type {
  CreateRoomRequest,
  CreateRoomResponse,
  DeletePrepEntryRequest,
  JoinRoomResponse,
  MyRoomSummary,
  PrepEntry,
  PrepEntryCommandResponse,
  RoomCommandResponse,
  RoomDetail,
  RoomSearchQuery,
  RoomSummary,
  UpdateRoomRequest,
  UpsertPrepEntryRequest,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export type CreateRoomGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  payload: Omit<CreateRoomRequest["payload"], "password"> & {
    passwordHash: string;
  };
}>;

export type RoomJoinChallenge = Readonly<
  | { state: "ALREADY_MEMBER"; passwordVersion: number }
  | { state: "PASSWORD_REQUIRED"; passwordHash: string; passwordVersion: number }
>;

export type JoinRoomGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  authorizationToken?: string;
}>;

export type UpdateRoomGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  expectedVersion: number;
  payload: Omit<UpdateRoomRequest["payload"], "password"> & {
    passwordHash?: string;
  };
}>;

export type RoomCommandGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  expectedVersion: number;
  targetUserId?: string;
}>;

export type UpsertPrepGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  payload: UpsertPrepEntryRequest["payload"];
}>;

export type DeletePrepGatewayInput = Readonly<{
  commandId: string;
  requestFingerprint: string;
  roomId: string;
  payload: DeletePrepEntryRequest["payload"];
}>;

export class RoomGatewayError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "RoomGatewayError";
  }
}

export interface RoomQueryGateway {
  search(
    actor: AuthenticatedActor,
    query: RoomSearchQuery,
  ): Promise<readonly RoomSummary[]>;
  getDetail(actor: AuthenticatedActor, roomId: string): Promise<RoomDetail>;
  listMine(actor: AuthenticatedActor): Promise<readonly MyRoomSummary[]>;
}

export interface RoomMembershipGateway {
  getJoinChallenge(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<RoomJoinChallenge>;
  recordPasswordFailure(actor: AuthenticatedActor, roomId: string): Promise<void>;
  authorizeJoin(
    actor: AuthenticatedActor,
    roomId: string,
    passwordVersion: number,
    tokenHash: string,
  ): Promise<void>;
  join(actor: AuthenticatedActor, input: JoinRoomGatewayInput): Promise<JoinRoomResponse>;
  cancelMembership(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse>;
}

export interface RoomAdministrationGateway {
  create(
    actor: AuthenticatedActor,
    input: CreateRoomGatewayInput,
  ): Promise<CreateRoomResponse>;
  update(
    actor: AuthenticatedActor,
    input: UpdateRoomGatewayInput,
  ): Promise<RoomCommandResponse>;
  cancelRoom(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse>;
  transferHost(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse>;
  removeMember(
    actor: AuthenticatedActor,
    input: RoomCommandGatewayInput,
  ): Promise<RoomCommandResponse>;
}

export interface RoomPrepGateway {
  listPrep(actor: AuthenticatedActor, roomId: string): Promise<readonly PrepEntry[]>;
  upsertPrep(
    actor: AuthenticatedActor,
    input: UpsertPrepGatewayInput,
  ): Promise<PrepEntryCommandResponse>;
  deletePrep(
    actor: AuthenticatedActor,
    input: DeletePrepGatewayInput,
  ): Promise<PrepEntryCommandResponse>;
}

export interface RoomGateway
  extends RoomQueryGateway,
    RoomMembershipGateway,
    RoomAdministrationGateway,
    RoomPrepGateway {}

export const ROOM_QUERY_GATEWAY = Symbol("ROOM_QUERY_GATEWAY");
export const ROOM_MEMBERSHIP_GATEWAY = Symbol("ROOM_MEMBERSHIP_GATEWAY");
export const ROOM_ADMINISTRATION_GATEWAY = Symbol("ROOM_ADMINISTRATION_GATEWAY");
export const ROOM_PREP_GATEWAY = Symbol("ROOM_PREP_GATEWAY");
