import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";

const required = [
  "RELEASE_VERSION",
  "GIT_SHA",
  "IMAGE_REFERENCE",
  "IMAGE_DIGEST",
  "MIGRATION_HEAD",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  process.stderr.write(`Missing release metadata: ${missing.join(", ")}\n`);
  process.exitCode = 1;
} else {
  const outputPath =
    process.env.RELEASE_MANIFEST_PATH ?? "artifacts/release-manifest.json";
  const manifest = {
    schemaVersion: "bookseasoning-release-manifest.v1",
    releaseVersion: process.env.RELEASE_VERSION,
    gitSha: process.env.GIT_SHA,
    image: {
      reference: process.env.IMAGE_REFERENCE,
      digest: process.env.IMAGE_DIGEST,
    },
    migrationHead: process.env.MIGRATION_HEAD,
    contracts: {
      public: "0.1.0",
      internal: "0.1.0",
      admin: "0.1.0",
    },
    aiAliases: {
      evaluator: process.env.OPENAI_EVALUATOR_MODEL ?? "gpt-5.6-luna",
      host: process.env.OPENAI_HOST_MODEL ?? "gpt-5.6-terra",
      prompts: [
        "public-evaluator.v1",
        "opening.v1",
        "host-intervention.v1",
        "synthesis.v1",
        "discussion-record.v1",
        "book-builder-research.v1",
        "book-builder-draft.v1",
      ],
    },
    createdAt: new Date().toISOString(),
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(`${JSON.stringify({ status: "CREATED", outputPath })}\n`);
}
