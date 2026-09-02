import { Inject, Injectable } from "@nestjs/common";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";

const READINESS_CACHE_MS = 10_000;
const READINESS_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthReadinessService {
  private cached: Readonly<{ ready: boolean; expiresAt: number }> | undefined;

  public constructor(
    @Inject(RUNTIME_ENVIRONMENT)
    private readonly environment: RuntimeEnvironment,
  ) {}

  public async check(): Promise<boolean> {
    const now = Date.now();
    if (this.cached !== undefined && this.cached.expiresAt > now) {
      return this.cached.ready;
    }
    const ready = await this.probeSupabase();
    this.cached = { ready, expiresAt: now + READINESS_CACHE_MS };
    return ready;
  }

  private async probeSupabase(): Promise<boolean> {
    const { supabaseUrl, supabasePublishableKey } = this.environment;
    if (supabaseUrl === undefined || supabasePublishableKey === undefined) {
      return this.environment.nodeEnv !== "production";
    }
    try {
      const endpoint = new URL("/auth/v1/health", supabaseUrl);
      const response = await fetch(endpoint, {
        headers: { apikey: supabasePublishableKey },
        method: "GET",
        signal: AbortSignal.timeout(READINESS_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
