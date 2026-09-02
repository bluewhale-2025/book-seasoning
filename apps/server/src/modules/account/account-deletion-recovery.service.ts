import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { z } from "zod";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { createSecretSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import { SupabaseAccountGateway } from "./supabase-account.gateway.js";

const ClaimedSchema = z.array(z.strictObject({
  deletion_id: z.uuid(),
  former_user_id: z.uuid(),
}));

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
    this.running = this.recover().finally(() => {
      this.running = undefined;
    });
    this.timer = setInterval(() => {
      if (this.running === undefined) {
        this.running = this.recover().finally(() => {
          this.running = undefined;
        });
      }
    },60_000);
  }

  public async onModuleDestroy(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer);
    await this.running;
  }

  private async recover(): Promise<void> {
    try {
      const client = createSecretSupabaseClient(this.environment);
      const { data,error } = await client.rpc("claim_pending_account_deletions",{
        p_limit: 10,
      });
      if (error !== null) throw error;
      const gateway = new SupabaseAccountGateway(this.environment);
      for (const deletion of ClaimedSchema.parse(data)) {
        try {
          await gateway.deleteAuthUser(deletion.former_user_id);
          await gateway.complete(deletion.deletion_id);
          this.logger.event("info","worker.account_deletion_completed");
        } catch {
          await gateway.fail(deletion.deletion_id,"AUTH_DELETE_FAILED");
          this.logger.event("error","worker.account_deletion_retry_scheduled");
        }
      }
    } catch {
      this.logger.event("error","worker.account_deletion_recovery_failed");
    }
  }
}
