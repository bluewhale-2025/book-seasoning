import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import {
  HostHelpReasonSchema,
  PolicyTriggerSchema,
} from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  AiOrchestrationDirective,
  AiOrchestrationRepository,
  ExtensionOpinionCommitResult,
} from "./ai-orchestration.repository.js";
import type { ClaimedAiJob } from "./ai-job.queue.js";

const DirectiveRowSchema = z.strictObject({
  trigger: PolicyTriggerSchema,
  host_help_reason: HostHelpReasonSchema.nullable(),
  extension_phase_version: z.coerce.number().int().positive().nullable(),
  refresh_no: z.coerce.number().int().nonnegative(),
});

const BooleanResultSchema = z.strictObject({ result: z.boolean() });

const ExtensionCommitRowSchema = z.strictObject({
  commit_status: z.enum(["COMMITTED", "SUPPRESSED_STALE"]),
  suppression_reason: z.string().nullable(),
  duplicate: z.boolean(),
});

@Injectable()
export class PostgresAiOrchestrationRepository
  implements AiOrchestrationRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async readDirective(
    job: ClaimedAiJob,
  ): Promise<AiOrchestrationDirective | null> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.read_ai_orchestration_directive(
        ${job.jobId}::uuid,
        ${job.attemptNo}
      )
    `);
    if (rows.length === 0) return null;
    const row = DirectiveRowSchema.parse(rows[0]);
    return {
      trigger: row.trigger,
      hostHelpReason: row.host_help_reason,
      extensionPhaseVersion: row.extension_phase_version,
      refreshNo: row.refresh_no,
    };
  }

  public async refreshStaleJob(job: ClaimedAiJob): Promise<boolean> {
    const rows = await this.database.execute<unknown>(sql`
      select private.refresh_ai_orchestration_job(
        ${job.jobId}::uuid,
        ${job.attemptNo}
      ) as result
    `);
    return BooleanResultSchema.parse(rows[0]).result;
  }

  public async commitExtensionOpinion(
    input: Parameters<AiOrchestrationRepository["commitExtensionOpinion"]>[0],
  ): Promise<ExtensionOpinionCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_ai_extension_opinion(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.expectedPhase},
        ${input.expectedPhaseVersion},
        ${input.policyActionId}::uuid,
        ${input.policy}::jsonb,
        ${input.output}::jsonb
      )
    `);
    const row = ExtensionCommitRowSchema.parse(rows[0]);
    return {
      status: row.commit_status,
      suppressionReason: row.suppression_reason,
      duplicate: row.duplicate,
    };
  }
}
