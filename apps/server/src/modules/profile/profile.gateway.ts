import type { Profile } from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";

export interface ProfileGateway {
  getOwnProfile(actor: AuthenticatedActor): Promise<Profile>;
  updateOwnProfile(
    actor: AuthenticatedActor,
    profileName: string,
  ): Promise<Profile>;
}

export const PROFILE_GATEWAY = Symbol("PROFILE_GATEWAY");
