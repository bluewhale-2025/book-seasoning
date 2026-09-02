import type { PublicEvaluatorOutputV1 } from "@bookseasoning/contracts/internal";

import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";

export const REUSABLE_PUBLIC_EVALUATION_REPOSITORY = Symbol(
  "REUSABLE_PUBLIC_EVALUATION_REPOSITORY",
);

export interface ReusablePublicEvaluationRepository {
  findForSameCursor(
    job: ClaimedAiJob,
  ): Promise<PublicEvaluatorOutputV1 | null>;
}
