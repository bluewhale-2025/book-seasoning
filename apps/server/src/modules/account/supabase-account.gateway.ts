import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import { AccountDeletionPreviewSchema } from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { supabaseRpcErrorCode } from "../../infrastructure/supabase/supabase-error.js";
import {
  createSecretSupabaseClient,
  createUserSupabaseClient,
} from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  AccountGatewayError,
  type AccountGateway,
  type PreparedAccountDeletion,
} from "./account.gateway.js";

const PreparedSchema = z.strictObject({
  deletionId: z.uuid(),
  status: z.enum(["PENDING","PROCESSING","RETRY_SCHEDULED","COMPLETED","FAILED"]),
  duplicate: z.boolean(),
  serverTime: z.iso.datetime({ offset: true }),
});

export class SupabaseAccountGateway implements AccountGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async preview(actor: AuthenticatedActor) {
    const { data, error } = await createUserSupabaseClient(
      this.environment,
      actor,
    ).rpc("get_account_deletion_preview");
    if (error !== null) {
      throw new AccountGatewayError(
        supabaseRpcErrorCode(error, "account_deletion_preview_failed"),
      );
    }
    return AccountDeletionPreviewSchema.parse(data);
  }

  public async getEmail(userId: string): Promise<string> {
    const { data, error } = await createSecretSupabaseClient(
      this.environment,
    ).auth.admin.getUserById(userId);
    if (error !== null || data.user.email === undefined) {
      throw new AccountGatewayError("account_not_found");
    }
    return data.user.email;
  }

  public async verifyPassword(
    userId: string,
    email: string,
    password: string,
  ): Promise<boolean> {
    const { supabaseUrl, supabasePublishableKey } = this.environment;
    if (supabaseUrl === undefined || supabasePublishableKey === undefined) {
      throw new AccountGatewayError("account_password_verification_unavailable");
    }
    const client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    return error === null && data.user?.id === userId;
  }

  public async prepare(
    actor: AuthenticatedActor,
    commandId: string,
    requestFingerprint: string,
  ): Promise<PreparedAccountDeletion> {
    const { data, error } = await createUserSupabaseClient(
      this.environment,
      actor,
    ).rpc("prepare_account_deletion", {
      p_command_id: commandId,
      p_request_fingerprint: requestFingerprint,
    });
    if (error !== null) {
      throw new AccountGatewayError(
        supabaseRpcErrorCode(error, "account_deletion_prepare_failed"),
      );
    }
    return PreparedSchema.parse(data);
  }

  public async deleteAuthUser(userId: string) {
    const { error } = await createSecretSupabaseClient(
      this.environment,
    ).auth.admin.deleteUser(userId, false);
    if (error === null) return "DELETED" as const;
    if (/not found/i.test(error.message)) return "ALREADY_DELETED" as const;
    throw new AccountGatewayError("account_auth_delete_failed");
  }

  public async complete(deletionId: string): Promise<void> {
    const { error } = await createSecretSupabaseClient(this.environment).rpc(
      "complete_account_deletion",
      { p_deletion_id: deletionId },
    );
    if (error !== null) throw new AccountGatewayError("account_deletion_complete_failed");
  }

  public async fail(deletionId: string, errorCode: string): Promise<void> {
    const { error } = await createSecretSupabaseClient(this.environment).rpc(
      "fail_account_deletion",
      { p_deletion_id: deletionId, p_error_code: errorCode },
    );
    if (error !== null) throw new AccountGatewayError("account_deletion_fail_record_failed");
  }
}
