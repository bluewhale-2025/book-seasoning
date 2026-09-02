import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  ClosingResponseCommandResponse,
  DeleteClosingResponseRequest,
  GetDiscussionResultResponse,
  RetryDiscussionResultRequest,
  RetryDiscussionResultResponse,
  UpsertClosingResponseRequest,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  DISCUSSION_RESULT_API_GATEWAY,
  DiscussionResultGatewayError,
  type DiscussionResultApiGateway,
} from "./discussion-result-api.gateway.js";

@Injectable()
export class DiscussionResultApiService {
  public constructor(
    @Inject(DISCUSSION_RESULT_API_GATEWAY)
    private readonly gateway: DiscussionResultApiGateway,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public async upsertClosing(
    actor: AuthenticatedActor,
    roomId: string,
    request: UpsertClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    return this.run(() =>
      this.gateway.upsertClosing(actor, {
        ...request,
        roomId,
        requestFingerprint: this.fingerprint(
          "UPSERT_CLOSING_RESPONSE",
          roomId,
          request,
        ),
      }),
    );
  }

  public async deleteClosing(
    actor: AuthenticatedActor,
    roomId: string,
    request: DeleteClosingResponseRequest,
  ): Promise<ClosingResponseCommandResponse> {
    return this.run(() =>
      this.gateway.deleteClosing(actor, {
        ...request,
        roomId,
        requestFingerprint: this.fingerprint(
          "DELETE_CLOSING_RESPONSE",
          roomId,
          request,
        ),
      }),
    );
  }

  public async getResult(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<GetDiscussionResultResponse> {
    return this.run(() => this.gateway.getResult(actor, roomId));
  }

  public async retryResult(
    actor: AuthenticatedActor,
    roomId: string,
    request: RetryDiscussionResultRequest,
  ): Promise<RetryDiscussionResultResponse> {
    return this.run(() =>
      this.gateway.retryResult(actor, {
        roomId,
        commandId: request.commandId,
        requestFingerprint: this.fingerprint(
          "RETRY_DISCUSSION_RESULT",
          roomId,
          request,
        ),
      }),
    );
  }

  private fingerprint(command: string, roomId: string, payload: unknown): string {
    return createCommandFingerprint(
      this.environment.commandFingerprintKey,
      command,
      { roomId, payload },
    );
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof DiscussionResultGatewayError)) throw error;
      const mapped = {
        actual_participation_required: [
          HttpStatus.FORBIDDEN,
          "ACTUAL_PARTICIPATION_REQUIRED",
          "실제 토론에 참여한 회원만 마지막 한 줄을 작성할 수 있습니다.",
        ],
        closing_response_invalid: [
          HttpStatus.BAD_REQUEST,
          "CLOSING_RESPONSE_INVALID",
          "마지막 한 줄 입력이 올바르지 않습니다.",
        ],
        closing_response_locked: [
          HttpStatus.CONFLICT,
          "CLOSING_RESPONSE_LOCKED",
          "마지막 한 줄 입력 시간이 종료되었습니다.",
        ],
        closing_revision_conflict: [
          HttpStatus.CONFLICT,
          "CLOSING_REVISION_CONFLICT",
          "마지막 한 줄이 다른 곳에서 변경되었습니다. 최신 상태를 확인해주세요.",
        ],
        command_payload_mismatch: [
          HttpStatus.CONFLICT,
          "COMMAND_PAYLOAD_MISMATCH",
          "같은 요청 식별자가 다른 내용에 사용되었습니다.",
        ],
        discussion_result_not_available: [
          HttpStatus.CONFLICT,
          "DISCUSSION_RESULT_NOT_AVAILABLE",
          "토론이 종료된 뒤 결과를 확인할 수 있습니다.",
        ],
        discussion_result_retry_unavailable: [
          HttpStatus.CONFLICT,
          "DISCUSSION_RESULT_RETRY_UNAVAILABLE",
          "현재 토론 기록은 다시 생성할 수 없습니다.",
        ],
        host_required: [
          HttpStatus.FORBIDDEN,
          "ROOM_HOST_REQUIRED",
          "방장만 토론 기록 생성을 다시 요청할 수 있습니다.",
        ],
        phase_version_conflict: [
          HttpStatus.CONFLICT,
          "PHASE_VERSION_CONFLICT",
          "세션 상태가 변경되었습니다. 최신 상태를 확인해주세요.",
        ],
        room_not_found: [
          HttpStatus.NOT_FOUND,
          "ROOM_NOT_FOUND",
          "토론방을 찾을 수 없습니다.",
        ],
        session_not_found: [
          HttpStatus.NOT_FOUND,
          "SESSION_NOT_FOUND",
          "세션을 찾을 수 없습니다.",
        ],
        session_read_forbidden: [
          HttpStatus.FORBIDDEN,
          "SESSION_READ_FORBIDDEN",
          "이 토론 결과를 열람할 권한이 없습니다.",
        ],
      } as const satisfies Record<string, readonly [HttpStatus, string, string]>;
      const match = mapped[error.code as keyof typeof mapped];
      if (match === undefined) throw error;
      throw new PublicHttpException(match[0], match[1], match[2]);
    }
  }
}
