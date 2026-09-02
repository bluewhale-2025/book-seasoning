import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { AuthGuard } from "./auth.guard.js";
import { AUTH_TOKEN_VERIFIER } from "./auth.types.js";
import { SupabaseJwtVerifier } from "./supabase-jwt-verifier.js";

@Module({
  providers: [
    {
      provide: AUTH_TOKEN_VERIFIER,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseJwtVerifier(environment),
    },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH_TOKEN_VERIFIER],
})
export class AuthModule {}
