import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { AiContextModule } from "../ai-context/ai-context.module.js";
import { AiProviderModule } from "../ai-provider/ai-provider.module.js";
import { PublicAiOutputSafetyValidator } from "../ai-host/public-ai-output-safety.validator.js";
import { LivingWikiModule } from "../living-wiki/living-wiki.module.js";
import { PublicEvaluatorModule } from "../public-evaluator/public-evaluator.module.js";
import { DiscussionRecordService } from "./discussion-record.service.js";
import { DISCUSSION_RESULT_REPOSITORY } from "./discussion-result.repository.js";
import { FinalWikiService } from "./final-wiki.service.js";
import { PostgresDiscussionResultRepository } from "./postgres-discussion-result.repository.js";
import { SynthesisService } from "./synthesis.service.js";

@Module({
  imports: [
    WorkerPostgresModule,
    AiContextModule,
    AiProviderModule,
    LivingWikiModule,
    PublicEvaluatorModule,
  ],
  providers: [
    PublicAiOutputSafetyValidator,
    PostgresDiscussionResultRepository,
    {
      provide: DISCUSSION_RESULT_REPOSITORY,
      useExisting: PostgresDiscussionResultRepository,
    },
    SynthesisService,
    FinalWikiService,
    DiscussionRecordService,
  ],
  exports: [SynthesisService, FinalWikiService, DiscussionRecordService],
})
export class DiscussionResultModule {}
