import { Controller, Get, HttpStatus, Inject, Module, Param, ParseUUIDPipe, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import { AdminAiDiagnosticsSchema } from "@bookseasoning/contracts/admin";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicHttpException } from "../../http/public-http.exception.js";
import { rethrowSupabaseDependencyError } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import { CurrentActor } from "../auth/current-actor.decorator.js";

@Controller("v1/admin/rooms")
export class AiDiagnosticsController {
  public constructor(@Inject(RUNTIME_ENVIRONMENT) private readonly environment: RuntimeEnvironment) {}

  @Get(":roomId/ai-diagnostics")
  public async get(
    @CurrentActor() actor: AuthenticatedActor,
    @Param("roomId", new ParseUUIDPipe()) roomId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header("Cache-Control", "no-store");
    // The RPC checks both ADMIN role and normal session-read access using auth.uid().
    const { data, error } = await createUserSupabaseClient(this.environment, actor)
      .rpc("admin_read_session_ai_diagnostics", { p_room_id: roomId });
    if (error !== null) {
      rethrowSupabaseDependencyError(error);
      if (error.message === "admin_required" || error.message === "session_access_denied") {
        throw new PublicHttpException(HttpStatus.FORBIDDEN, "FORBIDDEN", "이 작업을 수행할 권한이 없습니다.");
      }
      throw new Error("ai_diagnostics_read_failed");
    }
    const result = AdminAiDiagnosticsSchema.parse(data);
    assertPublicPayloadKeys(result);
    return result;
  }
}

@Module({ controllers: [AiDiagnosticsController] })
export class AiDiagnosticsModule {}
