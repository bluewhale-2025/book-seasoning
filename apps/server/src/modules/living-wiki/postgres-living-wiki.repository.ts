import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  CommitLivingWikiCandidateInput,
  CommitInsufficientFinalInput,
  LivingWikiCommitResult,
  LivingWikiRepository,
} from "./living-wiki.repository.js";

const CommitRowSchema = z.strictObject({
  evaluation_id: z.uuid(),
  commit_status: z.enum(["COMMITTED", "SUPPRESSED_STALE_BASE"]),
  committed_wiki_version: z.coerce.number().int().positive().nullable(),
  current_wiki_version: z.coerce.number().int().nonnegative(),
  current_based_through_seq: z.coerce.number().int().nonnegative(),
  wrote_wiki_version: z.boolean(),
  should_requeue: z.boolean(),
});

const FinalCommitRowSchema = z.strictObject({
  commit_status: z.literal("COMMITTED"),
  final_wiki_version: z.coerce.number().int().positive(),
  record_job_id: z.uuid().nullable(),
  duplicate: z.boolean(),
});

@Injectable()
export class PostgresLivingWikiRepository implements LivingWikiRepository {
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async commitCandidate(
    input: CommitLivingWikiCandidateInput,
  ): Promise<LivingWikiCommitResult> {
    if (input.kind === "FINAL") {
      return this.commitFinal({ ...input, kind: "FINAL" }, false);
    }
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_public_evaluation_candidate(
        ${input.jobId}::uuid,
        ${input.attemptNo},
        ${input.kind},
        ${input.baseVersion},
        ${input.basedThroughSeq}::bigint,
        ${"living-wiki.v1"},
        ${input.document}::jsonb,
        ${"public-evaluator-output.v1"},
        ${input.evaluatorOutput}::jsonb
      )
    `);
    const row = CommitRowSchema.parse(rows[0]);
    return {
      evaluationId: row.evaluation_id,
      status: row.commit_status,
      committedWikiVersion: row.committed_wiki_version,
      currentWikiVersion: row.current_wiki_version,
      currentBasedThroughSeq: row.current_based_through_seq,
      wroteWikiVersion: row.wrote_wiki_version,
      shouldRequeue: row.should_requeue,
    };
  }

  public async commitInsufficientFinal(
    input: CommitInsufficientFinalInput,
  ): Promise<LivingWikiCommitResult> {
    return this.commitFinal(
      {
        ...input,
        kind: "FINAL",
        evaluatorOutput: null,
      },
      true,
    );
  }

  private async commitFinal(
    input: Readonly<{
      jobId: string;
      attemptNo: number;
      sessionId: string;
      kind: "FINAL";
      baseVersion: number;
      basedThroughSeq: number;
      document: CommitLivingWikiCandidateInput["document"];
      evaluatorOutput: CommitLivingWikiCandidateInput["evaluatorOutput"] | null;
    }>,
    insufficient: boolean,
  ): Promise<LivingWikiCommitResult> {
    const rows = await this.database.execute<unknown>(sql`
      select * from private.commit_final_wiki(
        ${input.jobId}::uuid,
        ${input.attemptNo},
        ${input.document}::jsonb,
        ${input.evaluatorOutput}::jsonb,
        ${insufficient}
      )
    `);
    const row = FinalCommitRowSchema.parse(rows[0]);
    return {
      evaluationId: null,
      status: row.commit_status,
      committedWikiVersion: row.final_wiki_version,
      currentWikiVersion: row.final_wiki_version,
      currentBasedThroughSeq: input.basedThroughSeq,
      wroteWikiVersion: !row.duplicate,
      shouldRequeue: false,
    };
  }
}
