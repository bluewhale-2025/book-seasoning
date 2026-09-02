import { Inject, Injectable } from "@nestjs/common";
import { sql } from "kysely";

import { WorkerPostgresDatabase } from "../../infrastructure/postgres/worker-postgres.database.js";
import type {
  AiProviderRunRepository,
  RecordAiProviderFailureInput,
  RecordAiProviderSuccessInput,
} from "./ai-provider-run.repository.js";

@Injectable()
export class PostgresAiProviderRunRepository
  implements AiProviderRunRepository
{
  public constructor(
    @Inject(WorkerPostgresDatabase)
    private readonly database: WorkerPostgresDatabase,
  ) {}

  public async recordSuccess(input: RecordAiProviderSuccessInput): Promise<void> {
    await this.database.execute(sql`
      select private.record_ai_provider_run(
        ${input.jobId}::uuid,
        ${input.attemptNo},
        ${input.run.taskAlias},
        ${input.run.promptVersion},
        ${input.run.outputSchemaVersion},
        ${input.run.provider},
        ${input.run.model},
        ${input.run.reasoningEffort},
        ${"SUCCEEDED"},
        ${input.run.responseId},
        ${input.run.latencyMs},
        ${input.run.usage}::jsonb,
        ${null},
        ${input.run.requestMetrics}::jsonb
      )
    `);
  }

  public async recordFailure(input: RecordAiProviderFailureInput): Promise<void> {
    await this.database.execute(sql`
      select private.record_ai_provider_run(
        ${input.jobId}::uuid,
        ${input.attemptNo},
        ${input.taskAlias},
        ${input.run.promptVersion},
        ${input.run.outputSchemaVersion},
        ${input.run.provider},
        ${input.run.model},
        ${input.run.reasoningEffort},
        ${"FAILED"},
        ${null},
        ${input.run.latencyMs},
        ${null}::jsonb,
        ${input.errorCode},
        ${input.run.requestMetrics}::jsonb
      )
    `);
  }
}
