import { describe, expect, it } from "vitest";

import {
  ProfileSchema,
  UpdateProfileRequestSchema,
} from "./profile.js";

describe("profile contracts", () => {
  it("normalizes a required profile name", () => {
    expect(
      UpdateProfileRequestSchema.parse({ profileName: "  독서가  " }),
    ).toEqual({ profileName: "독서가" });
  });

  it("rejects blank and additional fields", () => {
    expect(() =>
      UpdateProfileRequestSchema.parse({ profileName: "   " }),
    ).toThrow();
    expect(() =>
      ProfileSchema.parse({
        userId: "10000000-0000-4000-8000-000000000001",
        profileName: "독서가",
        role: "USER",
        updatedAt: "2026-09-01T00:00:00.000Z",
        email: "private@example.test",
      }),
    ).toThrow();
  });
});
