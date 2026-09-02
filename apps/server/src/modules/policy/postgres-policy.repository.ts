import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import { PolicyActionSchema } from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  CommitPolicyDecisionInput,
  PolicyCommitResult,
  PolicyRepository,
} from "./policy.repository.js";

const CommitRowSchema = z.strictObject({
  policy_action_id: z.uuid().nullable(),
  commit_status: z.enum(["COMMITTED", "SUPPRESSED_STALE"]),
  action: PolicyActionSchema,
  suppression_reason: z.string().nullable(),
  duplicate: z.boolean(),
});

@Injectable()
export class PostgresPolicyRepository implements PolicyRepository {
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async commitDecision(
    input: CommitPolicyDecisionInput,
  ): Promise<PolicyCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_policy_decision(
        ${input.jobId}::uuid,
        ${input.attemptNo},
        ${input.expectedPhase},
        ${input.expectedPhaseVersion},
        ${input.decision}::jsonb
      )
    `);
    const row = CommitRowSchema.parse(rows[0]);
    return {
      policyActionId: row.policy_action_id,
      status: row.commit_status,
      action: row.action,
      suppressionReason: row.suppression_reason,
      duplicate: row.duplicate,
    };
  }
}
