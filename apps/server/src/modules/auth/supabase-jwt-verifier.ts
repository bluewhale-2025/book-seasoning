import { ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import type { RuntimeEnvironment } from "../../config/environment.js";
import type {
  AuthenticatedActor,
  AuthTokenVerifier,
} from "./auth.types.js";

const AUTHENTICATED_AUDIENCE = "authenticated";
const SUPPORTED_ALGORITHMS = ["ES256", "RS256"] as const;

export class SupabaseJwtVerifier implements AuthTokenVerifier {
  private readonly issuer: string | undefined;
  private readonly keyResolver: JWTVerifyGetKey | undefined;

  public constructor(
    environment: RuntimeEnvironment,
    keyResolver?: JWTVerifyGetKey,
  ) {
    if (environment.supabaseUrl === undefined) {
      return;
    }

    this.issuer = `${environment.supabaseUrl.replace(/\/$/, "")}/auth/v1`;
    this.keyResolver =
      keyResolver ??
      createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
  }

  public async verify(accessToken: string): Promise<AuthenticatedActor> {
    if (this.issuer === undefined || this.keyResolver === undefined) {
      throw new ServiceUnavailableException();
    }

    try {
      const { payload } = await jwtVerify(accessToken, this.keyResolver, {
        algorithms: [...SUPPORTED_ALGORITHMS],
        audience: AUTHENTICATED_AUDIENCE,
        issuer: this.issuer,
      });

      if (
        typeof payload.sub !== "string" ||
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          payload.sub,
        ) === false ||
        payload.role !== AUTHENTICATED_AUDIENCE
      ) {
        throw new UnauthorizedException();
      }

      return { userId: payload.sub, accessToken };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new UnauthorizedException();
    }
  }
}
