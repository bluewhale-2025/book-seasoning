import { argon2id, hash, verify } from "argon2";

import type { RoomPasswordHasher } from "./room-password-hasher.js";

const ARGON2_MEMORY_KIB = 19 * 1024;
const ARGON2_TIME_COST = 2;
const ARGON2_PARALLELISM = 1;

export class Argon2RoomPasswordHasher implements RoomPasswordHasher {
  public hash(password: string): Promise<string> {
    return hash(password, {
      type: argon2id,
      memoryCost: ARGON2_MEMORY_KIB,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
    });
  }

  public verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }
}
