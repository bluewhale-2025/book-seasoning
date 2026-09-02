import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  AiPublicMessageCommitResult,
  AiPublicMessageRepository,
  CommitHostInterventionInput,
  CommitOpeningInput,
  FailHostInterventionInput,
} from "./ai-public-message.repository.js";

const CommitRowSchema = z.strictObject({
  commit_status: z.enum(["COMMITTED", "SUPPRESSED_STALE"]),
  message_id: z.uuid().nullable(),
  message_seq: z.coerce.number().int().positive().nullable(),
  suppression_reason: z.string().nullable(),
  duplicate: z.boolean(),
  phase_transitioned: z.boolean(),
});

@Injectable()
export class PostgresAiPublicMessageRepository
  implements AiPublicMessageRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async commitOpening(
    input: CommitOpeningInput,
  ): Promise<AiPublicMessageCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_ai_opening(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.context.session.phaseVersion},
        ${input.output}::jsonb,
        ${input.providerRun}::jsonb,
        ${input.fallbackUsed}
      )
    `);
    return this.map(rows[0]);
  }

  public async commitHostIntervention(
    input: CommitHostInterventionInput,
  ): Promise<AiPublicMessageCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_ai_host_intervention(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.expectedPhase},
        ${input.expectedPhaseVersion},
        ${input.policyActionId}::uuid,
        ${input.policy}::jsonb,
        ${input.output}::jsonb,
        ${input.providerRun}::jsonb
      )
    `);
    return this.map(rows[0]);
  }

  public async failHostIntervention(
    input: FailHostInterventionInput,
  ): Promise<void> {
    await this.database.execute(sql`
      select private.fail_ai_host_intervention(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.policyActionId}::uuid,
        ${input.errorCode}
      )
    `);
  }

  private map(value: unknown): AiPublicMessageCommitResult {
    const row = CommitRowSchema.parse(value);
    return {
      status: row.commit_status,
      messageId: row.message_id,
      messageSeq: row.message_seq,
      suppressionReason: row.suppression_reason,
      duplicate: row.duplicate,
      phaseTransitioned: row.phase_transitioned,
    };
  }
}
