import { z } from "zod";

import type { RuntimeKind } from "@bookseasoning/contracts/public";

const WorkerDatabaseUrlSchema = z.string().min(1).refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}, "must be a postgres connection URL");

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SERVER_HOST: z.string().min(1).default("0.0.0.0"),
  SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RELEASE_VERSION: z.string().min(1).max(128).default("local"),
  CORS_ORIGINS: z.string().min(1).default("http://localhost:5173"),
  SUPABASE_URL: z.url().optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_").optional(),
  SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_").optional(),
  WORKER_DATABASE_URL: WorkerDatabaseUrlSchema.optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_EVALUATOR_MODEL: z.string().min(1).max(100).default("gpt-5.6-luna"),
  OPENAI_HOST_MODEL: z.string().min(1).max(100).default("gpt-5.6-terra"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),
  COMMAND_FINGERPRINT_KEY: z.string().min(32).optional(),
});

export type LogLevel = z.infer<typeof EnvironmentSchema>["LOG_LEVEL"];

export type RuntimeEnvironment = Readonly<{
  nodeEnv: "development" | "test" | "production";
  runtime: RuntimeKind;
  host: string;
  port: number;
  logLevel: LogLevel;
  release: string;
  corsOrigins: readonly string[];
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
  workerDatabaseUrl?: string;
  openAiApiKey?: string;
  openAiEvaluatorModel?: string;
  openAiHostModel?: string;
  openAiTimeoutMs?: number;
  commandFingerprintKey: string;
}>;

export class EnvironmentValidationError extends Error {
  public readonly fields: readonly string[];

  public constructor(fields: readonly string[]) {
    super(`Invalid environment configuration: ${fields.join(", ")}`);
    this.name = "EnvironmentValidationError";
    this.fields = fields;
  }
}

function fail(fields: readonly string[]): never {
  throw new EnvironmentValidationError([...new Set(fields)].sort());
}

export function loadEnvironment(
  runtime: RuntimeKind,
  source: NodeJS.ProcessEnv = process.env,
): RuntimeEnvironment {
  const result = EnvironmentSchema.safeParse(source);

  if (!result.success) {
    fail(result.error.issues.map((issue) => issue.path.join(".") || "environment"));
  }

  const data = result.data;
  const invalidFields: string[] = [];
  const hasSupabaseUrl = data.SUPABASE_URL !== undefined;
  const hasPublishableKey = data.SUPABASE_PUBLISHABLE_KEY !== undefined;

  if (hasSupabaseUrl !== hasPublishableKey) {
    invalidFields.push("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY");
  }

  if (data.NODE_ENV === "production" && (!hasSupabaseUrl || !hasPublishableKey)) {
    invalidFields.push("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY");
  }

  if (
    data.NODE_ENV === "production" &&
    (runtime === "worker" || runtime === "api") &&
    data.SUPABASE_SECRET_KEY === undefined
  ) {
    invalidFields.push("SUPABASE_SECRET_KEY");
  }
  if (
    data.NODE_ENV === "production" &&
    runtime === "worker" &&
    data.WORKER_DATABASE_URL === undefined
  ) {
    invalidFields.push("WORKER_DATABASE_URL");
  }
  if (
    data.NODE_ENV === "production" &&
    runtime === "worker" &&
    data.OPENAI_API_KEY === undefined
  ) {
    invalidFields.push("OPENAI_API_KEY");
  }
  if (data.NODE_ENV === "production" && data.COMMAND_FINGERPRINT_KEY === undefined) {
    invalidFields.push("COMMAND_FINGERPRINT_KEY");
  }

  if (invalidFields.length > 0) {
    fail(invalidFields);
  }

  const corsOrigins = data.CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (
    corsOrigins.length === 0 ||
    corsOrigins.some((origin) => z.url().safeParse(origin).success === false)
  ) {
    fail(["CORS_ORIGINS"]);
  }

  return {
    nodeEnv: data.NODE_ENV,
    runtime,
    host: data.SERVER_HOST,
    port: data.SERVER_PORT,
    logLevel: data.LOG_LEVEL,
    release: data.RELEASE_VERSION,
    corsOrigins,
    openAiEvaluatorModel: data.OPENAI_EVALUATOR_MODEL,
    openAiHostModel: data.OPENAI_HOST_MODEL,
    openAiTimeoutMs: data.OPENAI_TIMEOUT_MS,
    commandFingerprintKey:
      data.COMMAND_FINGERPRINT_KEY ??
      "bookseasoning-local-command-fingerprint-key-only",
    ...(data.SUPABASE_URL === undefined ? {} : { supabaseUrl: data.SUPABASE_URL }),
    ...(data.SUPABASE_PUBLISHABLE_KEY === undefined
      ? {}
      : { supabasePublishableKey: data.SUPABASE_PUBLISHABLE_KEY }),
    ...(data.SUPABASE_SECRET_KEY === undefined
      ? {}
      : { supabaseSecretKey: data.SUPABASE_SECRET_KEY }),
    ...(data.WORKER_DATABASE_URL === undefined
      ? {}
      : { workerDatabaseUrl: data.WORKER_DATABASE_URL }),
    ...(data.OPENAI_API_KEY === undefined
      ? {}
      : { openAiApiKey: data.OPENAI_API_KEY }),
  };
}
