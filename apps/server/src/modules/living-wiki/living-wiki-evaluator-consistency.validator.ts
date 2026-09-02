import { isDeepStrictEqual } from "node:util";

import { Injectable } from "@nestjs/common";

import type {
  LivingWikiDocumentV1,
  PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

export class LivingWikiEvaluatorConsistencyError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "LivingWikiEvaluatorConsistencyError";
  }
}

@Injectable()
export class LivingWikiEvaluatorConsistencyValidator {
  public assertConsistent(
    output: PublicEvaluatorOutputV1,
    document: LivingWikiDocumentV1,
  ): void {
    if (!isDeepStrictEqual(output.metrics, document.metricsAndKeyChanges.metrics)) {
      this.fail("EVALUATOR_WIKI_METRICS_MISMATCH");
    }
    if (!isDeepStrictEqual(output.currentTopic, document.currentTopic)) {
      this.fail("EVALUATOR_WIKI_TOPIC_MISMATCH");
    }
    this.assertExactSubset(
      output.majorPerspectives,
      document.perspectiveMap,
      (item) => item.perspectiveId,
      "EVALUATOR_WIKI_PERSPECTIVE_MISMATCH",
    );
    this.assertExactSubset(
      output.bookGrounding,
      document.bookGrounding,
      (item) => item.groundingId,
      "EVALUATOR_WIKI_BOOK_GROUNDING_MISMATCH",
    );
    this.assertExactSubset(
      output.participation,
      document.participantState,
      (item) => item.participantId,
      "EVALUATOR_WIKI_PARTICIPATION_MISMATCH",
    );
  }

  private assertExactSubset<T>(
    selected: readonly T[],
    canonical: readonly T[],
    key: (item: T) => string,
    code: string,
  ): void {
    const canonicalById = new Map(canonical.map((item) => [key(item), item]));
    if (
      selected.some((item) => {
        const stored = canonicalById.get(key(item));
        return stored === undefined || !isDeepStrictEqual(item, stored);
      })
    ) {
      this.fail(code);
    }
  }

  private fail(code: string): never {
    throw new LivingWikiEvaluatorConsistencyError(code);
  }
}
