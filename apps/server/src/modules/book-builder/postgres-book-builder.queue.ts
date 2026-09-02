import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import {
  BookBuilderInputV1Schema,
  BookBuilderJobEnvelopeV1Schema,
} from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import { SafeLogger } from "../../observability/safe-logger.js";
import type {
  BookBuilderQueue,
  BookBuilderStageResult,
  ClaimedBookBuilderJob,
} from "./book-builder.queue.js";

const BigintIdSchema = z
  .union([z.string().regex(/^\d+$/), z.int().nonnegative(), z.bigint()])
  .transform((value) => value.toString());
const TimestampSchema = z
  .union([z.date(), z.iso.datetime({ offset: true })])
  .transform((value) =>
    value instanceof Date ? value.toISOString() : new Date(value).toISOString(),
  );
const QueueRowSchema = z.strictObject({
  queue_message_id: BigintIdSchema,
  queue_read_count: z.coerce.number().int().positive(),
  enqueued_at: TimestampSchema,
  lease_expires_at: TimestampSchema,
  message: z.unknown(),
});
const ClaimSchema = z.strictObject({
  claimState: z.enum([
    "CLAIMED",
    "POISON",
    "TERMINAL",
    "LEASE_CONFLICT",
    "EXHAUSTED",
  ]),
  jobId: z.uuid().optional(),
  runId: z.uuid().optional(),
  packVersionId: z.uuid().optional(),
  stage: z.string().optional(),
  generationNo: z.coerce.number().int().positive().optional(),
  expectedRevision: z.coerce.number().int().nonnegative().optional(),
  attemptNo: z.coerce.number().int().positive().optional(),
  maxAttempts: z.coerce.number().int().positive().optional(),
  leaseExpiresAt: TimestampSchema.optional(),
});
const BooleanResultSchema = z.strictObject({ result: z.boolean() });
const CompleteSchema = z.strictObject({
  status: z.literal("SUCCEEDED"),
  duplicate: z.boolean(),
  nextJobId: z.uuid().nullable().optional(),
  revision: z.coerce.number().int().nonnegative().nullable().optional(),
});

