export interface RoomPasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export const ROOM_PASSWORD_HASHER = Symbol("ROOM_PASSWORD_HASHER");
