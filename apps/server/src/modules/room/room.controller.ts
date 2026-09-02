import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";

import {
  CreateRoomRequestSchema,
  CreateRoomResponseSchema,
  JoinRoomRequestSchema,
  JoinRoomResponseSchema,
  CancelMembershipRequestSchema,
  CancelRoomRequestSchema,
  DeletePrepEntryRequestSchema,
  MyRoomsResponseSchema,
  PrepEntriesResponseSchema,
  PrepEntryCommandResponseSchema,
  RemoveRoomMemberRequestSchema,
  RoomCommandResponseSchema,
  RoomDetailSchema,
  TransferHostRequestSchema,
  UpdateRoomRequestSchema,
  UpsertPrepEntryRequestSchema,
  RoomSearchQuerySchema,
  RoomSearchResponseSchema,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type CancelMembershipRequest,
  type CancelRoomRequest,
  type DeletePrepEntryRequest,
  type MyRoomsResponse,
  type PrepEntriesResponse,
  type PrepEntryCommandResponse,
  type RemoveRoomMemberRequest,
  type RoomCommandResponse,
  type RoomDetail,
  type TransferHostRequest,
  type UpdateRoomRequest,
  type UpsertPrepEntryRequest,
  type RoomSearchQuery,
  type RoomSearchResponse,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { RoomAdministrationService } from "./room-administration.service.js";
import { RoomMembershipService } from "./room-membership.service.js";
import { RoomPrepService } from "./room-prep.service.js";
import { RoomQueryService } from "./room-query.service.js";

@Controller("v1/rooms")
export class RoomController {
  public constructor(
    @Inject(RoomQueryService) private readonly queryService: RoomQueryService,
    @Inject(RoomMembershipService)
    private readonly membershipService: RoomMembershipService,
    @Inject(RoomAdministrationService)
    private readonly administrationService: RoomAdministrationService,
    @Inject(RoomPrepService) private readonly prepService: RoomPrepService,
  ) {}

  @Post()
  public async create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(CreateRoomRequestSchema)) request: CreateRoomRequest,
  ): Promise<CreateRoomResponse> {
    const response = CreateRoomResponseSchema.parse(
      await this.administrationService.create(actor, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post(":roomId/join")
  public async join(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(JoinRoomRequestSchema)) request: JoinRoomRequest,
  ): Promise<JoinRoomResponse> {
    const response = JoinRoomResponseSchema.parse(
      await this.membershipService.join(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get("mine")
  public async listMine(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<MyRoomsResponse> {
    const response = MyRoomsResponseSchema.parse(await this.queryService.listMine(actor));
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get(":roomId")
  public async getDetail(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
  ): Promise<RoomDetail> {
    const response = RoomDetailSchema.parse(await this.queryService.getDetail(actor, roomId));
    assertPublicPayloadKeys(response);
    return response;
  }

  @Patch(":roomId")
  public async update(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(UpdateRoomRequestSchema)) request: UpdateRoomRequest,
  ): Promise<RoomCommandResponse> {
    const response = RoomCommandResponseSchema.parse(
      await this.administrationService.update(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post(":roomId/membership/cancel")
  public async cancelMembership(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(CancelMembershipRequestSchema))
    request: CancelMembershipRequest,
  ): Promise<RoomCommandResponse> {
    const response = RoomCommandResponseSchema.parse(
      await this.membershipService.cancelMembership(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post(":roomId/cancel")
  public async cancelRoom(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(CancelRoomRequestSchema)) request: CancelRoomRequest,
  ): Promise<RoomCommandResponse> {
    const response = RoomCommandResponseSchema.parse(
      await this.administrationService.cancelRoom(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post(":roomId/host/transfer")
  public async transferHost(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(TransferHostRequestSchema)) request: TransferHostRequest,
  ): Promise<RoomCommandResponse> {
    const response = RoomCommandResponseSchema.parse(
      await this.administrationService.transferHost(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post(":roomId/members/remove")
  public async removeMember(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(RemoveRoomMemberRequestSchema))
    request: RemoveRoomMemberRequest,
  ): Promise<RoomCommandResponse> {
    const response = RoomCommandResponseSchema.parse(
      await this.administrationService.removeMember(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get(":roomId/prep")
  public async listPrep(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
  ): Promise<PrepEntriesResponse> {
    const response = PrepEntriesResponseSchema.parse(
      await this.prepService.listPrep(actor, roomId),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Put(":roomId/prep")
  public async upsertPrep(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(UpsertPrepEntryRequestSchema))
    request: UpsertPrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    const response = PrepEntryCommandResponseSchema.parse(
      await this.prepService.upsertPrep(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Delete(":roomId/prep")
  public async deletePrep(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(DeletePrepEntryRequestSchema))
    request: DeletePrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    const response = PrepEntryCommandResponseSchema.parse(
      await this.prepService.deletePrep(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get()
  public async search(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(new ZodValidationPipe(RoomSearchQuerySchema)) query: RoomSearchQuery,
  ): Promise<RoomSearchResponse> {
    const response = RoomSearchResponseSchema.parse(
      await this.queryService.search(actor, query),
    );
    assertPublicPayloadKeys(response);
    return response;
  }
}
