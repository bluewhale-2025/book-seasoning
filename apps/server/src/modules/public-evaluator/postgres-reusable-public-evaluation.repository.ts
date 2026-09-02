import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import {
  PublicEvaluatorOutputV1Schema,
  type PublicEvaluatorOutputV1,
} from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type { ClaimedAiJob } from "../ai-jobs/ai-job.queue.js";
import type { ReusablePublicEvaluationRepository } from "./reusable-public-evaluation.repository.js";

const ReusableEvaluationRowSchema = z.strictObject({
  canonical_result: PublicEvaluatorOutputV1Schema,
});

@Injectable()
export class PostgresReusablePublicEvaluationRepository
  implements ReusablePublicEvaluationRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async findForSameCursor(
    job: ClaimedAiJob,
  ): Promise<PublicEvaluatorOutputV1 | null> {
    const rows = await this.database.execute<unknown>(sql`
      select canonical_result
      from private.read_reusable_public_evaluation(
        ${job.jobId}::uuid,
        ${job.attemptNo}
      )
    `);
    if (rows.length === 0) return null;
    return ReusableEvaluationRowSchema.parse(rows[0]).canonical_result;
  }
}
