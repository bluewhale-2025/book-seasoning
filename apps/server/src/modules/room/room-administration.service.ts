import { Inject, Injectable } from "@nestjs/common";

import type {
  CancelRoomRequest,
  CreateRoomRequest,
  CreateRoomResponse,
  RemoveRoomMemberRequest,
  RoomCommandResponse,
  TransferHostRequest,
  UpdateRoomRequest,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { rethrowRoomError } from "./room-error.mapper.js";
import {
  ROOM_ADMINISTRATION_GATEWAY,
  type RoomAdministrationGateway,
  type RoomCommandGatewayInput,
} from "./room.gateway.js";
import {
  ROOM_PASSWORD_HASHER,
  type RoomPasswordHasher,
} from "./room-password-hasher.js";

type AdministrationCommand =
  | Readonly<{ type: "CANCEL_ROOM"; request: CancelRoomRequest }>
  | Readonly<{ type: "TRANSFER_HOST"; request: TransferHostRequest }>
  | Readonly<{ type: "REMOVE_MEMBER"; request: RemoveRoomMemberRequest }>;

@Injectable()
export class RoomAdministrationService {
  public constructor(
    @Inject(ROOM_ADMINISTRATION_GATEWAY)
    private readonly gateway: RoomAdministrationGateway,
    @Inject(ROOM_PASSWORD_HASHER) private readonly passwordHasher: RoomPasswordHasher,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public async create(
    actor: AuthenticatedActor,
    request: CreateRoomRequest,
  ): Promise<CreateRoomResponse> {
    const { password, ...payload } = request.payload;
    try {
      return await this.gateway.create(actor, {
        commandId: request.commandId,
        requestFingerprint: this.fingerprint("CREATE_ROOM", request.payload),
        payload: { ...payload, passwordHash: await this.passwordHasher.hash(password) },
      });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async update(
    actor: AuthenticatedActor,
    roomId: string,
    request: UpdateRoomRequest,
  ): Promise<RoomCommandResponse> {
    const { password, ...payload } = request.payload;
    try {
      return await this.gateway.update(actor, {
        commandId: request.commandId,
        requestFingerprint: this.fingerprint("UPDATE_ROOM", {
          roomId,
          expectedVersion: request.expectedVersion,
          ...request.payload,
        }),
        roomId,
        expectedVersion: request.expectedVersion,
        payload: {
          ...payload,
          ...(password === undefined
            ? {}
            : { passwordHash: await this.passwordHasher.hash(password) }),
        },
      });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public cancelRoom(
    actor: AuthenticatedActor,
    roomId: string,
    request: CancelRoomRequest,
  ): Promise<RoomCommandResponse> {
    return this.execute(actor, roomId, { type: "CANCEL_ROOM", request });
  }

  public transferHost(
    actor: AuthenticatedActor,
    roomId: string,
    request: TransferHostRequest,
  ): Promise<RoomCommandResponse> {
    return this.execute(actor, roomId, { type: "TRANSFER_HOST", request });
  }

  public removeMember(
    actor: AuthenticatedActor,
    roomId: string,
    request: RemoveRoomMemberRequest,
  ): Promise<RoomCommandResponse> {
    return this.execute(actor, roomId, { type: "REMOVE_MEMBER", request });
  }

  private async execute(
    actor: AuthenticatedActor,
    roomId: string,
    command: AdministrationCommand,
  ): Promise<RoomCommandResponse> {
    const { request } = command;
    const input: RoomCommandGatewayInput = {
      commandId: request.commandId,
      requestFingerprint: this.fingerprint(command.type, {
        roomId,
        expectedVersion: request.expectedVersion,
        ...request.payload,
      }),
      roomId,
      expectedVersion: request.expectedVersion,
      ...(command.type === "CANCEL_ROOM"
        ? {}
        : { targetUserId: command.request.payload.targetUserId }),
    };
    try {
      if (command.type === "CANCEL_ROOM") {
        return await this.gateway.cancelRoom(actor, input);
      }
      if (command.type === "TRANSFER_HOST") {
        return await this.gateway.transferHost(actor, input);
      }
      return await this.gateway.removeMember(actor, input);
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
