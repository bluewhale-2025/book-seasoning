import { Module, type DynamicModule } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import { AiHostModule } from "../ai-host/ai-host.module.js";
import { DiscussionResultModule } from "../discussion-result/discussion-result.module.js";
import { PublicEvaluatorModule } from "../public-evaluator/public-evaluator.module.js";
import { PolicyModule } from "../policy/policy.module.js";
import { AiJobConsumerService } from "./ai-job.consumer.service.js";
import { AI_JOB_HANDLER } from "./ai-job.handler.js";
import { AiJobRoutingHandler } from "./ai-job-routing.handler.js";
import { AiJobProcessor } from "./ai-job.processor.js";
import { AI_ORCHESTRATION_REPOSITORY } from "./ai-orchestration.repository.js";
import { AI_JOB_QUEUE } from "./ai-job.queue.js";
import { ExtensionOpinionService } from "./extension-opinion.service.js";
import { PostgresAiOrchestrationRepository } from "./postgres-ai-orchestration.repository.js";
import { PostgresAiJobQueue } from "./postgres-ai-job.queue.js";

@Module({})
export class AiJobModule {
  public static register(logger: SafeLogger): DynamicModule {
    return {
      module: AiJobModule,
      imports: [
        WorkerPostgresModule,
        PublicEvaluatorModule,
        PolicyModule,
        AiHostModule,
        DiscussionResultModule,
      ],
      providers: [
        { provide: SafeLogger, useValue: logger },
        PostgresAiJobQueue,
        { provide: AI_JOB_QUEUE, useExisting: PostgresAiJobQueue },
        PostgresAiOrchestrationRepository,
        {
          provide: AI_ORCHESTRATION_REPOSITORY,
          useExisting: PostgresAiOrchestrationRepository,
        },
        ExtensionOpinionService,
        AiJobRoutingHandler,
        { provide: AI_JOB_HANDLER, useExisting: AiJobRoutingHandler },
        AiJobProcessor,
        AiJobConsumerService,
      ],
    };
  }
}
