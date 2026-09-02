import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { SupabaseAuthApi, type AuthClientError } from "./auth-api";

function supabaseWith(auth: object): SupabaseClient {
  return { auth } as unknown as SupabaseClient;
}

describe("SupabaseAuthApi", () => {
  it("sends the required profile_name metadata and CAPTCHA token when signing up", async () => {
    const signUp = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "90000000-0000-4000-8000-000000000001",
          email: "reader@example.com",
        },
      },
      error: null,
    });
    const api = new SupabaseAuthApi(supabaseWith({ signUp }));

    await expect(api.signUp({
      email: "reader@example.com",
      password: "secret-password",
      profileName: "독서가",
      captchaToken: "challenge-token",
    })).resolves.toEqual({
      userId: "90000000-0000-4000-8000-000000000001",
      email: "reader@example.com",
    });
    expect(signUp).toHaveBeenCalledWith({
      email: "reader@example.com",
      password: "secret-password",
      options: {
        data: { profile_name: "독서가" },
        captchaToken: "challenge-token",
      },
    });
  });

  it("maps duplicate signup errors to a stable client code", async () => {
    const api = new SupabaseAuthApi(
      supabaseWith({
        signUp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: "user_already_exists", message: "provider-specific text" },
        }),
      }),
    );

    await expect(api.signUp({
      email: "reader@example.com",
      password: "secret-password",
      profileName: "독서가",
    })).rejects.toEqual(
      expect.objectContaining<Partial<AuthClientError>>({ code: "EMAIL_ALREADY_EXISTS" }),
    );
  });

  it("passes the CAPTCHA token when signing in", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: {
        user: {
          id: "90000000-0000-4000-8000-000000000001",
          email: "reader@example.com",
        },
      },
      error: null,
    });
    const api = new SupabaseAuthApi(supabaseWith({ signInWithPassword }));

    await api.signIn("reader@example.com", "secret-password", "challenge-token");

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "reader@example.com",
      password: "secret-password",
      options: { captchaToken: "challenge-token" },
    });
  });

  it("maps provider CAPTCHA failures to a stable client code", async () => {
    const api = new SupabaseAuthApi(
      supabaseWith({
        signUp: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { code: "captcha_failed", message: "provider-specific text" },
        }),
      }),
    );

    await expect(api.signUp({
      email: "reader@example.com",
      password: "secret-password",
      profileName: "독서가",
      captchaToken: "expired-token",
    })).rejects.toEqual(
      expect.objectContaining<Partial<AuthClientError>>({ code: "CAPTCHA_FAILED" }),
    );
  });

  it("passes the exact reset callback without exposing provider response text", async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    const api = new SupabaseAuthApi(supabaseWith({ resetPasswordForEmail }));

    await api.requestPasswordReset(
      "reader@example.com",
      "http://localhost:5173/auth/reset",
      "challenge-token",
    );
    expect(resetPasswordForEmail).toHaveBeenCalledWith("reader@example.com", {
      redirectTo: "http://localhost:5173/auth/reset",
      captchaToken: "challenge-token",
    });
  });
});
