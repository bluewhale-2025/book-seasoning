import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import { recoverPendingAccountDeletions } from "./account-deletion-recovery.js";

@Injectable()
export class AccountDeletionRecoveryService
  implements OnModuleInit, OnModuleDestroy
{
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  public constructor(
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public onModuleInit(): void {
    if (
      this.environment.supabaseUrl === undefined ||
      this.environment.supabaseSecretKey === undefined
    ) return;
    this.running = recoverPendingAccountDeletions(this.environment, this.logger).finally(() => {
      this.running = undefined;
    });
    this.timer = setInterval(() => {
      if (this.running === undefined) {
        this.running = recoverPendingAccountDeletions(this.environment, this.logger).finally(() => {
          this.running = undefined;
        });
      }
    },60_000);
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.running;
  }
}
