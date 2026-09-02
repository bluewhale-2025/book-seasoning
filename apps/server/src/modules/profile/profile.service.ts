import { Inject, Injectable } from "@nestjs/common";

import type { Profile } from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";
import { PROFILE_GATEWAY, type ProfileGateway } from "./profile.gateway.js";

@Injectable()
export class ProfileService {
  public constructor(
    @Inject(PROFILE_GATEWAY)
    private readonly gateway: ProfileGateway,
  ) {}

  public getOwnProfile(actor: AuthenticatedActor): Promise<Profile> {
    return this.gateway.getOwnProfile(actor);
  }

  public updateOwnProfile(
    actor: AuthenticatedActor,
    profileName: string,
  ): Promise<Profile> {
    return this.gateway.updateOwnProfile(actor, profileName);
  }
}
