import process from "node:process";
import { URL } from "node:url";

const required = [
  "VITE_API_BASE_URL",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_TURNSTILE_SITE_KEY",
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  throw new Error(`Missing public web build settings: ${missing.join(", ")}`);
}

for (const name of ["VITE_API_BASE_URL", "VITE_SUPABASE_URL"]) {
  const value = process.env[name];
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid URL in public web build setting: ${name}`);
  }

  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!local && parsed.protocol !== "https:") {
    throw new Error(`Deployed web build setting must use HTTPS: ${name}`);
  }
}

if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
  throw new Error("VITE_SUPABASE_PUBLISHABLE_KEY must use a publishable key");
}

const turnstileSiteKey = process.env.VITE_TURNSTILE_SITE_KEY;
if (
  turnstileSiteKey.startsWith("1x000000") ||
  turnstileSiteKey.startsWith("2x000000") ||
  turnstileSiteKey.startsWith("3x000000")
) {
  throw new Error("A Cloudflare Turnstile test site key cannot be deployed");
}

const forbidden = [
  "VITE_SUPABASE_SECRET_KEY",
  "VITE_WORKER_DATABASE_URL",
  "VITE_OPENAI_API_KEY",
  "VITE_COMMAND_FINGERPRINT_KEY",
];
const exposed = forbidden.filter((name) => process.env[name]?.trim());
if (exposed.length > 0) {
  throw new Error(`Server-only settings must not use a VITE_ prefix: ${exposed.join(", ")}`);
}

process.stdout.write("web build environment: OK\n");
