import { z } from "zod";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { createSecretSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { SafeLogger } from "../../observability/safe-logger.js";
import { SupabaseAccountGateway } from "./supabase-account.gateway.js";

const ClaimedSchema = z.array(z.strictObject({
  deletion_id: z.uuid(),
  former_user_id: z.uuid(),
}));

export async function recoverPendingAccountDeletions(
  environment: RuntimeEnvironment,
  logger: SafeLogger,
): Promise<void> {
  try {
    const client = createSecretSupabaseClient(environment);
    const { data, error } = await client.rpc("claim_pending_account_deletions", {
      p_limit: 10,
    });
    if (error !== null) throw error;
    const gateway = new SupabaseAccountGateway(environment);
    for (const deletion of ClaimedSchema.parse(data)) {
      try {
        await gateway.deleteAuthUser(deletion.former_user_id);
        await gateway.complete(deletion.deletion_id);
        logger.event("info", "worker.account_deletion_completed");
      } catch {
        await gateway.fail(deletion.deletion_id, "AUTH_DELETE_FAILED");
        logger.event("error", "worker.account_deletion_retry_scheduled");
      }
    }
  } catch {
    logger.event("error", "worker.account_deletion_recovery_failed");
  }
}
