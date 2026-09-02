import { UnauthorizedException, createParamDecorator } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";

import type { AuthenticatedActor } from "./auth.types.js";

export const AUTHENTICATED_ACTOR = Symbol("AUTHENTICATED_ACTOR");

export type AuthenticatedRequest = {
  [AUTHENTICATED_ACTOR]?: AuthenticatedActor;
};

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedActor => {
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    const actor = request[AUTHENTICATED_ACTOR];

    if (actor === undefined) {
      throw new UnauthorizedException();
    }

    return actor;
  },
);
