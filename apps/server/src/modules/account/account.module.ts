import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { AccountController } from "./account.controller.js";
import { ACCOUNT_GATEWAY } from "./account.gateway.js";
import { AccountService } from "./account.service.js";
import { SupabaseAccountGateway } from "./supabase-account.gateway.js";

@Module({
  controllers: [AccountController],
  providers: [
    AccountService,
    {
      provide: ACCOUNT_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseAccountGateway(environment),
    },
  ],
})
export class AccountModule {}
