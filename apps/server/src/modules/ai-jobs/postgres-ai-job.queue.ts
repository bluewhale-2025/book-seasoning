import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import {
  AiJobEnvelopeV1Schema,
  type AiJobEnvelopeV1,
} from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import type {
  AiJobQueue,
  ClaimedAiJob,
  ClaimAiJobsOptions,
  CompleteAiJobOutcome,
  EnqueueAiJobInput,
  EnqueueAiJobResult,
} from "./ai-job.queue.js";

const BigintIdSchema = z
  .union([z.string().regex(/^\d+$/), z.int().nonnegative(), z.bigint()])
  .transform((value) => value.toString());

const TimestampSchema = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString(),
  );

const QueueReadRowSchema = z.strictObject({
  queue_name: z.enum(["ai-session", "ai-record"]),
  queue_message_id: BigintIdSchema,
  queue_read_count: z.coerce.number().int().positive(),
  enqueued_at: TimestampSchema,
  lease_expires_at: TimestampSchema,
  message: z.unknown(),
});

const ClaimStateSchema = z.enum([
  "CLAIMED",
  "POISON",
  "TERMINAL_DUPLICATE",
  "LEASE_CONFLICT",
  "EXHAUSTED",
]);

const ClaimRowSchema = z.strictObject({
  claim_state: ClaimStateSchema,
  job_id: z.uuid().nullable(),
  job_type: z.string().nullable(),
  session_id: z.uuid().nullable(),
  base_wiki_version: z.coerce.number().int().nonnegative().nullable(),
  target_through_seq: z.coerce.number().int().nonnegative().nullable(),
  task_schema_version: z.string().nullable(),
  attempt_no: z.coerce.number().int().nonnegative().nullable(),
  max_attempts: z.coerce.number().int().positive().nullable(),
  lease_expires_at: TimestampSchema.nullable(),
});

const BooleanResultSchema = z.strictObject({ result: z.boolean() });
const EnqueueRowSchema = z.strictObject({
  job_id: z.uuid(),
  queue_message_id: BigintIdSchema,
  duplicate: z.boolean(),
});

const sameEnvelope = (
  queued: AiJobEnvelopeV1,
  authoritative: AiJobEnvelopeV1,
): boolean =>
  queued.schemaVersion === authoritative.schemaVersion &&
  queued.jobId === authoritative.jobId &&
  queued.jobType === authoritative.jobType &&
  queued.sessionId === authoritative.sessionId &&
  queued.baseWikiVersion === authoritative.baseWikiVersion &&
  queued.targetThroughSeq === authoritative.targetThroughSeq &&
  queued.taskSchemaVersion === authoritative.taskSchemaVersion;

@Injectable()
export class PostgresAiJobQueue implements AiJobQueue {
  private preferRecordNext = false;

  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public get configured(): boolean {
    return this.database.configured;
  }

