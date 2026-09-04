import { describe, expect, it, vi } from "vitest";

import type { ArgumentsHost } from "@nestjs/common";

import { SupabaseDependencyUnavailableException } from "../infrastructure/supabase/supabase-error.js";
import type { SafeLogger } from "./safe-logger.js";
import { SafeHttpExceptionFilter } from "./safe-http-exception.filter.js";

describe("SafeHttpExceptionFilter", () => {
  it("returns a generic 503 and records the safe Supabase dependency code", () => {
    const event = vi.fn();
    const logger = { event } as unknown as SafeLogger;
    const send = vi.fn();
    const status = vi.fn().mockReturnValue({ send });
    const request = {
      id: "10000000-0000-4000-8000-000000000001",
      method: "GET",
      routeOptions: { url: "/v1/rooms/mine" },
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    } as unknown as ArgumentsHost;

    new SafeHttpExceptionFilter(logger).catch(
      new SupabaseDependencyUnavailableException(),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(send).toHaveBeenCalledWith({
      code: "INTERNAL_ERROR",
      message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      requestId: request.id,
    });
    expect(event).toHaveBeenCalledWith("error", "http.request_failed", {
      dependencyCode: "SUPABASE_POSTGREST_JWT_TIME_STALE",
      method: "GET",
      route: "/v1/rooms/mine",
      statusCode: 503,
    });
  });
});
