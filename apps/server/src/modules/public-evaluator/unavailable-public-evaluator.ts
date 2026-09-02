import { Injectable } from "@nestjs/common";

import type { PublicEvaluator, PublicEvaluatorInput } from "./public-evaluator.js";
import { PublicEvaluatorUnavailableError } from "./public-evaluator.js";

/** Replaced by the provider adapter in S5-8. */
@Injectable()
export class UnavailablePublicEvaluator implements PublicEvaluator {
  public evaluate(input: PublicEvaluatorInput): Promise<unknown> {
    void input;
    return Promise.reject(new PublicEvaluatorUnavailableError());
  }
}
