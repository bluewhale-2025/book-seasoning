import { z } from "zod";

import { ProfileSchema, type Profile } from "@bookseasoning/contracts/public";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { rethrowSupabaseDependencyError } from "../../infrastructure/supabase/supabase-error.js";
import { createUserSupabaseClient } from "../../infrastructure/supabase/user-client.js";
import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { ProfileGateway } from "./profile.gateway.js";

const ProfileRowSchema = z.strictObject({
  user_id: z.uuid(),
  profile_name: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
  updated_at: z.iso.datetime({ offset: true }),
});

const UpdatedProfileRowSchema = ProfileRowSchema.omit({ role: true });

export function mapProfileRow(row: unknown, expectedUserId: string): Profile {
  const parsed = ProfileRowSchema.parse(row);

  if (parsed.user_id !== expectedUserId) {
    throw new Error("profile_actor_mismatch");
  }

  return ProfileSchema.parse({
    userId: parsed.user_id,
    profileName: parsed.profile_name,
    role: parsed.role,
    updatedAt: new Date(parsed.updated_at).toISOString(),
  });
}

export class SupabaseProfileGateway implements ProfileGateway {
  public constructor(private readonly environment: RuntimeEnvironment) {}

  public async getOwnProfile(actor: AuthenticatedActor): Promise<Profile> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .from("profiles")
      .select("user_id, profile_name, role, updated_at")
      .eq("user_id", actor.userId)
      .single();

    if (error !== null) {
      rethrowSupabaseDependencyError(error);
      throw new Error("profile_read_failed");
    }

    return mapProfileRow(data, actor.userId);
  }

  public async updateOwnProfile(
    actor: AuthenticatedActor,
    profileName: string,
  ): Promise<Profile> {
    const client = createUserSupabaseClient(this.environment, actor);
    const { data, error } = await client
      .rpc("update_my_profile", { p_profile_name: profileName })
      .single();

    if (error !== null) {
      rethrowSupabaseDependencyError(error);
      throw new Error("profile_update_failed");
    }

    UpdatedProfileRowSchema.parse(data);
    return this.getOwnProfile(actor);
  }

}
