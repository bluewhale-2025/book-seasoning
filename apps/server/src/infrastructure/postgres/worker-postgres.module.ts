import { Module } from "@nestjs/common";

import { WorkerPostgresDatabase } from "./worker-postgres.database.js";

@Module({
  providers: [WorkerPostgresDatabase],
  exports: [WorkerPostgresDatabase],
})
export class WorkerPostgresModule {}
