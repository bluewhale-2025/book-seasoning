import { Module } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { AiContextModule } from "../ai-context/ai-context.module.js";
import { LivingWikiCommitService } from "./living-wiki-commit.service.js";
import { LivingWikiEvaluatorConsistencyValidator } from "./living-wiki-evaluator-consistency.validator.js";
import { LivingWikiPatchEngine } from "./living-wiki-patch.engine.js";
import { LIVING_WIKI_REPOSITORY } from "./living-wiki.repository.js";
import { PostgresLivingWikiRepository } from "./postgres-living-wiki.repository.js";
import { TopicCheckpointValidator } from "./topic-checkpoint.validator.js";

@Module({
  imports: [WorkerPostgresModule, AiContextModule],
  providers: [
    LivingWikiPatchEngine,
    LivingWikiEvaluatorConsistencyValidator,
    TopicCheckpointValidator,
    PostgresLivingWikiRepository,
    {
      provide: LIVING_WIKI_REPOSITORY,
      useExisting: PostgresLivingWikiRepository,
    },
    LivingWikiCommitService,
  ],
  exports: [
    LivingWikiPatchEngine,
    LivingWikiCommitService,
    LIVING_WIKI_REPOSITORY,
  ],
})
export class LivingWikiModule {}
