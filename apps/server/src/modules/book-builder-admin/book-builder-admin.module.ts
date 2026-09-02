import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { BOOK_BUILDER_ADMIN_GATEWAY } from "./book-builder-admin.gateway.js";
import { BookBuilderAdminController } from "./book-builder-admin.controller.js";
import { BookBuilderAdminService } from "./book-builder-admin.service.js";
import { SupabaseBookBuilderAdminGateway } from "./supabase-book-builder-admin.gateway.js";

@Module({
  controllers: [BookBuilderAdminController],
  providers: [
    BookBuilderAdminService,
    {
      provide: BOOK_BUILDER_ADMIN_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseBookBuilderAdminGateway(environment),
    },
  ],
})
export class BookBuilderAdminModule {}
