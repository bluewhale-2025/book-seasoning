import { Controller, Get, Inject, Query } from "@nestjs/common";

import {
  BookCatalogQuerySchema,
  BookCatalogResponseSchema,
  type BookCatalogQuery,
  type BookCatalogResponse,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import { ZodValidationPipe } from "../../http/zod-validation.pipe.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { BookCatalogService } from "./book-catalog.service.js";

@Controller("v1/books")
export class BookCatalogController {
  public constructor(
    @Inject(BookCatalogService)
    private readonly service: BookCatalogService,
  ) {}

  @Get()
  public async search(
    @CurrentActor() actor: AuthenticatedActor,
    @Query(new ZodValidationPipe(BookCatalogQuerySchema))
    query: BookCatalogQuery,
  ): Promise<BookCatalogResponse> {
    const response = BookCatalogResponseSchema.parse(
      await this.service.search(actor, query),
    );
    assertPublicPayloadKeys(response);
    return response;
  }
}
