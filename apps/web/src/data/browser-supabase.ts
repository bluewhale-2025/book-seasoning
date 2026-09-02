import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { loadWebEnvironment, type WebEnvironment } from "./environment";

let browserClient: SupabaseClient | undefined;

export function getBrowserSupabaseClient(
  environment: WebEnvironment = loadWebEnvironment(),
): SupabaseClient {
  browserClient ??= createClient(
    environment.supabaseUrl,
    environment.supabasePublishableKey,
    {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        flowType: "pkce",
        persistSession: true,
      },
    },
  );

  return browserClient;
}
