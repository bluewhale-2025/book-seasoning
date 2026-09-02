import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RuntimeEnvironment } from "../../config/environment.js";
import type { AuthenticatedActor } from "../../modules/auth/auth.types.js";

export function createUserSupabaseClient(
  environment: RuntimeEnvironment,
  actor: AuthenticatedActor,
): SupabaseClient {
  const { supabaseUrl, supabasePublishableKey } = environment;

  if (supabaseUrl === undefined || supabasePublishableKey === undefined) {
    throw new Error("supabase_user_client_unavailable");
  }

  return createClient(supabaseUrl, supabasePublishableKey, {
    accessToken: async () => actor.accessToken,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function createSecretSupabaseClient(
  environment: RuntimeEnvironment,
): SupabaseClient {
  const { supabaseUrl, supabaseSecretKey } = environment;

  if (supabaseUrl === undefined || supabaseSecretKey === undefined) {
    throw new Error("supabase_secret_client_unavailable");
  }

  return createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
