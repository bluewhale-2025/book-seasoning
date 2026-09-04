import { HttpException, HttpStatus } from "@nestjs/common";

export type SupabaseErrorLike = Readonly<{
  code?: string;
  message: string;
}>;

const POSTGREST_JWT_TIME_STALE = "SUPABASE_POSTGREST_JWT_TIME_STALE";

export class SupabaseDependencyUnavailableException extends HttpException {
  public readonly dependencyCode = POSTGREST_JWT_TIME_STALE;

  public constructor() {
    super(POSTGREST_JWT_TIME_STALE, HttpStatus.SERVICE_UNAVAILABLE);
  }
}

export function rethrowSupabaseDependencyError(error: SupabaseErrorLike): void {
  if (
    error.code === "PGRST303" &&
    /^jwt issued at future$/i.test(error.message.trim())
  ) {
    throw new SupabaseDependencyUnavailableException();
  }
}

export function supabaseRpcErrorCode(
  error: SupabaseErrorLike,
  fallback: string,
): string {
  rethrowSupabaseDependencyError(error);
  return error.message.match(/^[a-z_]+$/)?.[0] ?? fallback;
}
