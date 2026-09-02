import { describe, expect, it } from "vitest";

import { AdminBookSearchResponseSchema } from "@bookseasoning/contracts/admin";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import type { RuntimeEnvironment } from "../../config/environment.js";
import {
  BookSelectionTokenError,
  BookSelectionTokenService,
} from "./book-selection-token.service.js";

const environment: RuntimeEnvironment = {
  nodeEnv: "test",
  runtime: "api",
  host: "127.0.0.1",
  port: 3000,
  logLevel: "error",
  release: "test",
  corsOrigins: ["http://localhost:5173"],
  commandFingerprintKey: "test-command-fingerprint-key-000000000000",
};
const book = {
  provider: "KAKAO" as const,
  externalBookId: "isbn13:9788937460449",
  title: "데미안",
  authors: ["헤르만 헤세"],
  translators: ["전영애"],
  publisher: "민음사",
  publishedDate: "2000-12-20",
  isbn10: "8937460440",
  isbn13: "9788937460449",
  thumbnailUrl: "https://example.test/demian.jpg",
  description: "자기 자신에게 이르는 길",
  detailUrl: "https://example.test/demian",
};

describe("BookSelectionTokenService", () => {
  it("round-trips a server-selected catalog book", () => {
    const service = new BookSelectionTokenService(environment, () => 1_000);
    expect(service.verify(service.issue(book))).toEqual(book);
  });

  it("uses a public-safe field name for the signed selection proof", () => {
    const service = new BookSelectionTokenService(environment, () => 1_000);
    const response = AdminBookSearchResponseSchema.parse({
      query: "데미안",
      page: 1,
      isEnd: true,
      results: [{ ...book, selectionProof: service.issue(book) }],
    });

    expect(() => assertPublicPayloadKeys(response)).not.toThrow();
  });

  it("rejects tampered and expired selections", () => {
    const issuer = new BookSelectionTokenService(environment, () => 1_000);
    const token = issuer.issue(book);
    expect(() => issuer.verify(`${token}x`)).toThrow(BookSelectionTokenError);
    expect(() => new BookSelectionTokenService(environment, () => 1_000 + 10 * 60_000 + 1).verify(token))
      .toThrowError(expect.objectContaining({ code: "BOOK_SELECTION_EXPIRED" }));
  });
});
