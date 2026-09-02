import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from "@nestjs/common";

import {
  EndSessionRequestSchema,
  EndSessionResponseSchema,
  ExtendSessionRequestSchema,
  ExtendSessionResponseSchema,
  SendSessionMessageRequestSchema,
  SendSessionMessageResponseSchema,
  RequestSessionAiHelpRequestSchema,
  RequestSessionAiHelpResponseSchema,
  SessionHeartbeatRequestSchema,
  SessionHeartbeatResponseSchema,
  SessionMessagePageQuerySchema,
  SessionMessagePageSchema,
  SessionSnapshotSchema,
  SessionSyncQuerySchema,
  StartSessionRequestSchema,
  StartSessionResponseSchema,
  StartSynthesisRequestSchema,
  StartSynthesisResponseSchema,
  type EndSessionRequest,
  type EndSessionResponse,
  type ExtendSessionRequest,
  type ExtendSessionResponse,
  type SendSessionMessageRequest,
  type SendSessionMessageResponse,
  type RequestSessionAiHelpRequest,
  type RequestSessionAiHelpResponse,
  type SessionHeartbeatRequest,
  type SessionHeartbeatResponse,
  type SessionMessagePage,
  type SessionMessagePageQuery,
  type SessionSnapshot,
  type SessionSyncQuery,
  type StartSessionRequest,
  type StartSessionResponse,
  type StartSynthesisRequest,
  type StartSynthesisResponse,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import { SessionService } from "./session.service.js";

@Controller("v1/rooms/:roomId/session")
export class SessionController {
  public constructor(@Inject(SessionService) private readonly service: SessionService) {}

  @Get("sync")
  public async sync(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Query(new ZodValidationPipe(SessionSyncQuerySchema)) query: SessionSyncQuery,
  ): Promise<SessionSnapshot> {
    const response = SessionSnapshotSchema.parse(
      await this.service.sync(actor, roomId, query),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get("messages")
  public async getMessagePage(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Query(new ZodValidationPipe(SessionMessagePageQuerySchema))
    query: SessionMessagePageQuery,
  ): Promise<SessionMessagePage> {
    const response = SessionMessagePageSchema.parse(
      await this.service.getMessagePage(actor, roomId, query),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("messages")
  public async sendMessage(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(SendSessionMessageRequestSchema))
    request: SendSessionMessageRequest,
  ): Promise<SendSessionMessageResponse> {
    const response = SendSessionMessageResponseSchema.parse(
      await this.service.sendMessage(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("heartbeat")
  public async heartbeat(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(SessionHeartbeatRequestSchema))
    request: SessionHeartbeatRequest,
  ): Promise<SessionHeartbeatResponse> {
    const response = SessionHeartbeatResponseSchema.parse(
      await this.service.heartbeat(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("ai-help")
  public async requestAiHelp(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(RequestSessionAiHelpRequestSchema))
    request: RequestSessionAiHelpRequest,
  ): Promise<RequestSessionAiHelpResponse> {
    const response = RequestSessionAiHelpResponseSchema.parse(
      await this.service.requestAiHelp(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("start")
  public async start(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(StartSessionRequestSchema))
    request: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    const response = StartSessionResponseSchema.parse(
      await this.service.start(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("extend")
  public async extend(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(ExtendSessionRequestSchema))
    request: ExtendSessionRequest,
  ): Promise<ExtendSessionResponse> {
    const response = ExtendSessionResponseSchema.parse(
      await this.service.extend(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("synthesis")
  public async startSynthesis(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(StartSynthesisRequestSchema))
    request: StartSynthesisRequest,
  ): Promise<StartSynthesisResponse> {
    const response = StartSynthesisResponseSchema.parse(
      await this.service.startSynthesis(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("end")
  public async end(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(EndSessionRequestSchema))
    request: EndSessionRequest,
  ): Promise<EndSessionResponse> {
    const response = EndSessionResponseSchema.parse(
      await this.service.end(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }
}
