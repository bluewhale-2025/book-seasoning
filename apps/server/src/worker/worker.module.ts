import { Module, type DynamicModule } from "@nestjs/common";

import type { RuntimeEnvironment } from "../config/environment.js";
import { RuntimeConfigModule } from "../config/runtime-config.module.js";
import { BookContextModule } from "../modules/book-context/book-context.module.js";
import { AiJobModule } from "../modules/ai-jobs/ai-job.module.js";
import { LivingWikiModule } from "../modules/living-wiki/living-wiki.module.js";
import { BookBuilderModule } from "../modules/book-builder/book-builder.module.js";
import { AccountDeletionRecoveryModule } from "../modules/account/account-deletion-recovery.module.js";
import { SafeLogger } from "../observability/safe-logger.js";
import { WorkerRuntimeService } from "./worker-runtime.service.js";

@Module({})
export class WorkerModule {
  public static register(environment: RuntimeEnvironment): DynamicModule {
    const logger = new SafeLogger(environment);
    return {
      module: WorkerModule,
      imports: [
        RuntimeConfigModule.forRoot(environment),
        BookContextModule,
        LivingWikiModule,
        AiJobModule.register(logger),
        BookBuilderModule.register(logger),
        AccountDeletionRecoveryModule.register(logger),
      ],
      providers: [
        { provide: SafeLogger, useValue: logger },
        WorkerRuntimeService,
      ],
    };
  }
}
