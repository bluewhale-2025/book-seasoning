import { Inject, Injectable } from "@nestjs/common";

import {
  PrepEntriesResponseSchema,
  type DeletePrepEntryRequest,
  type PrepEntriesResponse,
  type PrepEntryCommandResponse,
  type UpsertPrepEntryRequest,
} from "@bookseasoning/contracts/public";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";
import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { rethrowRoomError } from "./room-error.mapper.js";
import { ROOM_PREP_GATEWAY, type RoomPrepGateway } from "./room.gateway.js";

@Injectable()
export class RoomPrepService {
  public constructor(
    @Inject(ROOM_PREP_GATEWAY) private readonly gateway: RoomPrepGateway,
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public async listPrep(
    actor: AuthenticatedActor,
    roomId: string,
  ): Promise<PrepEntriesResponse> {
    try {
      return PrepEntriesResponseSchema.parse({
        items: await this.gateway.listPrep(actor, roomId),
      });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async upsertPrep(
    actor: AuthenticatedActor,
    roomId: string,
    request: UpsertPrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    try {
      return await this.gateway.upsertPrep(actor, {
        commandId: request.commandId,
        requestFingerprint: this.fingerprint("UPSERT_PREP", {
          roomId,
          ...request.payload,
        }),
        roomId,
        payload: request.payload,
      });
    } catch (error) {
      rethrowRoomError(error);
    }
  }

  public async deletePrep(
    actor: AuthenticatedActor,
    roomId: string,
    request: DeletePrepEntryRequest,
  ): Promise<PrepEntryCommandResponse> {
    try {
      return await this.gateway.deletePrep(actor, {
        commandId: request.commandId,
        requestFingerprint: this.fingerprint("DELETE_PREP", {
          roomId,
          ...request.payload,
        }),
        roomId,
        payload: request.payload,
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
