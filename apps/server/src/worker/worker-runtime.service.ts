import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { WorkerHeartbeatSchema } from "@bookseasoning/contracts/internal";

import type { RuntimeEnvironment } from "../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../config/runtime-config.module.js";
import { SafeLogger } from "../observability/safe-logger.js";

@Injectable()
export class WorkerRuntimeService implements OnModuleInit, OnModuleDestroy {
  private heartbeatTimer: NodeJS.Timeout | undefined;

  public constructor(
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
    @Inject(SafeLogger)
    private readonly logger: SafeLogger,
  ) {}

  public onModuleInit(): void {
    this.logger.event("info", "worker.started");
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 30_000);
  }

  public onModuleDestroy(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer);
    }
    this.logger.event("info", "worker.stopped");
  }

  private heartbeat(): void {
    WorkerHeartbeatSchema.parse({
      runtime: "worker",
      release: this.environment.release,
      occurredAt: new Date().toISOString(),
    });
    this.logger.event("info", "worker.heartbeat");
  }
}
