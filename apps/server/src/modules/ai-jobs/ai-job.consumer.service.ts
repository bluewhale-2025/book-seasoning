import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { SafeLogger } from "../../observability/safe-logger.js";
import { AiJobProcessor } from "./ai-job.processor.js";

const RETRY_AFTER_POLL_ERROR_MS = 1_000;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

@Injectable()
export class AiJobConsumerService implements OnModuleInit, OnModuleDestroy {
  private stopping = false;
  private loop: Promise<void> | undefined;

  public constructor(
    @Inject(AiJobProcessor) private readonly processor: AiJobProcessor,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public onModuleInit(): void {
    if (!this.processor.configured) {
      this.logger.event("warn", "worker.ai_queue_disabled");
      return;
    }
    this.loop = this.consume();
  }

  public async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await this.loop;
  }

  private async consume(): Promise<void> {
    this.logger.event("info", "worker.ai_queue_started");
    while (!this.stopping) {
      try {
        await this.processor.processNextBatch();
      } catch {
        this.logger.event("error", "worker.ai_queue_poll_failed");
        if (!this.stopping) {
          await wait(RETRY_AFTER_POLL_ERROR_MS);
        }
      }
    }
    this.logger.event("info", "worker.ai_queue_stopped");
  }
}
