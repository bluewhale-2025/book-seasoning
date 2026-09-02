import { ProfileSchema } from "@bookseasoning/contracts/public";
import { describe, expect, it, vi } from "vitest";

import { AuthenticatedHttpClient, type HttpClientError } from "./http-client";

const profile = {
  userId: "90000000-0000-4000-8000-000000000001",
  profileName: "지윤",
  role: "USER",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AuthenticatedHttpClient", () => {
  it("adds the current bearer token and parses the response contract", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(profile));
    const client = new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "access-token",
      fetcher,
    });

    await expect(client.request("/v1/me/profile", { method: "GET" }, ProfileSchema)).resolves.toEqual(profile);
    expect(fetcher).toHaveBeenCalledWith(
      "http://api.test/v1/me/profile",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer access-token" }),
      }),
    );
  });

  it("does not send a request or expose protected data without a session", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const onAuthRequired = vi.fn();
    const client = new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => null,
      onAuthRequired,
      fetcher,
    });

    await expect(client.request("/v1/me/profile", { method: "GET" }, ProfileSchema)).rejects.toEqual(
      expect.objectContaining<Partial<HttpClientError>>({ code: "AUTH_REQUIRED", status: 401 }),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(onAuthRequired).toHaveBeenCalledOnce();
  });

  it("refreshes once and retries only for AUTH_REQUIRED", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ code: "AUTH_REQUIRED", message: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse(profile));
    const refreshAccessToken = vi.fn().mockResolvedValue("fresh-token");
    const client = new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "expired-token",
      refreshAccessToken,
      fetcher,
    });

    await expect(client.request("/v1/me/profile", { method: "GET" }, ProfileSchema)).resolves.toEqual(profile);
    expect(refreshAccessToken).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "http://api.test/v1/me/profile",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer fresh-token" }),
      }),
    );
  });

  it("does not treat another 401 code as a global logout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ code: "CURRENT_PASSWORD_INVALID", message: "invalid password" }, 401),
    );
    const refreshAccessToken = vi.fn();
    const onAuthRequired = vi.fn();
    const client = new AuthenticatedHttpClient({
      apiBaseUrl: "http://api.test",
      getAccessToken: async () => "token",
      refreshAccessToken,
      onAuthRequired,
      fetcher,
    });

    await expect(client.request("/v1/account", { method: "DELETE" }, ProfileSchema)).rejects.toEqual(
      expect.objectContaining<Partial<HttpClientError>>({ code: "CURRENT_PASSWORD_INVALID" }),
    );
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(onAuthRequired).not.toHaveBeenCalled();
  });
});
