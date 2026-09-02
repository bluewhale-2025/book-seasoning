import { Module } from "@nestjs/common";

import { AiContextModule } from "../ai-context/ai-context.module.js";
import { AiProviderModule } from "../ai-provider/ai-provider.module.js";
import { LivingWikiModule } from "../living-wiki/living-wiki.module.js";
import { GatewayPublicEvaluator } from "./gateway-public-evaluator.js";
import { PublicEvaluationService } from "./public-evaluation.service.js";
import { PublicEvaluatorOutputValidator } from "./public-evaluator-output.validator.js";
import { PUBLIC_EVALUATOR } from "./public-evaluator.js";

@Module({
  imports: [AiContextModule, AiProviderModule, LivingWikiModule],
  providers: [
    GatewayPublicEvaluator,
    { provide: PUBLIC_EVALUATOR, useExisting: GatewayPublicEvaluator },
    PublicEvaluatorOutputValidator,
    PublicEvaluationService,
  ],
  exports: [PublicEvaluationService],
})
export class PublicEvaluatorModule {}
