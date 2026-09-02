import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { BookCatalogController } from "./book-catalog.controller.js";
import { BOOK_CATALOG_GATEWAY } from "./book-catalog.gateway.js";
import { BookCatalogService } from "./book-catalog.service.js";
import { SupabaseBookCatalogGateway } from "./supabase-book-catalog.gateway.js";

@Module({
  controllers: [BookCatalogController],
  providers: [
    BookCatalogService,
    {
      provide: BOOK_CATALOG_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseBookCatalogGateway(environment),
    },
  ],
})
export class BookModule {}
