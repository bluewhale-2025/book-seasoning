import { describe, expect, it } from "vitest";

import { Argon2RoomPasswordHasher } from "./argon2-room-password-hasher.js";

describe("Argon2RoomPasswordHasher", () => {
  it("creates a salted Argon2id PHC string with the accepted baseline", async () => {
    const hasher = new Argon2RoomPasswordHasher();
    const first = await hasher.hash("Case-Sensitive-42!");
    const second = await hasher.hash("Case-Sensitive-42!");

    expect(first).toMatch(/^\$argon2id\$v=19\$/);
    expect(first).toContain("m=19456");
    expect(first).toContain("t=2");
    expect(first).toContain("p=1");
    expect(second).not.toBe(first);
    await expect(hasher.verify(first, "Case-Sensitive-42!")).resolves.toBe(true);
  });

  it("keeps room passwords case-sensitive", async () => {
    const hasher = new Argon2RoomPasswordHasher();
    const passwordHash = await hasher.hash("Book42!");

    await expect(hasher.verify(passwordHash, "book42!")).resolves.toBe(false);
  });
});
