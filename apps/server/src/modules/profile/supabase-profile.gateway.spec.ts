import { describe, expect, it } from "vitest";

import { mapProfileRow } from "./supabase-profile.gateway.js";

describe("mapProfileRow", () => {
  it("normalizes a Postgres timestamp before publishing the profile", () => {
    expect(
      mapProfileRow(
        {
          user_id: "10000000-0000-4000-8000-000000000001",
          profile_name: "독서가",
          role: "ADMIN",
          updated_at: "2026-09-01T12:30:00+00:00",
        },
        "10000000-0000-4000-8000-000000000001",
      ),
    ).toEqual({
      userId: "10000000-0000-4000-8000-000000000001",
      profileName: "독서가",
      role: "ADMIN",
      updatedAt: "2026-09-01T12:30:00.000Z",
    });
  });

  it("rejects a row belonging to another actor", () => {
    expect(() =>
      mapProfileRow(
        {
          user_id: "10000000-0000-4000-8000-000000000002",
          profile_name: "다른 사람",
          role: "USER",
          updated_at: "2026-09-01T12:30:00+00:00",
        },
        "10000000-0000-4000-8000-000000000001",
      ),
    ).toThrow("profile_actor_mismatch");
  });
});
