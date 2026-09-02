import { Module, type DynamicModule } from "@nestjs/common";

import { WorkerPostgresModule } from "../../infrastructure/postgres/worker-postgres.module.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import { AiProviderModule } from "../ai-provider/ai-provider.module.js";
import { BookBuilderConsumerService } from "./book-builder.consumer.service.js";
import { BookBuilderProcessor } from "./book-builder.processor.js";
import { BOOK_BUILDER_QUEUE } from "./book-builder.queue.js";
import { BookBuilderService } from "./book-builder.service.js";
import { PostgresBookBuilderQueue } from "./postgres-book-builder.queue.js";

@Module({})
export class BookBuilderModule {
  public static register(logger: SafeLogger): DynamicModule {
    return {
      module: BookBuilderModule,
      imports: [WorkerPostgresModule, AiProviderModule],
      providers: [
        { provide: SafeLogger, useValue: logger },
        PostgresBookBuilderQueue,
        { provide: BOOK_BUILDER_QUEUE, useExisting: PostgresBookBuilderQueue },
        BookBuilderService,
        BookBuilderProcessor,
        BookBuilderConsumerService,
      ],
    };
  }
}
