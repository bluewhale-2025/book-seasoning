import { pathToFileURL } from "node:url";

import { NestFactory } from "@nestjs/core";

import { loadEnvironment } from "../config/environment.js";
import { SafeLogger } from "../observability/safe-logger.js";
import { WorkerModule } from "./worker.module.js";

export async function bootstrapWorker(): Promise<void> {
  const environment = loadEnvironment("worker");
  const logger = new SafeLogger(environment);
  const app = await NestFactory.createApplicationContext(
    WorkerModule.register(environment),
    { logger },
  );

  app.enableShutdownHooks();
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  void bootstrapWorker().catch(() => {
    process.stderr.write("Worker bootstrap failed\n");
    process.exitCode = 1;
  });
}
