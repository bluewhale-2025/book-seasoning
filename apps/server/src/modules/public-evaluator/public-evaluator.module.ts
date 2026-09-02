import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { AiContextModule } from "../ai-context/ai-context.module.js";
import { AiProviderModule } from "../ai-provider/ai-provider.module.js";
import { LivingWikiModule } from "../living-wiki/living-wiki.module.js";
import { GatewayPublicEvaluator } from "./gateway-public-evaluator.js";
import { PublicEvaluationService } from "./public-evaluation.service.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";
import { PostgresReusablePublicEvaluationRepository } from "./postgres-reusable-public-evaluation.repository.js";
import { PUBLIC_EVALUATOR } from "./public-evaluator.js";
import { REUSABLE_PUBLIC_EVALUATION_REPOSITORY } from "./reusable-public-evaluation.repository.js";

@Module({
  imports: [
    WorkerPostgresModule,
    AiContextModule,
    AiProviderModule,
    LivingWikiModule,
  ],
  providers: [
    GatewayPublicEvaluator,
    { provide: PUBLIC_EVALUATOR, useExisting: GatewayPublicEvaluator },
    PublicEvaluatorOutputValidator,
    PostgresReusablePublicEvaluationRepository,
    {
      provide: REUSABLE_PUBLIC_EVALUATION_REPOSITORY,
      useExisting: PostgresReusablePublicEvaluationRepository,
    },
    PublicEvaluationService,
  ],
  exports: [PublicEvaluationService],
})
export class PublicEvaluatorModule {}
