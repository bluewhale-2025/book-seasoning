import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  AccountDeletionPreview,
  DeleteAccountRequest,
  DeleteAccountResponse,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  ACCOUNT_GATEWAY,
  AccountGatewayError,
  type AccountGateway,
} from "./account.gateway.js";

@Injectable()
export class AccountService {
  public constructor(
    @Inject(ACCOUNT_GATEWAY) private readonly gateway: AccountGateway,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public preview(actor: AuthenticatedActor): Promise<AccountDeletionPreview> {
    return this.run(() => this.gateway.preview(actor));
  }

  public async delete(
    actor: AuthenticatedActor,
    request: DeleteAccountRequest,
  ): Promise<DeleteAccountResponse> {
    return this.run(async () => {
      const preview = await this.gateway.preview(actor);
      if (!preview.allowed) {
        throw new AccountGatewayError("account_deletion_blocked");
      }
      const email = await this.gateway.getEmail(actor.userId);
      if (
        !(await this.gateway.verifyPassword(
          actor.userId,
          email,
          request.currentPassword,
        ))
      ) {
        throw new AccountGatewayError("current_password_invalid");
      }
      const prepared = await this.gateway.prepare(
        actor,
        request.commandId,
        createCommandFingerprint(
          this.environment.commandFingerprintKey,
          "DELETE_ACCOUNT",
          {
            userId: actor.userId,
            commandId: request.commandId,
            confirmPermanentDeletion: request.confirmPermanentDeletion,
          },
        ),
      );
      if (prepared.status !== "COMPLETED") {
        try {
          await this.gateway.deleteAuthUser(actor.userId);
        } catch (error) {
          try {
            await this.gateway.fail(prepared.deletionId, "AUTH_DELETE_FAILED");
          } catch {
            // Preserve the user-facing deletion-pending error even when the
            // recovery marker cannot be updated in the same request.
          }
          throw error;
        }
        try {
          await this.gateway.complete(prepared.deletionId);
        } catch {
          // Auth identity is already gone. The durable recovery worker will
          // finish the bookkeeping without making deletion appear reversible.
        }
      }
      return {
        deletionId: prepared.deletionId,
        status: "COMPLETED",
        duplicate: prepared.duplicate,
        serverTime: new Date().toISOString(),
      };
    });
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof AccountGatewayError)) throw error;
      const errors = {
        account_deletion_blocked: [
          HttpStatus.CONFLICT,
          "ACCOUNT_DELETION_BLOCKED",
          "진행 중인 참여, 방장 권한 또는 관리자 역할을 먼저 정리해주세요.",
        ],
        current_password_invalid: [
          HttpStatus.UNAUTHORIZED,
          "CURRENT_PASSWORD_INVALID",
          "현재 비밀번호를 확인해주세요.",
        ],
        account_not_found: [
          HttpStatus.NOT_FOUND,
          "ACCOUNT_NOT_FOUND",
          "계정을 찾을 수 없습니다.",
        ],
        account_auth_delete_failed: [
          HttpStatus.SERVICE_UNAVAILABLE,
          "ACCOUNT_DELETION_PENDING",
          "계정 삭제를 계속 처리하고 있습니다.",
        ],
        command_payload_mismatch: [
          HttpStatus.CONFLICT,
          "COMMAND_PAYLOAD_MISMATCH",
          "같은 요청 식별자가 다른 내용에 사용되었습니다.",
        ],
      } as const satisfies Record<string, readonly [HttpStatus, string, string]>;
      const mapped = errors[error.code as keyof typeof errors];
      if (mapped === undefined) throw error;
      throw new PublicHttpException(mapped[0],mapped[1],mapped[2]);
    }
  }
}
