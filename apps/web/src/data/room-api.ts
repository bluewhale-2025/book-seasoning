import {
  CancelMembershipRequestSchema,
  CancelRoomRequestSchema,
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  DeletePrepEntryRequestSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  MyRoomsResponseSchema,
  PrepEntriesResponseSchema,
  PrepEntryCommandResponseSchema,
  RemoveRoomMemberRequestSchema,
  RoomCommandResponseSchema,
  RoomDetailSchema,
  RoomSearchQuerySchema,
  RoomSearchResponseSchema,
  TransferHostRequestSchema,
  UpdateRoomRequestSchema,
  UpsertPrepEntryRequestSchema,
  type CancelMembershipRequest,
  type CancelRoomRequest,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type DeletePrepEntryRequest,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type MyRoomsResponse,
  type PrepEntriesResponse,
  type PrepEntryCommandResponse,
  type RemoveRoomMemberRequest,
  type RoomCommandResponse,
  type RoomDetail,
  type RoomSearchQuery,
  type RoomSearchResponse,
  type TransferHostRequest,
  type UpdateRoomRequest,
  type UpsertPrepEntryRequest,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedHttpClient } from "./http-client";

export type RoomApi = Readonly<{
  searchRooms(query: RoomSearchQuery): Promise<RoomSearchResponse>;
  getMyRooms(): Promise<MyRoomsResponse>;
  getRoom(roomId: string): Promise<RoomDetail>;
  createRoom(request: CreateRoomRequest): Promise<CreateRoomResponse>;
  joinRoom(roomId: string, request: JoinRoomRequest): Promise<JoinRoomResponse>;
  updateRoom(roomId: string, request: UpdateRoomRequest): Promise<RoomCommandResponse>;
  cancelMembership(
    roomId: string,
    request: CancelMembershipRequest,
  ): Promise<RoomCommandResponse>;
  cancelRoom(roomId: string, request: CancelRoomRequest): Promise<RoomCommandResponse>;
  transferHost(roomId: string, request: TransferHostRequest): Promise<RoomCommandResponse>;
  removeMember(roomId: string, request: RemoveRoomMemberRequest): Promise<RoomCommandResponse>;
  getPrepEntries(roomId: string): Promise<PrepEntriesResponse>;
  upsertPrepEntry(
    roomId: string,
    request: UpsertPrepEntryRequest,
  ): Promise<PrepEntryCommandResponse>;
  deletePrepEntry(
    roomId: string,
    request: DeletePrepEntryRequest,
  ): Promise<PrepEntryCommandResponse>;
}>;

export class HttpRoomApi implements RoomApi {
  public constructor(private readonly http: AuthenticatedHttpClient) {}

  public searchRooms(query: RoomSearchQuery): Promise<RoomSearchResponse> {
    const parsed = RoomSearchQuerySchema.parse(query);
    const parameters = new URLSearchParams({
      query: parsed.query,
      limit: String(parsed.limit),
    });
    return this.http.request(
      `/v1/rooms?${parameters.toString()}`,
      { method: "GET" },
      RoomSearchResponseSchema,
    );
  }

  public getMyRooms(): Promise<MyRoomsResponse> {
    return this.http.request("/v1/rooms/mine", { method: "GET" }, MyRoomsResponseSchema);
  }

  public getRoom(roomId: string): Promise<RoomDetail> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}`,
      { method: "GET" },
      RoomDetailSchema,
    );
  }

  public createRoom(request: CreateRoomRequest): Promise<CreateRoomResponse> {
    return this.http.request(
      "/v1/rooms",
      { method: "POST", body: JSON.stringify(CreateRoomRequestSchema.parse(request)) },
      CreateRoomResponseSchema,
    );
  }

  public joinRoom(roomId: string, request: JoinRoomRequest): Promise<JoinRoomResponse> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/join`,
      { method: "POST", body: JSON.stringify(JoinRoomRequestSchema.parse(request)) },
      JoinRoomResponseSchema,
    );
  }

  public updateRoom(
    roomId: string,
    request: UpdateRoomRequest,
  ): Promise<RoomCommandResponse> {
    return this.roomCommand(roomId, "", "PATCH", UpdateRoomRequestSchema.parse(request));
  }

  public cancelMembership(
    roomId: string,
    request: CancelMembershipRequest,
  ): Promise<RoomCommandResponse> {
    return this.roomCommand(
      roomId,
      "/membership/cancel",
      "POST",
      CancelMembershipRequestSchema.parse(request),
    );
  }

  public cancelRoom(
    roomId: string,
    request: CancelRoomRequest,
  ): Promise<RoomCommandResponse> {
    return this.roomCommand(
      roomId,
      "/cancel",
      "POST",
      CancelRoomRequestSchema.parse(request),
    );
  }

  public transferHost(
    roomId: string,
    request: TransferHostRequest,
  ): Promise<RoomCommandResponse> {
    return this.roomCommand(
      roomId,
      "/host/transfer",
      "POST",
      TransferHostRequestSchema.parse(request),
    );
  }

  public removeMember(
    roomId: string,
    request: RemoveRoomMemberRequest,
  ): Promise<RoomCommandResponse> {
    return this.roomCommand(
      roomId,
      "/members/remove",
      "POST",
      RemoveRoomMemberRequestSchema.parse(request),
    );
  }

  public getPrepEntries(roomId: string): Promise<PrepEntriesResponse> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/prep`,
      { method: "GET" },
      PrepEntriesResponseSchema,
    );
  }

  public upsertPrepEntry(
    roomId: string,
    request: UpsertPrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/prep`,
      { method: "PUT", body: JSON.stringify(UpsertPrepEntryRequestSchema.parse(request)) },
      PrepEntryCommandResponseSchema,
    );
  }

  public deletePrepEntry(
    roomId: string,
    request: DeletePrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}/prep`,
      { method: "DELETE", body: JSON.stringify(DeletePrepEntryRequestSchema.parse(request)) },
      PrepEntryCommandResponseSchema,
    );
  }

  private roomCommand(
    roomId: string,
    suffix: string,
    method: "PATCH" | "POST",
    request: unknown,
  ): Promise<RoomCommandResponse> {
    return this.http.request(
      `/v1/rooms/${encodeURIComponent(roomId)}${suffix}`,
      { method, body: JSON.stringify(request) },
      RoomCommandResponseSchema,
    );
  }
}
