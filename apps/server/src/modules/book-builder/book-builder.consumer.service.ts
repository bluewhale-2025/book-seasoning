import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { SafeLogger } from "../../observability/safe-logger.js";
import { BookBuilderProcessor } from "./book-builder.processor.js";

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class BookBuilderConsumerService implements OnModuleInit, OnModuleDestroy {
  private stopping = false;
  private loop: Promise<void> | undefined;

  public constructor(
    @Inject(BookBuilderProcessor) private readonly processor: BookBuilderProcessor,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public onModuleInit(): void {
    if (!this.processor.configured) {
      this.logger.event("warn", "worker.book_builder_queue_disabled");
      return;
    }
    this.loop = this.consume();
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async consume(): Promise<void> {
    this.logger.event("info", "worker.book_builder_queue_started");
    while (!this.stopping) {
      try {
        await this.processor.processNext();
      } catch {
        this.logger.event("error", "worker.book_builder_queue_poll_failed");
        if (!this.stopping) await wait(1_000);
      }
    }
    this.logger.event("info", "worker.book_builder_queue_stopped");
  }
}
