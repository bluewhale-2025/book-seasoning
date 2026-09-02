import { describe, expect, it } from "vitest";

import {
  PublicPayloadPrivacyError,
  assertPublicPayloadKeys,
} from "./public-payload.js";

describe("assertPublicPayloadKeys", () => {
  it("allows a public health response", () => {
    expect(() =>
      assertPublicPayloadKeys({ status: "ok", release: "local" }),
    ).not.toThrow();
  });

  it.each(["ai_private", "privatePrompt", "accessToken", "passwordHash"])(
    "rejects the forbidden key %s",
    (key) => {
      expect(() => assertPublicPayloadKeys({ [key]: "canary" })).toThrow(
        PublicPayloadPrivacyError,
      );
    },
  );

  it("allows public session deadline metadata", () => {
    expect(() =>
      assertPublicPayloadKeys({ extensionPromptedAt: "2026-09-01T12:23:00.000Z" }),
    ).not.toThrow();
  });
});
