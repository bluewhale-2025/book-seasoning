import type { LoggerService } from "@nestjs/common";

import type { LogLevel, RuntimeEnvironment } from "../config/environment.js";
import { getRequestContext } from "./request-context.js";

type LogWriter = (line: string) => void;

export type SafeLogMetadata = Readonly<{
  commandId?: string;
  durationMs?: number;
  jobId?: string;
  method?: string;
  route?: string;
  statusCode?: number;
}>;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function sanitizeMessage(message: unknown): string {
  if (message instanceof Error) {
    return message.name;
  }

  if (typeof message !== "string") {
    return "structured_message_omitted";
  }

  return message
    .replaceAll(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replaceAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL_REDACTED]")
    .replaceAll(
      /(password|secret|token|prompt|ai_private)\s*[=:]\s*[^\s,}]+/gi,
      "$1=[REDACTED]",
    );
}

export class SafeLogger implements LoggerService {
  public constructor(
    private readonly environment: RuntimeEnvironment,
    private readonly writer: LogWriter = (line) => process.stdout.write(`${line}\n`),
  ) {}

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, this.contextFrom(optionalParams));
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, this.contextFrom(optionalParams));
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write("error", message, this.contextFrom(optionalParams));
  }

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.write("info", message, this.contextFrom(optionalParams));
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write("debug", message, this.contextFrom(optionalParams));
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write("warn", message, this.contextFrom(optionalParams));
  }

  public event(level: LogLevel, event: string, metadata: SafeLogMetadata = {}): void {
    this.write(level, event, undefined, metadata);
  }

  private contextFrom(optionalParams: readonly unknown[]): string | undefined {
    const last = optionalParams.at(-1);
    return typeof last === "string" ? sanitizeMessage(last) : undefined;
  }

  private write(
    level: LogLevel,
    message: unknown,
    context?: string,
    metadata: SafeLogMetadata = {},
  ): void {
    if (levelPriority[level] < levelPriority[this.environment.logLevel]) {
      return;
    }

    const requestId = getRequestContext()?.requestId;
    const record = {
      timestamp: new Date().toISOString(),
      level,
      event: sanitizeMessage(message),
      service: "bookseasoning",
      runtime: this.environment.runtime,
      release: this.environment.release,
      ...(context === undefined ? {} : { context }),
      ...(requestId === undefined ? {} : { requestId }),
      ...metadata,
    };

    this.writer(JSON.stringify(record));
  }
}
