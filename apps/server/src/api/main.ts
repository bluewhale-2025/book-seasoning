import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import type { FastifyInstance } from "fastify";

import { loadEnvironment, type RuntimeEnvironment } from "../config/environment.js";
import { runWithRequestContext } from "../observability/request-context.js";
import { SafeHttpExceptionFilter } from "../observability/safe-http-exception.filter.js";
import { SafeLogger } from "../observability/safe-logger.js";
import { ApiModule } from "./api.module.js";

function configureRequestHooks(fastify: FastifyInstance, logger: SafeLogger): void {
  fastify.addHook("onRequest", (request, reply, done) => {
    reply.header("x-request-id", request.id);
    runWithRequestContext({ requestId: request.id }, done);
  });

  fastify.addHook("onResponse", (request, reply, done) => {
    runWithRequestContext({ requestId: request.id }, () => {
      const route = request.routeOptions.url;
      logger.event("info", "http.request_completed", {
        method: request.method,
        ...(route === undefined ? {} : { route }),
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      });
      done();
    });
  });
}

export async function createApiApplication(
  environment: RuntimeEnvironment = loadEnvironment("api"),
): Promise<NestFastifyApplication> {
  const logger = new SafeLogger(environment);
  const adapter = new FastifyAdapter({
    bodyLimit: 64 * 1024,
    genReqId: () => randomUUID(),
    logger: false,
    trustProxy: false,
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    ApiModule.register(environment),
    adapter,
    { logger },
  );

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  app.enableCors({
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    origin: [...environment.corsOrigins],
  });
  app.enableShutdownHooks();
  app.useGlobalFilters(new SafeHttpExceptionFilter(logger));
  configureRequestHooks(app.getHttpAdapter().getInstance() as FastifyInstance, logger);

  return app;
}

export async function bootstrapApi(): Promise<void> {
  const environment = loadEnvironment("api");
  const logger = new SafeLogger(environment);
  const app = await createApiApplication(environment);

  await app.listen(environment.port, environment.host);
  logger.event("info", "api.started");
}

const entrypoint = process.argv[1];
if (
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href
) {
  void bootstrapApi().catch(() => {
    process.stderr.write("API bootstrap failed\n");
    process.exitCode = 1;
  });
}
