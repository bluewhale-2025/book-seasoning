import type {
  AccountDeletionPreview,
} from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export class AccountGatewayError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "AccountGatewayError";
  }
}

export type PreparedAccountDeletion = Readonly<{
  deletionId: string;
  status: "PENDING" | "PROCESSING" | "RETRY_SCHEDULED" | "COMPLETED" | "FAILED";
  duplicate: boolean;
  serverTime: string;
}>;

export interface AccountGateway {
  preview(actor: AuthenticatedActor): Promise<AccountDeletionPreview>;
  getEmail(userId: string): Promise<string>;
  verifyPassword(userId: string, email: string, password: string): Promise<boolean>;
  prepare(
    actor: AuthenticatedActor,
    commandId: string,
    requestFingerprint: string,
  ): Promise<PreparedAccountDeletion>;
  deleteAuthUser(userId: string): Promise<"DELETED" | "ALREADY_DELETED">;
  complete(deletionId: string): Promise<void>;
  fail(deletionId: string, errorCode: string): Promise<void>;
}

export const ACCOUNT_GATEWAY = Symbol("ACCOUNT_GATEWAY");
