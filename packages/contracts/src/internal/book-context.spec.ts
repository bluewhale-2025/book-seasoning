import { describe, expect, it } from "vitest";

import { BookContextDocumentV1Fixture } from "./book-context.fixture.js";
import { BookContextDocumentV1Schema } from "./book-context.js";

describe("BookContextDocumentV1Schema", () => {
  it("accepts the canonical seven-section fixture", () => {
    expect(BookContextDocumentV1Schema.parse(BookContextDocumentV1Fixture)).toEqual(
      BookContextDocumentV1Fixture,
    );
  });

  it("rejects evidence that points outside the document", () => {
    expect(() =>
      BookContextDocumentV1Schema.parse({
        ...BookContextDocumentV1Fixture,
        itemSources: [
          {
            ...BookContextDocumentV1Fixture.itemSources[0],
            itemId: "42000000-0000-4000-8000-000000000099",
          },
        ],
      }),
    ).toThrow();
  });
});