@Injectable()
export class PostgresBookBuilderQueue implements BookBuilderQueue {
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
    @Inject(SafeLogger) private readonly logger: SafeLogger,
  ) {}

  public get configured(): boolean {
    return this.database.configured;
  }

  public async claim(options: Readonly<{
    visibilityTimeoutSeconds: number;
    quantity: number;
    maxPollSeconds: number;
  }>): Promise<readonly ClaimedBookBuilderJob[]> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.read_book_builder_queue(
        ${options.visibilityTimeoutSeconds}, ${options.quantity}, ${options.maxPollSeconds}
      )
    `);
    const claimed: ClaimedBookBuilderJob[] = [];
    for (const raw of rows) {
      const queueRow = QueueRowSchema.safeParse(raw);
      if (!queueRow.success) {
        this.logger.event("error", "worker.book_builder_queue_row_invalid");
        continue;
      }
      const envelope = BookBuilderJobEnvelopeV1Schema.safeParse(queueRow.data.message);
      if (!envelope.success) {
        await this.archive(queueRow.data.queue_message_id);
        this.logger.event("error", "worker.book_builder_queue_payload_poison");
        continue;
      }
      const claimRows = await this.database.execute<unknown>(sql`
        select private.claim_book_builder_job(
          ${envelope.data.jobId}::uuid,
          ${queueRow.data.queue_message_id}::bigint,
          ${queueRow.data.queue_read_count},
          ${queueRow.data.lease_expires_at}::timestamptz
        ) as result
      `);
      const wrapper = z.strictObject({ result: z.unknown() }).parse(claimRows[0]);
      const claim = ClaimSchema.parse(wrapper.result);
      if (claim.claimState !== "CLAIMED") {
        if (["POISON", "TERMINAL", "EXHAUSTED"].includes(claim.claimState)) {
          await this.archive(queueRow.data.queue_message_id);
        }
        this.logger.event(
          claim.claimState === "LEASE_CONFLICT" ? "warn" : "error",
          `worker.book_builder_${claim.claimState.toLowerCase()}`,
          { jobId: envelope.data.jobId },
        );
        continue;
      }
      const authoritative = BookBuilderJobEnvelopeV1Schema.parse({
        schemaVersion: "book-builder-job.v1",
        jobId: claim.jobId,
        runId: claim.runId,
        packVersionId: claim.packVersionId,
        stage: claim.stage,
        generationNo: claim.generationNo,
        expectedRevision: claim.expectedRevision,
      });
      if (
        JSON.stringify(authoritative) !== JSON.stringify(envelope.data) ||
        claim.attemptNo === undefined ||
        claim.maxAttempts === undefined ||
        claim.leaseExpiresAt === undefined
      ) {
        await this.fail(
          {
            ...authoritative,
            queueMessageId: queueRow.data.queue_message_id,
            queueReadCount: queueRow.data.queue_read_count,
            attemptNo: claim.attemptNo ?? 1,
            maxAttempts: claim.maxAttempts ?? 1,
            leaseExpiresAt: claim.leaseExpiresAt ?? queueRow.data.lease_expires_at,
          },
          "QUEUE_ENVELOPE_MISMATCH",
          false,
          0,
        );
        continue;
      }
      claimed.push({
        ...authoritative,
        queueMessageId: queueRow.data.queue_message_id,
        queueReadCount: queueRow.data.queue_read_count,
        attemptNo: claim.attemptNo,
        maxAttempts: claim.maxAttempts,
        leaseExpiresAt: claim.leaseExpiresAt,
      });
    }
    return claimed;
  }

  public async loadInput(job: ClaimedBookBuilderJob) {
    const rows = await this.database.execute<unknown>(sql`
      select private.read_book_builder_input(${job.jobId}::uuid, ${job.attemptNo}) as result
    `);
    const wrapper = z.strictObject({ result: z.unknown() }).parse(rows[0]);
    return BookBuilderInputV1Schema.parse(wrapper.result);
  }

  public async complete(
    job: ClaimedBookBuilderJob,
    result: BookBuilderStageResult,
  ): Promise<boolean> {
    const rows = await this.database.execute<unknown>(sql`
      select private.complete_book_builder_stage(
        ${job.jobId}::uuid, ${job.attemptNo}, ${result.schemaVersion},
        ${JSON.stringify(result.artifact)}::jsonb,
        ${result.providerRun === null ? null : JSON.stringify(result.providerRun)}::jsonb
      ) as result
    `);
    const wrapper = z.strictObject({ result: z.unknown() }).parse(rows[0]);
    CompleteSchema.parse(wrapper.result);
    return true;
  }

  public async fail(
    job: ClaimedBookBuilderJob,
    errorCode: string,
    retry: boolean,
    delaySeconds: number,
  ): Promise<boolean> {
    return this.boolean(sql`
      select private.fail_book_builder_job(
        ${job.jobId}::uuid, ${job.attemptNo}, ${errorCode}, ${retry}, ${delaySeconds}
      ) as result
    `);
  }

  public async extendLease(
    job: ClaimedBookBuilderJob,
    seconds: number,
  ): Promise<boolean> {
    return this.boolean(sql`
      select private.extend_book_builder_lease(
        ${job.jobId}::uuid, ${job.attemptNo}, ${seconds}
      ) as result
    `);
  }

  private async archive(queueMessageId: string): Promise<boolean> {
    return this.boolean(sql`
      select private.archive_book_builder_message(${queueMessageId}::bigint) as result
    `);
  }

  private async boolean(query: ReturnType<typeof sql>): Promise<boolean> {
    const rows = await this.database.execute<unknown>(query);
    return BooleanResultSchema.parse(rows[0]).result;
  }
}
