import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import {
  createOpenAiClient,
  OPENAI_CLIENT,
  OpenAiGateway,
} from "../../infrastructure/ai/openai-ai.gateway.js";
import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { AI_GATEWAY } from "./ai-gateway.js";
import { AiGenerationService } from "./ai-generation.service.js";
import { AI_PROVIDER_RUN_REPOSITORY } from "./ai-provider-run.repository.js";
import { PostgresAiProviderRunRepository } from "./postgres-ai-provider-run.repository.js";

@Module({
  imports: [WorkerPostgresModule],
  providers: [
    {
      provide: OPENAI_CLIENT,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) =>
        createOpenAiClient(environment),
    },
    OpenAiGateway,
    { provide: AI_GATEWAY, useExisting: OpenAiGateway },
    PostgresAiProviderRunRepository,
    {
      provide: AI_PROVIDER_RUN_REPOSITORY,
      useExisting: PostgresAiProviderRunRepository,
    },
    AiGenerationService,
  ],
  exports: [AI_GATEWAY, AiGenerationService],
})
export class AiProviderModule {}
