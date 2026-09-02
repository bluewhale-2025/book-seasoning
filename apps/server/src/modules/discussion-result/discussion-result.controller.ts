import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";

import {
  ClosingResponseCommandResponseSchema,
  DeleteClosingResponseRequestSchema,
  GetDiscussionResultResponseSchema,
  RetryDiscussionResultRequestSchema,
  RetryDiscussionResultResponseSchema,
  UpsertClosingResponseRequestSchema,
  type ClosingResponseCommandResponse,
  type DeleteClosingResponseRequest,
  type GetDiscussionResultResponse,
  type RetryDiscussionResultRequest,
  type RetryDiscussionResultResponse,
  type UpsertClosingResponseRequest,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import { DiscussionResultApiService } from "./discussion-result-api.service.js";

@Controller("v1/rooms/:roomId/session")
export class DiscussionResultController {
  public constructor(
    @Inject(DiscussionResultApiService)
    private readonly service: DiscussionResultApiService,
  ) {}

  @Put("closing/response")
  public async upsertClosing(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(UpsertClosingResponseRequestSchema))
    request: UpsertClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    const response = ClosingResponseCommandResponseSchema.parse(
      await this.service.upsertClosing(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Delete("closing/response")
  public async deleteClosing(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(DeleteClosingResponseRequestSchema))
    request: DeleteClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    const response = ClosingResponseCommandResponseSchema.parse(
      await this.service.deleteClosing(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Get("result")
  public async getResult(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
  ): Promise<GetDiscussionResultResponse> {
    const response = GetDiscussionResultResponseSchema.parse(
      await this.service.getResult(actor, roomId),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Post("result/retry")
  public async retryResult(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Body(new ZodValidationPipe(RetryDiscussionResultRequestSchema))
    request: RetryDiscussionResultRequest,
  ): Promise<RetryDiscussionResultResponse> {
    const response = RetryDiscussionResultResponseSchema.parse(
      await this.service.retryResult(actor, roomId, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }
}
