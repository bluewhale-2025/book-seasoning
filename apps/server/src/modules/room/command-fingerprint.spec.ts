import { describe, expect, it } from "vitest";

import { createCommandFingerprint } from "../../application/command-fingerprint.js";

describe("createCommandFingerprint", () => {
  it("is stable across object key order but changes with payload", () => {
    const key = "test-key-that-is-long-enough-for-hmac";
    const first = createCommandFingerprint(key, "JOIN_ROOM", { a: 1, b: 2 });
    const reordered = createCommandFingerprint(key, "JOIN_ROOM", { b: 2, a: 1 });
    const changed = createCommandFingerprint(key, "JOIN_ROOM", { a: 1, b: 3 });

    expect(reordered).toBe(first);
    expect(changed).not.toBe(first);
  });
});
