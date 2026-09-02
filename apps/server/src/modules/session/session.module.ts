import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { SessionController } from "./session.controller.js";
import { SESSION_GATEWAY } from "./session.gateway.js";
import { SessionPhasePolicy } from "./session-phase.policy.js";
import { SessionService } from "./session.service.js";
import { SupabaseSessionGateway } from "./supabase-session.gateway.js";

@Module({
  controllers: [SessionController],
  providers: [
    SessionPhasePolicy,
    SessionService,
    {
      provide: SESSION_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseSessionGateway(environment),
    },
  ],
  exports: [SessionPhasePolicy],
})
export class SessionModule {}
