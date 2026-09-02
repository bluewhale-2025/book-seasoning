import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";

import {
  HealthStatusSchema,
  type HealthStatus,
} from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";
import { PublicRoute } from "../auth/public-route.decorator.js";
import { HealthReadinessService } from "./health-readiness.service.js";

@PublicRoute()
@Controller("health")
export class HealthController {
  public constructor(
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
    @Inject(HealthReadinessService)
    private readonly readiness: HealthReadinessService,
  ) {}

  @Get("live")
  public live(): HealthStatus {
    return this.response("ok");
  }

  @Get("ready")
  public async ready(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<HealthStatus> {
    const status = (await this.readiness.check()) ? "ok" : "not_ready";
    reply.status(status === "ok" ? 200 : 503);
    return this.response(status);
  }

  private response(status: HealthStatus["status"]): HealthStatus {
    const payload = HealthStatusSchema.parse({
      status,
      service: "bookseasoning",
      runtime: this.environment.runtime,
      release: this.environment.release,
      timestamp: new Date().toISOString(),
    });

    assertPublicPayloadKeys(payload);
    return payload;
  }
}
