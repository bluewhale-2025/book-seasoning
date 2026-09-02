import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { BOOK_BUILDER_ADMIN_GATEWAY } from "./book-builder-admin.gateway.js";
import { BookBuilderAdminController } from "./book-builder-admin.controller.js";
import { BookBuilderAdminService } from "./book-builder-admin.service.js";
import { SupabaseBookBuilderAdminGateway } from "./supabase-book-builder-admin.gateway.js";
import {
  BOOK_CATALOG_SEARCH_PROVIDER,
  KakaoBookCatalogSearchProvider,
} from "./book-catalog-search.provider.js";
import { BookSelectionTokenService } from "./book-selection-token.service.js";

@Module({
  controllers: [BookBuilderAdminController],
  providers: [
    BookBuilderAdminService,
    {
      provide: BOOK_CATALOG_SEARCH_PROVIDER,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new KakaoBookCatalogSearchProvider(environment),
    },
    {
      provide: BookSelectionTokenService,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new BookSelectionTokenService(environment),
    },
    {
      provide: BOOK_BUILDER_ADMIN_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseBookBuilderAdminGateway(environment),
    },
  ],
})
export class BookBuilderAdminModule {}
