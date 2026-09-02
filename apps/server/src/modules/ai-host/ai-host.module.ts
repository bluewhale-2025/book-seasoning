import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { AiContextModule } from "../ai-context/ai-context.module.js";
import { AiProviderModule } from "../ai-provider/ai-provider.module.js";
import { AI_PUBLIC_MESSAGE_REPOSITORY } from "./ai-public-message.repository.js";
import { HostContextBuilder } from "./host-context.builder.js";
import { HostInterventionService } from "./host-intervention.service.js";
import { HostOutputValidator } from "./host-output.validator.js";
import { OpeningOutputValidator } from "./opening-output.validator.js";
import { OpeningService } from "./opening.service.js";
import { PostgresAiPublicMessageRepository } from "./postgres-ai-public-message.repository.js";
import { PublicAiOutputSafetyValidator } from "./public-ai-output-safety.validator.js";

@Module({
  imports: [WorkerPostgresModule, AiContextModule, AiProviderModule],
  providers: [
    PublicAiOutputSafetyValidator,
    OpeningOutputValidator,
    HostOutputValidator,
    HostContextBuilder,
    PostgresAiPublicMessageRepository,
    {
      provide: AI_PUBLIC_MESSAGE_REPOSITORY,
      useExisting: PostgresAiPublicMessageRepository,
    },
    OpeningService,
    HostInterventionService,
  ],
  exports: [OpeningService, HostInterventionService],
})
export class AiHostModule {}
