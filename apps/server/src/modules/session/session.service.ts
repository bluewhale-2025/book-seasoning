import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  EndSessionRequest,
  EndSessionResponse,
  ExtendSessionRequest,
  ExtendSessionResponse,
  SendSessionMessageRequest,
  SendSessionMessageResponse,
  RequestSessionAiHelpRequest,
  RequestSessionAiHelpResponse,
  SessionHeartbeatRequest,
  SessionHeartbeatResponse,
  SessionMessagePage,
  SessionMessagePageQuery,
  SessionSnapshot,
  SessionSyncQuery,
  StartSessionRequest,
  StartSessionResponse,
  StartSynthesisRequest,
  StartSynthesisResponse,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import {
  SESSION_GATEWAY,
  SessionGatewayError,
  type SessionGateway,
} from "./session.gateway.js";

@Injectable()
export class SessionService {
  public constructor(
    @Inject(SESSION_GATEWAY) private readonly gateway: SessionGateway,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public async sync(
    actor: AuthenticatedActor,
    roomId: string,
    query: SessionSyncQuery,
  ): Promise<SessionSnapshot> {
    try {
      return await this.gateway.sync(actor, { roomId, ...query });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async getMessagePage(
    actor: AuthenticatedActor,
    roomId: string,
    query: SessionMessagePageQuery,
  ): Promise<SessionMessagePage> {
    try {
      return await this.gateway.getMessagePage(actor, { roomId, ...query });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async sendMessage(
    actor: AuthenticatedActor,
    roomId: string,
    request: SendSessionMessageRequest,
  ): Promise<SendSessionMessageResponse> {
    try {
      return await this.gateway.appendMessage(actor, {
        roomId,
        clientMessageId: request.clientMessageId,
        body: request.body,
        replyToMessageId: request.replyToMessageId,
      });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async heartbeat(
    actor: AuthenticatedActor,
    roomId: string,
    request: SessionHeartbeatRequest,
  ): Promise<SessionHeartbeatResponse> {
    try {
      return await this.gateway.heartbeat(actor, {
        roomId,
        deviceId: request.deviceId,
      });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async requestAiHelp(
    actor: AuthenticatedActor,
    roomId: string,
    request: RequestSessionAiHelpRequest,
  ): Promise<RequestSessionAiHelpResponse> {
    try {
      return await this.gateway.requestAiHelp(actor, {
        commandId: request.commandId,
        requestFingerprint: createCommandFingerprint(
          this.environment.commandFingerprintKey,
          "REQUEST_SESSION_AI_HELP",
          {
            roomId,
            expectedPhaseVersion: request.expectedPhaseVersion,
            reason: request.reason,
          },
        ),
        roomId,
        expectedPhaseVersion: request.expectedPhaseVersion,
        reason: request.reason,
      });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async start(
    actor: AuthenticatedActor,
    roomId: string,
    request: StartSessionRequest,
  ): Promise<StartSessionResponse> {
    try {
      return await this.gateway.start(actor, {
        commandId: request.commandId,
        requestFingerprint: createCommandFingerprint(
          this.environment.commandFingerprintKey,
          "START_SESSION",
          {
            roomId,
            expectedPhaseVersion: request.expectedPhaseVersion,
            ...request.payload,
          },
        ),
        roomId,
        expectedPhaseVersion: request.expectedPhaseVersion,
      });
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async extend(
    actor: AuthenticatedActor,
    roomId: string,
    request: ExtendSessionRequest,
  ): Promise<ExtendSessionResponse> {
    try {
      return await this.gateway.extend(
        actor,
        this.controlInput("EXTEND_SESSION", roomId, request),
      );
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async startSynthesis(
    actor: AuthenticatedActor,
    roomId: string,
    request: StartSynthesisRequest,
  ): Promise<StartSynthesisResponse> {
    try {
      return await this.gateway.startSynthesis(
        actor,
        this.controlInput("START_SYNTHESIS", roomId, request),
      );
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  public async end(
    actor: AuthenticatedActor,
    roomId: string,
    request: EndSessionRequest,
  ): Promise<EndSessionResponse> {
    try {
      return await this.gateway.end(
        actor,
        this.controlInput("END_SESSION", roomId, request),
      );
    } catch (error) {
      this.rethrowSessionError(error);
    }
  }

  private controlInput(
    commandType: "EXTEND_SESSION" | "START_SYNTHESIS" | "END_SESSION",
    roomId: string,
    request: ExtendSessionRequest | StartSynthesisRequest | EndSessionRequest,
  ) {
    return {
      commandId: request.commandId,
      requestFingerprint: createCommandFingerprint(
        this.environment.commandFingerprintKey,
        commandType,
        { roomId, expectedPhaseVersion: request.expectedPhaseVersion, ...request.payload },
      ),
      roomId,
      expectedPhaseVersion: request.expectedPhaseVersion,
    };
  }

  private rethrowSessionError(error: unknown): never {
    if (!(error instanceof SessionGatewayError)) {
      throw error;
    }

    const mapped = {
      actual_participation_required: [
        HttpStatus.FORBIDDEN,
        "ACTUAL_PARTICIPATION_REQUIRED",
        "실시간 토론에 접속해 실제 참여가 확인된 회원만 메시지를 보낼 수 있습니다.",
      ],
      ai_help_request_cooldown: [
        HttpStatus.TOO_MANY_REQUESTS,
        "AI_HELP_REQUEST_COOLDOWN",
        "잠시 뒤 AI 도움을 다시 요청할 수 있습니다.",
      ],
      ai_help_request_in_progress: [
        HttpStatus.CONFLICT,
        "AI_HELP_REQUEST_IN_PROGRESS",
        "이전 AI 도움 요청을 처리하고 있습니다.",
      ],
      ai_help_request_phase_not_allowed: [
        HttpStatus.CONFLICT,
        "AI_HELP_REQUEST_PHASE_NOT_ALLOWED",
        "현재 단계에서는 AI 도움을 요청할 수 없습니다.",
      ],
      active_membership_required: [
        HttpStatus.FORBIDDEN,
        "ACTIVE_MEMBERSHIP_REQUIRED",
        "현재 참가 중인 회원만 세션에 접속할 수 있습니다.",
      ],
      command_payload_mismatch: [
        HttpStatus.CONFLICT,
        "COMMAND_PAYLOAD_MISMATCH",
        "같은 요청 식별자가 다른 내용에 사용되었습니다.",
      ],
      message_body_invalid: [
        HttpStatus.BAD_REQUEST,
        "MESSAGE_BODY_INVALID",
        "메시지는 공백이 아닌 1자 이상 2,000자 이하의 텍스트여야 합니다.",
      ],
      message_write_not_allowed: [
        HttpStatus.CONFLICT,
        "MESSAGE_WRITE_NOT_ALLOWED",
        "현재 세션 단계에서는 새 메시지를 보낼 수 없습니다.",
      ],
      minimum_connected_participants_not_met: [
        HttpStatus.CONFLICT,
        "MINIMUM_CONNECTED_PARTICIPANTS_NOT_MET",
        "현재 접속 인원이 최소 시작 인원보다 적습니다.",
      ],
      phase_version_conflict: [
        HttpStatus.CONFLICT,
        "PHASE_VERSION_CONFLICT",
        "세션 상태가 변경되었습니다. 최신 상태를 확인해주세요.",
      ],
      room_canceled: [
        HttpStatus.CONFLICT,
        "ROOM_CANCELED",
        "취소된 토론방입니다.",
      ],
      room_host_required: [
        HttpStatus.FORBIDDEN,
        "ROOM_HOST_REQUIRED",
        "방장만 세션 운영 결정을 내릴 수 있습니다.",
      ],
      room_not_found: [
        HttpStatus.NOT_FOUND,
        "ROOM_NOT_FOUND",
        "토론방을 찾을 수 없습니다.",
      ],
      reply_message_not_found: [
        HttpStatus.NOT_FOUND,
        "REPLY_MESSAGE_NOT_FOUND",
        "답장할 메시지를 현재 세션에서 찾을 수 없습니다.",
      ],
      session_connection_closed: [
        HttpStatus.CONFLICT,
        "SESSION_CONNECTION_CLOSED",
        "종료된 토론에는 다시 접속할 수 없습니다.",
      ],
      session_end_locked: [
        HttpStatus.CONFLICT,
        "SESSION_END_LOCKED",
        "이미 종료되었거나 현재 상태에서는 세션을 종료할 수 없습니다.",
      ],
      session_extension_locked: [
        HttpStatus.CONFLICT,
        "SESSION_EXTENSION_LOCKED",
        "연장 결정 시간이 지났거나 현재 상태에서는 연장할 수 없습니다.",
      ],
      session_synthesis_locked: [
        HttpStatus.CONFLICT,
        "SESSION_SYNTHESIS_LOCKED",
        "연장 결정 시간이 지났거나 현재 상태에서는 마무리를 시작할 수 없습니다.",
      ],
      session_cursor_invalid: [
        HttpStatus.BAD_REQUEST,
        "SESSION_CURSOR_INVALID",
        "세션 동기화 위치가 올바르지 않습니다.",
      ],
      session_message_limit_invalid: [
        HttpStatus.BAD_REQUEST,
        "SESSION_MESSAGE_LIMIT_INVALID",
        "요청한 메시지 개수가 허용 범위를 벗어났습니다.",
      ],
      session_not_found: [
        HttpStatus.NOT_FOUND,
        "SESSION_NOT_FOUND",
        "세션을 찾을 수 없습니다.",
      ],
      session_read_forbidden: [
        HttpStatus.FORBIDDEN,
        "SESSION_READ_FORBIDDEN",
        "이 세션을 열람할 권한이 없습니다.",
      ],
      session_start_locked: [
        HttpStatus.CONFLICT,
        "SESSION_START_LOCKED",
        "현재 상태에서는 토론을 시작할 수 없습니다.",
      ],
      session_start_too_early: [
        HttpStatus.CONFLICT,
        "SESSION_START_TOO_EARLY",
        "시작 예정 시각 이후에 토론을 시작할 수 있습니다.",
      ],
    } as const satisfies Record<string, readonly [HttpStatus, string, string]>;

    const match = mapped[error.code as keyof typeof mapped];
    if (match === undefined) {
      throw error;
    }
    throw new PublicHttpException(match[0], match[1], match[2]);
  }
}
