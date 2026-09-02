import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import process from "node:process";

const artifactRoot = resolve(process.argv[2] ?? "apps/web/dist");
const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".svg",
  ".txt",
  ".xml",
]);
const forbiddenText = [
  "SUPABASE_SECRET_KEY",
  "WORKER_DATABASE_URL",
  "OPENAI_API_KEY",
  "KAKAO_REST_API_KEY",
  "COMMAND_FINGERPRINT_KEY",
  "postgresql://",
];
const forbiddenPatterns = [
  { label: "Supabase secret key value", pattern: /sb_secret_[A-Za-z0-9_-]{20,}/ },
  { label: "Cloudflare Turnstile test site key", pattern: /[123]x0{8,}[A-Z]{2}/ },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

const rootStat = await stat(artifactRoot).catch(() => null);
if (rootStat?.isDirectory() !== true) {
  throw new Error(`Web artifact directory is missing: ${artifactRoot}`);
}

const files = await collectFiles(artifactRoot);
const indexPath = files.find((path) => relative(artifactRoot, path) === "index.html");
if (indexPath === undefined) {
  throw new Error("Web artifact is missing index.html");
}

const indexHtml = await readFile(indexPath, "utf8");
if (!/^<!doctype html>/i.test(indexHtml)) {
  throw new Error("Web artifact index.html is missing an HTML doctype");
}
if (!/<meta charset=["']UTF-8["']\s*\/?>/i.test(indexHtml)) {
  throw new Error("Web artifact index.html is missing an early UTF-8 charset declaration");
}

const violations = [];
for (const path of files) {
  const artifactPath = relative(artifactRoot, path);
  if (artifactPath.endsWith(".map")) {
    violations.push(`${artifactPath}: public source map`);
    continue;
  }
  if (!textExtensions.has(extname(path))) continue;

  const body = await readFile(path, "utf8");
  for (const marker of forbiddenText) {
    if (body.includes(marker)) violations.push(`${artifactPath}: ${marker}`);
  }
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(body)) violations.push(`${artifactPath}: ${label}`);
  }
}

if (violations.length > 0) {
  throw new Error(`Unsafe web artifact:\n${violations.join("\n")}`);
}

process.stdout.write(`web artifact: OK (${files.length} files)\n`);
