import { describe, expect, it, vi } from "vitest";

import { HttpAccountApi } from "./account-api";
import { AuthenticatedHttpClient } from "./http-client";

function createApi(fetcher: typeof fetch) {
  return new HttpAccountApi(new AuthenticatedHttpClient({
    apiBaseUrl: "http://api.test",
    getAccessToken: async () => "token",
    fetcher,
  }));
}

describe("HttpAccountApi", () => {
  it("loads the deletion impact preview", async () => {
    const preview = { allowed: false, blockers: ["ACTIVE_PARTICIPATION"], affected: { messages: 4, publicPrep: 1, privatePrep: 2, closingResponses: 0 } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(preview), { status: 200 }));
    await expect(createApi(fetcher).getDeletionPreview()).resolves.toEqual(preview);
    expect(fetcher).toHaveBeenCalledWith("http://api.test/v1/me/account/deletion-preview", expect.objectContaining({ method: "GET" }));
  });

  it("sends explicit permanent deletion confirmation", async () => {
    const response = { deletionId: "c1000000-0000-4000-8000-000000000001", status: "COMPLETED", duplicate: false, serverTime: "2026-09-02T10:00:00.000Z" };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    const request = { commandId: "c1000000-0000-4000-8000-000000000002", currentPassword: "current-password", confirmPermanentDeletion: true as const };
    await expect(createApi(fetcher).deleteAccount(request)).resolves.toEqual(response);
    expect(fetcher).toHaveBeenCalledWith("http://api.test/v1/me/account", expect.objectContaining({ method: "DELETE", body: JSON.stringify(request) }));
  });
});
