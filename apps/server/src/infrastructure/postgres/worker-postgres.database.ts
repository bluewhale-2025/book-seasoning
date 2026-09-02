import { Inject, Injectable } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Kysely, PostgresDialect, type RawBuilder } from "kysely";
import pg from "pg";

import type { RuntimeEnvironment } from "../../config/environment.js";
import { RUNTIME_ENVIRONMENT } from "../../config/runtime-config.module.js";

type WorkerDatabaseShape = Record<string, never>;

@Injectable()
export class WorkerPostgresDatabase implements OnModuleDestroy {
  private readonly database: Kysely<WorkerDatabaseShape> | undefined;

  public constructor(
    @Inject(RUNTIME_ENVIRONMENT) environment: RuntimeEnvironment,
  ) {
    if (environment.workerDatabaseUrl === undefined) {
      this.database = undefined;
      return;
    }

    this.database = new Kysely<WorkerDatabaseShape>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          connectionString: environment.workerDatabaseUrl,
          application_name: "bookseasoning-ai-worker",
          max: 4,
        }),
      }),
    });
  }

  public get configured(): boolean {
    return this.database !== undefined;
  }

  public async execute<T>(query: RawBuilder<T>): Promise<readonly T[]> {
    if (this.database === undefined) {
      throw new Error("WorkerDatabaseNotConfigured");
    }
    const result = await query.execute(this.database);
    return result.rows;
  }

  public async onModuleDestroy(): Promise<void> {
    await this.database?.destroy();
  }
}
