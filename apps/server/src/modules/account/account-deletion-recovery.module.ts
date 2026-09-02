import { Module, type DynamicModule } from "@nestjs/common";

import { SafeLogger } from "../../observability/safe-logger.js";
import { AccountDeletionRecoveryService } from "./account-deletion-recovery.service.js";

@Module({})
export class AccountDeletionRecoveryModule {
  public static register(logger: SafeLogger): DynamicModule {
    return {
      module: AccountDeletionRecoveryModule,
      providers: [
        { provide: SafeLogger,useValue: logger },
        AccountDeletionRecoveryService,
      ],
    };
  }
}
