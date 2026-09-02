import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import {
  AdminBookSelectionSchema,
  type AdminBookSelection,
} from "@bookseasoning/contracts/admin";

import type { RuntimeEnvironment } from "../../config/environment.js";

const BookSelectionTokenPayloadSchema = z.strictObject({
  schemaVersion: z.literal("book-selection.v1"),
  expiresAt: z.int().positive(),
  book: AdminBookSelectionSchema,
});

export class BookSelectionTokenError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "BookSelectionTokenError";
  }
}

export class BookSelectionTokenService {
  public constructor(
    private readonly environment: RuntimeEnvironment,
    private readonly now: () => number = Date.now,
  ) {}

  public issue(book: AdminBookSelection): string {
    const payload = Buffer.from(JSON.stringify({
      schemaVersion: "book-selection.v1",
      expiresAt: this.now() + 10 * 60_000,
      book,
    })).toString("base64url");
    const signature = this.sign(payload);
    return `v1.${payload}.${signature}`;
  }

  public verify(token: string): AdminBookSelection {
    const [version, payload, signature, extra] = token.split(".");
    if (version !== "v1" || !payload || !signature || extra !== undefined) {
      throw new BookSelectionTokenError("BOOK_SELECTION_INVALID");
    }
    const expected = Buffer.from(this.sign(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new BookSelectionTokenError("BOOK_SELECTION_INVALID");
    }

    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new BookSelectionTokenError("BOOK_SELECTION_INVALID");
    }
    const parsed = BookSelectionTokenPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      throw new BookSelectionTokenError("BOOK_SELECTION_INVALID");
    }
    if (parsed.data.expiresAt < this.now()) {
      throw new BookSelectionTokenError("BOOK_SELECTION_EXPIRED");
    }
    return parsed.data.book;
  }

  private sign(payload: string): string {
    return createHmac("sha256", this.environment.commandFingerprintKey)
      .update("book-selection.v1\0")
      .update(payload)
      .digest("base64url");
  }
}
