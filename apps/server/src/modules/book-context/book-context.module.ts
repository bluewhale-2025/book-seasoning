import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { BOOK_CONTEXT_GATEWAY } from "./book-context.gateway.js";
import { BOOK_CONTEXT_PROVIDER } from "./book-context.provider.js";
import { BookContextService } from "./book-context.service.js";
import { SupabaseBookContextGateway } from "./supabase-book-context.gateway.js";

@Module({
  providers: [
    BookContextService,
    {
      provide: BOOK_CONTEXT_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseBookContextGateway(environment),
    },
    { provide: BOOK_CONTEXT_PROVIDER, useExisting: BookContextService },
  ],
  exports: [BOOK_CONTEXT_PROVIDER],
})
export class BookContextModule {}

