import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";

import type {
  CancelMembershipRequest,
  JoinRoomRequest,
  JoinRoomResponse,
  RoomCommandResponse,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { rethrowRoomError } from "./room-error.mapper.js";
import {
  ROOM_MEMBERSHIP_GATEWAY,
  type RoomMembershipGateway,
} from "./room.gateway.js";
import { RoomPasswordAttemptLimiter } from "./room-password-attempt-limiter.js";
import {
  ROOM_PASSWORD_HASHER,
  type RoomPasswordHasher,
} from "./room-password-hasher.js";

@Injectable()
export class RoomMembershipService {
  public constructor(
    @Inject(ROOM_MEMBERSHIP_GATEWAY)
    private readonly gateway: RoomMembershipGateway,
    @Inject(ROOM_PASSWORD_HASHER) private readonly passwordHasher: RoomPasswordHasher,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
    @Inject(RoomPasswordAttemptLimiter)
    private readonly passwordAttemptLimiter: RoomPasswordAttemptLimiter,
  ) {}

  public async join(
    actor: AuthenticatedActor,
    roomId: string,
    request: JoinRoomRequest,
  ): Promise<JoinRoomResponse> {
    const requestFingerprint = this.fingerprint("JOIN_ROOM", {
      roomId,
      ...request.payload,
    });

    try {
      const challenge = await this.gateway.getJoinChallenge(actor, roomId);
      if (challenge.state === "ALREADY_MEMBER") {
        return await this.gateway.join(actor, {
          commandId: request.commandId,
          requestFingerprint,
          roomId,
        });
      }

      if (!this.passwordAttemptLimiter.isAllowed(actor.userId, roomId)) {
        throw new PublicHttpException(
          HttpStatus.TOO_MANY_REQUESTS,
          "ROOM_PASSWORD_RATE_LIMITED",
          "잠시 후 다시 시도해주세요.",
        );
      }

      const password = request.payload.password;
      if (password === undefined) {
        throw new PublicHttpException(
          HttpStatus.FORBIDDEN,
          "ROOM_PASSWORD_REQUIRED",
          "참가 패스워드를 입력해주세요.",
        );
      }
      if (!(await this.passwordHasher.verify(challenge.passwordHash, password))) {
        this.passwordAttemptLimiter.recordFailure(actor.userId, roomId);
        await this.gateway.recordPasswordFailure(actor, roomId);
        throw new PublicHttpException(
          HttpStatus.FORBIDDEN,
          "ROOM_PASSWORD_INVALID",
          "패스워드가 올바르지 않습니다.",
        );
      }

      const authorizationToken = randomBytes(32).toString("base64url");
      const tokenHash = createHash("sha256").update(authorizationToken).digest("hex");
      await this.gateway.authorizeJoin(
        actor,
        roomId,
        challenge.passwordVersion,
        tokenHash,
      );
      const result = await this.gateway.join(actor, {
        commandId: request.commandId,
        requestFingerprint,
        roomId,
        authorizationToken,
      });
      this.passwordAttemptLimiter.clear(actor.userId, roomId);
      return result;
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async cancelMembership(
    actor: AuthenticatedActor,
    roomId: string,
    request: CancelMembershipRequest,
  ): Promise<RoomCommandResponse> {
    try {
      return await this.gateway.cancelMembership(actor, {
        commandId: request.commandId,
        requestFingerprint: this.fingerprint("CANCEL_MEMBERSHIP", {
          roomId,
          expectedVersion: request.expectedVersion,
          ...request.payload,
        }),
        roomId,
        expectedVersion: request.expectedVersion,
      });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  private fingerprint(commandType: string, payload: unknown): string {
    return createCommandFingerprint(
      this.environment.commandFingerprintKey,
      commandType,
      payload,
    );
  }
}
