import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { ProfileController } from "./profile.controller.js";
import { PROFILE_GATEWAY } from "./profile.gateway.js";
import { ProfileService } from "./profile.service.js";
import { SupabaseProfileGateway } from "./supabase-profile.gateway.js";

@Module({
  controllers: [ProfileController],
  providers: [
    ProfileService,
    {
      provide: PROFILE_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseProfileGateway(environment),
    },
  ],
})
export class ProfileModule {}
