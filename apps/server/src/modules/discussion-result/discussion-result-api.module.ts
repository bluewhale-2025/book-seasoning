import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { DiscussionResultApiService } from "./discussion-result-api.service.js";
import { DISCUSSION_RESULT_API_GATEWAY } from "./discussion-result-api.gateway.js";
import { DiscussionResultController } from "./discussion-result.controller.js";
import { SupabaseDiscussionResultApiGateway } from "./supabase-discussion-result-api.gateway.js";

@Module({
  controllers: [DiscussionResultController],
  providers: [
    DiscussionResultApiService,
    {
      provide: DISCUSSION_RESULT_API_GATEWAY,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        new SupabaseDiscussionResultApiGateway(environment),
    },
  ],
})
export class DiscussionResultApiModule {}
