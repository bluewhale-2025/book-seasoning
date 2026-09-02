import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import {
  AUTH_TOKEN_VERIFIER,
  type AuthTokenVerifier,
} from "./auth.types.js";
import {
  AUTHENTICATED_ACTOR,
  type AuthenticatedRequest,
} from "./current-actor.decorator.js";
import { IS_PUBLIC_ROUTE } from "./public-route.decorator.js";

@Injectable()
export class AuthGuard implements CanActivate {
  public constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AUTH_TOKEN_VERIFIER)
    private readonly verifier: AuthTokenVerifier,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic === true) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { headers: { authorization?: string } }>();
    const authorization = request.headers.authorization;
    const match = authorization?.match(/^Bearer ([^\s]+)$/);

    if (match?.[1] === undefined) {
      throw new UnauthorizedException();
    }

    request[AUTHENTICATED_ACTOR] = await this.verifier.verify(match[1]);
    return true;
  }
}
