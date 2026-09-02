import { describe, expect, it } from "vitest";

import { loadWebEnvironment, WebEnvironmentError } from "./environment";

function source(overrides: Partial<ImportMetaEnv> = {}): ImportMetaEnv {
  return {
    BASE_URL: "/",
    MODE: "test",
    DEV: true,
    PROD: false,
    SSR: false,
    VITE_API_BASE_URL: "https://api-staging.book-seasoning.com",
    VITE_SUPABASE_URL: "https://project.example.test",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    ...overrides,
  };
}

describe("loadWebEnvironment", () => {
  it("keeps the browser-public Turnstile site key when configured", () => {
    expect(loadWebEnvironment(source({ VITE_TURNSTILE_SITE_KEY: " site-key " })))
      .toEqual({
        apiBaseUrl: "https://api-staging.book-seasoning.com",
        supabaseUrl: "https://project.example.test",
        supabasePublishableKey: "sb_publishable_test",
        turnstileSiteKey: "site-key",
      });
  });

  it("allows local CAPTCHA-off configuration to omit the site key", () => {
    expect(loadWebEnvironment(source()).turnstileSiteKey).toBeUndefined();
  });

  it("rejects a non-publishable Supabase browser key", () => {
    expect(() => loadWebEnvironment(source({
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden",
    }))).toThrow(WebEnvironmentError);
  });
});
