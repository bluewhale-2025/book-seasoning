import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";
import { z } from "zod";

import {
  PublicContextFrameV1Schema,
  PublicPrepAnswerV1Schema,
  PublicRawMessageV1Schema,
} from "@bookseasoning/contracts/internal";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  LoadPublicContextFrameInput,
  PublicContextRepository,
  PublicMessageIdsInput,
  PublicMessageRangeInput,
  PublicPrepInput,
} from "./public-context.repository.js";

const ResultRowSchema = z.strictObject({ result: z.unknown() });
const PublicMessagesSchema = z.array(PublicRawMessageV1Schema);
const PublicPrepSchema = z.array(PublicPrepAnswerV1Schema);

@Injectable()
export class PostgresPublicContextRepository
  implements PublicContextRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async loadFrame(
    input: LoadPublicContextFrameInput,
  ): Promise<z.infer<typeof PublicContextFrameV1Schema>> {
    const result = await this.readResult(sql`
      select private.read_ai_public_session_frame(
        ${input.sessionId}::uuid,
        ${input.baseWikiVersion},
        ${input.targetThroughSeq}::bigint
      ) as result
    `);
    return PublicContextFrameV1Schema.parse(result);
  }

  public async listMessages(input: PublicMessageRangeInput) {
    const result = await this.readResult(sql`
      select private.read_ai_public_messages(
        ${input.sessionId}::uuid,
        ${input.fromSeq}::bigint,
        ${input.throughSeq}::bigint,
        ${input.limit}
      ) as result
    `);
    return PublicMessagesSchema.parse(result);
  }

  public async findMessagesByIds(input: PublicMessageIdsInput) {
    const result = await this.readResult(sql`
      select private.read_ai_public_messages_by_ids(
        ${input.sessionId}::uuid,
        ${[...input.messageIds]}::uuid[],
        ${input.throughSeq}::bigint
      ) as result
    `);
    return PublicMessagesSchema.parse(result);
  }

  public async listPublicPrep(input: PublicPrepInput) {
    const result = await this.readResult(sql`
      select private.read_ai_public_prep(
        ${input.sessionId}::uuid,
        ${input.prepAnswerIds === undefined ? null : [...input.prepAnswerIds]}::uuid[]
      ) as result
    `);
    return PublicPrepSchema.parse(result);
  }

  private async readResult(query: ReturnType<typeof sql>): Promise<unknown> {
    const rows = await this.database.execute<unknown>(query);
    return ResultRowSchema.parse(rows[0]).result;
  }
}
