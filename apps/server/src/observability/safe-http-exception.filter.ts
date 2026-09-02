import {
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { PublicErrorSchema } from "@bookseasoning/contracts/public";
import { assertPublicPayloadKeys } from "@bookseasoning/domain/privacy";

import type { SafeLogger } from "./safe-logger.js";
import { PublicHttpException } from "../http/public-http.exception.js";

const publicErrorByStatus: Readonly<
  Record<number, Readonly<{ code: string; message: string }>>
> = {
  [HttpStatus.BAD_REQUEST]: {
    code: "INVALID_REQUEST",
    message: "요청 형식이 올바르지 않습니다.",
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: "AUTH_REQUIRED",
    message: "로그인이 필요합니다.",
  },
  [HttpStatus.FORBIDDEN]: {
    code: "FORBIDDEN",
    message: "이 작업을 수행할 권한이 없습니다.",
  },
  [HttpStatus.NOT_FOUND]: {
    code: "NOT_FOUND",
    message: "요청한 대상을 찾을 수 없습니다.",
  },
  [HttpStatus.CONFLICT]: {
    code: "CONFLICT",
    message: "최신 상태를 확인한 뒤 다시 시도해주세요.",
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: "RATE_LIMITED",
    message: "잠시 후 다시 시도해주세요.",
  },
};

@Catch()
export class SafeHttpExceptionFilter implements ExceptionFilter {
  public constructor(private readonly logger: SafeLogger) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const safeError = exception instanceof PublicHttpException
      ? {
          code: exception.code,
          message: exception.publicMessage,
          ...(exception.aggregateVersion === undefined
            ? {}
            : { aggregateVersion: exception.aggregateVersion }),
        }
      : publicErrorByStatus[status] ??
        ({
          code: "INTERNAL_ERROR",
          message: "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        } as const);
    const payload = PublicErrorSchema.parse({
      ...safeError,
      requestId: request.id,
    });

    assertPublicPayloadKeys(payload);
    const route = request.routeOptions.url;
    this.logger.event("error", "http.request_failed", {
      method: request.method,
      ...(route === undefined ? {} : { route }),
      statusCode: status,
    });
    void reply.status(status).send(payload);
  }
}
