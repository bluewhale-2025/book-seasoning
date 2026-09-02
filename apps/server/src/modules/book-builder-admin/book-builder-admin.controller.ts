import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
} from "@nestjs/common";

import {
  AdminBookContextPackListResponseSchema,
  AdminBookContextPackSnapshotSchema,
  AdminBookSearchQuerySchema,
  AdminBookSearchResponseSchema,
  AdminPackCommandResponseSchema,
  BuilderPackCommandRequestSchema,
  CompleteBookContextReviewRequestSchema,
  CreateBookContextPackRequestSchema,
  CreateBookContextPackResponseSchema,
  PublishBookContextPackRequestSchema,
  ProposalCommandRequestSchema,
  RegenerateBookContextRequestSchema,
  RegenerateBookContextResponseSchema,
  RetireBookContextPackRequestSchema,
  RetryBookBuilderRunRequestSchema,
  RetryBookBuilderRunResponseSchema,
  UpdateBookContextDraftRequestSchema,
  type BuilderPackCommandRequest,
  type CompleteBookContextReviewRequest,
  type CreateBookContextPackRequest,
  type PublishBookContextPackRequest,
  type ProposalCommandRequest,
  type RegenerateBookContextRequest,
  type RetireBookContextPackRequest,
  type RetryBookBuilderRunRequest,
  type UpdateBookContextDraftRequest,
} from "@bookseasoning/contracts/admin";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import { BookBuilderAdminService } from "./book-builder-admin.service.js";

@Controller("v1/admin/book-context")
export class BookBuilderAdminController {
  public constructor(
    @Inject(BookBuilderAdminService)
    private readonly service: BookBuilderAdminService,
  ) {}

  @Get("books/search")
  public async searchBooks(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(new ZodValidationPipe(AdminBookSearchQuerySchema)) query: unknown,
  ) {
    return this.safe(
      AdminBookSearchResponseSchema.parse(
        await this.service.searchBooks(actor, AdminBookSearchQuerySchema.parse(query)),
      ),
    );
  }

  @Post("packs")
  public async create(
    @CurrentActor() actor: AuthenticatedActor,
    @Body(new ZodValidationPipe(CreateBookContextPackRequestSchema))
    request: CreateBookContextPackRequest,
  ) {
    return this.safe(
      CreateBookContextPackResponseSchema.parse(
        await this.service.create(actor, request),
      ),
    );
  }

  @Get("packs")
  public async list(@CurrentActor() actor: AuthenticatedActor) {
    return this.safe(
      AdminBookContextPackListResponseSchema.parse(
        await this.service.list(actor),
      ),
    );
  }

  @Get("packs/:packVersionId")
  public async get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
  ) {
    return this.safe(
      AdminBookContextPackSnapshotSchema.parse(
        await this.service.get(actor, packVersionId),
      ),
    );
  }

  @Put("packs/:packVersionId/draft")
  public async updateDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(UpdateBookContextDraftRequestSchema))
    request: UpdateBookContextDraftRequest,
  ) {
    return this.command(
      this.service.updateDraft(actor, packVersionId, request),
    );
  }

  @Post("packs/:packVersionId/review")
  public async review(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(CompleteBookContextReviewRequestSchema))
    request: CompleteBookContextReviewRequest,
  ) {
    return this.command(this.service.review(actor, packVersionId, request));
  }

  @Post("packs/:packVersionId/return-to-draft")
  public async returnToDraft(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(BuilderPackCommandRequestSchema))
    request: BuilderPackCommandRequest,
  ) {
    return this.command(
      this.service.returnToDraft(actor, packVersionId, request),
    );
  }

  @Post("packs/:packVersionId/publish")
  public async publish(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(PublishBookContextPackRequestSchema))
    request: PublishBookContextPackRequest,
  ) {
    return this.command(this.service.publish(actor, packVersionId, request));
  }

  @Post("packs/:packVersionId/retire")
  public async retire(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(RetireBookContextPackRequestSchema))
    request: RetireBookContextPackRequest,
  ) {
    return this.command(this.service.retire(actor, packVersionId, request));
  }

  @Post("runs/:runId/retry")
  public async retry(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("runId", new ParseUUIDPipe()) runId: string,
    @Body(new ZodValidationPipe(RetryBookBuilderRunRequestSchema))
    request: RetryBookBuilderRunRequest,
  ) {
    return this.safe(
      RetryBookBuilderRunResponseSchema.parse(
        await this.service.retry(actor, runId, request),
      ),
    );
  }

  @Post("packs/:packVersionId/regenerate")
  public async regenerate(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("packVersionId", new ParseUUIDPipe()) packVersionId: string,
    @Body(new ZodValidationPipe(RegenerateBookContextRequestSchema))
    request: RegenerateBookContextRequest,
  ) {
    return this.safe(
      RegenerateBookContextResponseSchema.parse(
        await this.service.regenerate(actor, packVersionId, request),
      ),
    );
  }

  @Post("proposals/:proposalId/apply")
  public async applyProposal(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("proposalId", new ParseUUIDPipe()) proposalId: string,
    @Body(new ZodValidationPipe(ProposalCommandRequestSchema))
    request: ProposalCommandRequest,
  ) {
    return this.command(
      this.service.applyProposal(actor, proposalId, request),
    );
  }

  @Post("proposals/:proposalId/discard")
  public async discardProposal(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("proposalId", new ParseUUIDPipe()) proposalId: string,
    @Body(new ZodValidationPipe(ProposalCommandRequestSchema))
    request: ProposalCommandRequest,
  ) {
    return this.command(
      this.service.discardProposal(actor, proposalId, request),
    );
  }

  private async command(operation: Promise<unknown>) {
    return this.safe(AdminPackCommandResponseSchema.parse(await operation));
  }

  private safe<T>(value: T): T {
    assertPublicPayloadKeys(value);
    return value;
  }
}
