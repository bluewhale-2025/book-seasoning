export type WebEnvironment = Readonly<{
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  turnstileSiteKey?: string;
}>;

export class WebEnvironmentError extends Error {
  public constructor(public readonly fields: readonly string[]) {
    super(`Missing browser configuration: ${fields.join(", ")}`);
    this.name = "WebEnvironmentError";
  }
}

export function loadWebEnvironment(
  source: ImportMetaEnv = import.meta.env,
): WebEnvironment {
  const missing: string[] = [];
  const apiBaseUrl = source.VITE_API_BASE_URL?.trim();
  const supabaseUrl = source.VITE_SUPABASE_URL?.trim();
  const supabasePublishableKey = source.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  const turnstileSiteKey = source.VITE_TURNSTILE_SITE_KEY?.trim();

  if (!apiBaseUrl) missing.push("VITE_API_BASE_URL");
  if (!supabaseUrl) missing.push("VITE_SUPABASE_URL");
  if (!supabasePublishableKey?.startsWith("sb_publishable_")) {
    missing.push("VITE_SUPABASE_PUBLISHABLE_KEY");
  }
  if (missing.length > 0) throw new WebEnvironmentError(missing);
  if (!apiBaseUrl || !supabaseUrl || !supabasePublishableKey) {
    throw new WebEnvironmentError(["browser configuration"]);
  }

  try {
    return {
      apiBaseUrl: new URL(apiBaseUrl).toString().replace(/\/$/, ""),
      supabaseUrl: new URL(supabaseUrl).toString().replace(/\/$/, ""),
      supabasePublishableKey,
      ...(turnstileSiteKey ? { turnstileSiteKey } : {}),
    };
  } catch {
    throw new WebEnvironmentError(["VITE_API_BASE_URL", "VITE_SUPABASE_URL"]);
  }
}
