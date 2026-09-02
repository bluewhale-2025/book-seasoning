import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import { DiscussionRecordContextV1Schema } from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  DiscussionRecordCommitResult,
  DiscussionResultRepository,
  SynthesisCommitResult,
} from "./discussion-result.repository.js";

const SynthesisCommitRowSchema = z.strictObject({
  commit_status: z.enum(["COMMITTED", "SUPPRESSED_STALE"]),
  message_id: z.uuid().nullable(),
  message_seq: z.coerce.number().int().positive().nullable(),
  suppression_reason: z.string().nullable(),
  duplicate: z.boolean(),
});

const RecordCommitRowSchema = z.strictObject({
  commit_status: z.literal("COMMITTED"),
  duplicate: z.boolean(),
});

@Injectable()
export class PostgresDiscussionResultRepository
  implements DiscussionResultRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async commitSynthesis(
    input: Parameters<DiscussionResultRepository["commitSynthesis"]>[0],
  ): Promise<SynthesisCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_ai_synthesis(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.context.session.phaseVersion},
        ${input.output}::jsonb,
        ${input.providerRun}::jsonb,
        ${input.fallbackUsed}
      )
    `);
    const row = SynthesisCommitRowSchema.parse(rows[0]);
    return {
      status: row.commit_status,
      messageId: row.message_id,
      messageSeq: row.message_seq,
      suppressionReason: row.suppression_reason,
      duplicate: row.duplicate,
    };
  }

  public async loadRecordContext(
    input: Parameters<DiscussionResultRepository["loadRecordContext"]>[0],
  ) {
    const rows = await this.database.execute<{ context: unknown }>(sql`
      select private.read_discussion_record_context(
        ${input.sessionId}::uuid,
        ${input.finalWikiVersion}
      ) as context
    `);
    return DiscussionRecordContextV1Schema.parse(rows[0]?.context);
  }

  public async commitRecord(
    input: Parameters<DiscussionResultRepository["commitRecord"]>[0],
  ): Promise<DiscussionRecordCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_discussion_record(
        ${input.job.jobId}::uuid,
        ${input.job.attemptNo},
        ${input.output}::jsonb
      )
    `);
    const row = RecordCommitRowSchema.parse(rows[0]);
    return { status: row.commit_status, duplicate: row.duplicate };
  }
}
