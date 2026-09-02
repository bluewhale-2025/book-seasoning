import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!publishableKey) {
  process.stderr.write("Missing SUPABASE_PUBLISHABLE_KEY from `supabase status -o env`\n");
  process.exit(2);
}

const auth = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const result = await auth.auth.signInWithPassword({
  email: "realtime-load@example.test",
  password: "realtime-load-password",
});
if (result.error || !result.data.session) {
  process.stderr.write("Local synthetic Realtime user could not sign in\n");
  process.exit(1);
}

process.env.SUPABASE_URL = supabaseUrl;
process.env.SUPABASE_PUBLISHABLE_KEY = publishableKey;
process.env.REALTIME_LOAD_ACCESS_TOKEN = result.data.session.access_token;
process.env.REALTIME_LOAD_USER_ID = result.data.user.id;
process.env.REALTIME_LOAD_SESSION_IDS ??= [1, 2, 3, 4]
  .map((value) => `b0400000-0000-4000-8000-${String(value).padStart(12, "0")}`)
  .join(",");

await import("./realtime-load.mjs");
