import { describe, expect, it, vi } from "vitest";

import { AuthenticatedHttpClient } from "./http-client";
import { HttpProfileApi } from "./profile-api";

const profile = {
  userId: "90000000-0000-4000-8000-000000000001",
  profileName: "지윤",
  role: "USER",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

describe("HttpProfileApi", () => {
  it("updates a profile through the public contract route", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...profile, profileName: "새 이름" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const api = new HttpProfileApi(
      new AuthenticatedHttpClient({
        apiBaseUrl: "http://api.test",
        getAccessToken: async () => "token",
        fetcher,
      }),
    );

    await expect(api.updateProfile({ profileName: "  새 이름  " })).resolves.toMatchObject({
      profileName: "새 이름",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/me/profile",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ profileName: "새 이름" }),
      }),
    );
  });
});
