import { describe, expect, it, vi } from "vitest";

import type { Profile } from "@bookseasoning/contracts/public";

import type { AuthenticatedActor } from "../auth/auth.types.js";
import type { ProfileGateway } from "./profile.gateway.js";
import { ProfileService } from "./profile.service.js";

const actor: AuthenticatedActor = {
  userId: "10000000-0000-4000-8000-000000000001",
  accessToken: "private-token",
};
const profile: Profile = {
  userId: actor.userId,
  profileName: "독서가",
  role: "USER",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

describe("ProfileService", () => {
  it("uses the authenticated actor for reads", async () => {
    const gateway: ProfileGateway = {
      getOwnProfile: vi.fn().mockResolvedValue(profile),
      updateOwnProfile: vi.fn(),
    };
    const service = new ProfileService(gateway);

    await expect(service.getOwnProfile(actor)).resolves.toEqual(profile);
    expect(gateway.getOwnProfile).toHaveBeenCalledWith(actor);
  });

  it("passes the normalized profile name to the command gateway", async () => {
    const updated = { ...profile, profileName: "새 이름" };
    const gateway: ProfileGateway = {
      getOwnProfile: vi.fn(),
      updateOwnProfile: vi.fn().mockResolvedValue(updated),
    };
    const service = new ProfileService(gateway);

    await expect(service.updateOwnProfile(actor, "새 이름")).resolves.toEqual(
      updated,
    );
    expect(gateway.updateOwnProfile).toHaveBeenCalledWith(actor, "새 이름");
  });
});
