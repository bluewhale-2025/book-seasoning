import { Inject, Injectable } from "@nestjs/common";

import {
  MyRoomsResponseSchema,
  RoomSearchResponseSchema,
  type MyRoomsResponse,
  type RoomDetail,
  type RoomSearchQuery,
  type RoomSearchResponse,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  ROOM_QUERY_GATEWAY,
  type RoomQueryGateway,
} from "./room.gateway.js";
import { rethrowRoomError } from "./room-error.mapper.js";

@Injectable()
export class RoomQueryService {
  public constructor(
    @Inject(ROOM_QUERY_GATEWAY) private readonly gateway: RoomQueryGateway,
  ) {}

  public async search(
    actor: AuthenticatedActor,
    query: RoomSearchQuery,
  ): Promise<RoomSearchResponse> {
    try {
      return RoomSearchResponseSchema.parse({ items: await this.gateway.search(actor, query) });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async getDetail(actor: AuthenticatedActor, roomId: string): Promise<RoomDetail> {
    try {
      return await this.gateway.getDetail(actor, roomId);
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async listMine(actor: AuthenticatedActor): Promise<MyRoomsResponse> {
    try {
      return MyRoomsResponseSchema.parse({ items: await this.gateway.listMine(actor) });
    } catch (error) {
      rethrowRoomError(error);
    }
  }
}
