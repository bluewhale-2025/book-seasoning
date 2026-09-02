import { Module } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { Argon2RoomPasswordHasher } from "./argon2-room-password-hasher.js";
import { RoomController } from "./room.controller.js";
import {
  ROOM_ADMINISTRATION_GATEWAY,
  ROOM_MEMBERSHIP_GATEWAY,
  ROOM_PREP_GATEWAY,
  ROOM_QUERY_GATEWAY,
} from "./room.gateway.js";
import { ROOM_PASSWORD_HASHER } from "./room-password-hasher.js";
import { RoomAdministrationService } from "./room-administration.service.js";
import { RoomMembershipService } from "./room-membership.service.js";
import { RoomPasswordAttemptLimiter } from "./room-password-attempt-limiter.js";
import { RoomPrepService } from "./room-prep.service.js";
import { RoomQueryService } from "./room-query.service.js";
import { SupabaseRoomGateway } from "./supabase-room.gateway.js";

@Module({
  controllers: [RoomController],
  providers: [
    RoomQueryService,
    RoomMembershipService,
    RoomAdministrationService,
    RoomPrepService,
    RoomPasswordAttemptLimiter,
    { provide: ROOM_PASSWORD_HASHER, useClass: Argon2RoomPasswordHasher },
    {
      provide: SupabaseRoomGateway,
      inject: [RUNTIME_ENVIRONMENT],
      useFactory: (environment: RuntimeEnvironment) => new SupabaseRoomGateway(environment),
    },
    { provide: ROOM_QUERY_GATEWAY, useExisting: SupabaseRoomGateway },
    { provide: ROOM_MEMBERSHIP_GATEWAY, useExisting: SupabaseRoomGateway },
    { provide: ROOM_ADMINISTRATION_GATEWAY, useExisting: SupabaseRoomGateway },
    { provide: ROOM_PREP_GATEWAY, useExisting: SupabaseRoomGateway },
  ],
})
export class RoomModule {}