  public async enqueue(input: EnqueueAiJobInput): Promise<EnqueueAiJobResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.enqueue_ai_session_job(
        ${input.jobKey},
        ${input.jobType},
        ${input.sessionId}::uuid,
        ${input.baseWikiVersion},
        ${input.targetThroughSeq}::bigint,
        ${input.taskSchemaVersion},
        ${input.requestId ?? null},
        ${input.maxAttempts ?? 3}
      )
    `);
    const row = EnqueueRowSchema.parse(rows[0]);
    return {
      jobId: row.job_id,
      queueMessageId: row.queue_message_id,
      duplicate: row.duplicate,
    };
  }

  public async claim(
    options: ClaimAiJobsOptions,
  ): Promise<readonly ClaimedAiJob[]> {
    const allocation = this.allocateQueueCapacity(options.quantity);
    const rows: unknown[] = [];
    for (const [queueName, quantity] of allocation) {
      const queueRows = await this.database.execute<unknown>(sql`
        select * from private.read_ai_work_queue(
          ${queueName},
          ${options.visibilityTimeoutSeconds},
          ${quantity},
          ${rows.length === 0 ? options.maxPollSeconds : 0}
        )
      `);
      rows.push(...queueRows);
    }
    const claimed: ClaimedAiJob[] = [];

    for (const rawRow of rows) {
      const rowResult = QueueReadRowSchema.safeParse(rawRow);
      if (!rowResult.success) {
        this.logger.event("error", "worker.ai_queue_row_invalid");
        continue;
      }
      const row = rowResult.data;
      const envelopeResult = AiJobEnvelopeV1Schema.safeParse(row.message);
      if (!envelopeResult.success) {
        await this.archivePoison(row.queue_name, row.queue_message_id);
        this.logger.event("error", "worker.ai_queue_payload_poison");
        continue;
      }

      const claimRows = await this.database.execute<unknown>(sql`
        select * from private.claim_ai_job(
          ${envelopeResult.data.jobId}::uuid,
          ${row.queue_message_id}::bigint,
          ${row.queue_read_count},
          ${row.lease_expires_at}::timestamptz
        )
      `);
      const claimResult = ClaimRowSchema.safeParse(claimRows[0]);
      if (!claimResult.success) {
        await this.archivePoison(row.queue_name, row.queue_message_id);
        this.logger.event("error", "worker.ai_job_claim_invalid");
        continue;
      }
      const claim = claimResult.data;

      if (
        claim.claim_state === "POISON" ||
        claim.claim_state === "TERMINAL_DUPLICATE" ||
        claim.claim_state === "EXHAUSTED"
      ) {
        await this.archivePoison(row.queue_name, row.queue_message_id);
        this.logger.event(
          claim.claim_state === "TERMINAL_DUPLICATE" ? "warn" : "error",
          `worker.ai_job_${claim.claim_state.toLowerCase()}`,
          claim.job_id === null ? {} : { jobId: claim.job_id },
        );
        continue;
      }
      if (claim.claim_state === "LEASE_CONFLICT") {
        this.logger.event("warn", "worker.ai_job_lease_conflict", {
          jobId: envelopeResult.data.jobId,
        });
        continue;
      }

      const authoritativeResult = AiJobEnvelopeV1Schema.safeParse({
        schemaVersion: "ai-job.v1",
        jobId: claim.job_id,
        jobType: claim.job_type,
        sessionId: claim.session_id,
        baseWikiVersion: claim.base_wiki_version,
        targetThroughSeq: claim.target_through_seq,
        taskSchemaVersion: claim.task_schema_version,
      });
      if (
        claim.attempt_no === null ||
        claim.max_attempts === null ||
        claim.lease_expires_at === null
      ) {
        await this.archivePoison(row.queue_name, row.queue_message_id);
        this.logger.event("error", "worker.ai_job_authoritative_row_invalid", {
          jobId: envelopeResult.data.jobId,
        });
        continue;
      }

      const provisionalDelivery: ClaimedAiJob = {
        ...envelopeResult.data,
        queueMessageId: row.queue_message_id,
        queueReadCount: row.queue_read_count,
        attemptNo: claim.attempt_no,
        maxAttempts: claim.max_attempts,
        leaseExpiresAt: claim.lease_expires_at,
      };
      if (!authoritativeResult.success) {
        await this.complete(
          provisionalDelivery,
          "TERMINAL_FAILURE",
          "DATABASE_JOB_CONTRACT_INVALID",
        );
        this.logger.event("error", "worker.ai_job_authoritative_row_invalid", {
          jobId: envelopeResult.data.jobId,
        });
        continue;
      }

      const delivery: ClaimedAiJob = {
        ...authoritativeResult.data,
        queueMessageId: row.queue_message_id,
        queueReadCount: row.queue_read_count,
        attemptNo: claim.attempt_no,
        maxAttempts: claim.max_attempts,
        leaseExpiresAt: claim.lease_expires_at,
      };
      if (!sameEnvelope(envelopeResult.data, authoritativeResult.data)) {
        await this.complete(
          delivery,
          "TERMINAL_FAILURE",
          "QUEUE_ENVELOPE_MISMATCH",
        );
        this.logger.event("error", "worker.ai_queue_envelope_mismatch", {
          jobId: delivery.jobId,
        });
        continue;
      }
      claimed.push(delivery);
    }

    return claimed;
  }

  public async complete(
    job: ClaimedAiJob,
    outcome: CompleteAiJobOutcome,
    resultCode: string | null,
  ): Promise<boolean> {
    return this.booleanResult(sql`
      select private.complete_ai_job(
        ${job.jobId}::uuid,
        ${job.queueMessageId}::bigint,
        ${job.attemptNo},
        ${outcome},
        ${resultCode}
      ) as result
    `);
  }

  public async retry(
    job: ClaimedAiJob,
    errorCode: string,
    delaySeconds: number,
  ): Promise<boolean> {
    return this.booleanResult(sql`
      select private.retry_ai_job(
        ${job.jobId}::uuid,
        ${job.queueMessageId}::bigint,
        ${job.attemptNo},
        ${errorCode},
        ${delaySeconds}
      ) as result
    `);
  }

  public async extendLease(
    job: ClaimedAiJob,
    visibilityTimeoutSeconds: number,
  ): Promise<boolean> {
    return this.booleanResult(sql`
      select private.extend_ai_job_lease(
        ${job.jobId}::uuid,
        ${job.queueMessageId}::bigint,
        ${job.attemptNo},
        ${visibilityTimeoutSeconds}
      ) as result
    `);
  }

  private allocateQueueCapacity(
    quantity: number,
  ): readonly (readonly ["ai-session" | "ai-record", number])[] {
    if (quantity === 1) {
      const first = this.preferRecordNext ? "ai-record" : "ai-session";
      this.preferRecordNext = !this.preferRecordNext;
      return [[first, 1]];
    }
    const recordQuantity = Math.floor(quantity / 2);
    return [
      ["ai-session", quantity - recordQuantity],
      ["ai-record", recordQuantity],
    ];
  }

  private async archivePoison(
    queueName: "ai-session" | "ai-record",
    queueMessageId: string,
  ): Promise<boolean> {
    return this.booleanResult(sql`
      select private.archive_ai_work_message(
        ${queueName},
        ${queueMessageId}::bigint
      ) as result
    `);
  }

  private async booleanResult(query: ReturnType<typeof sql>): Promise<boolean> {
    const rows = await this.database.execute<unknown>(query);
    return BooleanResultSchema.parse(rows[0]).result;
  }
}
