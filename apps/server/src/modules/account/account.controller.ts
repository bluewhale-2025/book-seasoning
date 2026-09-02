import { Body, Controller, Delete, Get, Inject } from "@nestjs/common";

import {
  AccountDeletionPreviewSchema,
  DeleteAccountRequestSchema,
  DeleteAccountResponseSchema,
  type AccountDeletionPreview,
  type DeleteAccountRequest,
  type DeleteAccountResponse,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import { AccountService } from "./account.service.js";

@Controller("v1/me/account")
export class AccountController {
  public constructor(
    @Inject(AccountService) private readonly service: AccountService,
  ) {}

  @Get("deletion-preview")
  public async preview(
    @CurrentActor() actor: AuthenticatedActor,
  ): Promise<AccountDeletionPreview> {
    const response = AccountDeletionPreviewSchema.parse(
      await this.service.preview(actor),
    );
    assertPublicPayloadKeys(response);
    return response;
  }

  @Delete()
  public async delete(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(DeleteAccountRequestSchema))
    request: DeleteAccountRequest,
  ): Promise<DeleteAccountResponse> {
    const response = DeleteAccountResponseSchema.parse(
      await this.service.delete(actor, request),
    );
    assertPublicPayloadKeys(response);
    return response;
  }
}
