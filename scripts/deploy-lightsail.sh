#!/usr/bin/env bash
set -Eeuo pipefail
set +x

required=(
  AWS_REGION LIGHTSAIL_SERVICE_NAME IMAGE_REFERENCE RELEASE_VERSION
  CORS_ORIGINS SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SECRET_KEY
  WORKER_DATABASE_URL OPENAI_API_KEY COMMAND_FINGERPRINT_KEY
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required deployment setting: %s\n' "$name" >&2
    exit 2
  fi
done
for command_name in aws jq; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

deploy_dir="$(mktemp -d "${TMPDIR:-/tmp}/bookseasoning-deploy.XXXXXX")"
deployment_path="${deploy_dir}/deployment.json"
cleanup() {
  rm -f "$deployment_path"
  rmdir "$deploy_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

jq -n \
  --arg image "$IMAGE_REFERENCE" \
  --arg release "$RELEASE_VERSION" \
  --arg cors "$CORS_ORIGINS" \
  --arg supabaseUrl "$SUPABASE_URL" \
  --arg publishable "$SUPABASE_PUBLISHABLE_KEY" \
  --arg secret "$SUPABASE_SECRET_KEY" \
  --arg database "$WORKER_DATABASE_URL" \
  --arg openAi "$OPENAI_API_KEY" \
  --arg evaluator "${OPENAI_EVALUATOR_MODEL:-gpt-5.6-luna}" \
  --arg host "${OPENAI_HOST_MODEL:-gpt-5.6-terra}" \
  --arg fingerprint "$COMMAND_FINGERPRINT_KEY" \
  '{
    containers: {
      api: {
        image: $image,
        command: ["node","dist/api/main.js"],
        environment: {
          NODE_ENV: "production", SERVER_HOST: "0.0.0.0", SERVER_PORT: "3000",
          LOG_LEVEL: "info", RELEASE_VERSION: $release, CORS_ORIGINS: $cors,
          SUPABASE_URL: $supabaseUrl, SUPABASE_PUBLISHABLE_KEY: $publishable,
          SUPABASE_SECRET_KEY: $secret, COMMAND_FINGERPRINT_KEY: $fingerprint
        }
      },
      worker: {
        image: $image,
        command: ["node","dist/worker/main.js"],
        environment: {
          NODE_ENV: "production", LOG_LEVEL: "info", RELEASE_VERSION: $release,
          CORS_ORIGINS: $cors, SUPABASE_URL: $supabaseUrl,
          SUPABASE_PUBLISHABLE_KEY: $publishable, SUPABASE_SECRET_KEY: $secret,
          WORKER_DATABASE_URL: $database, OPENAI_API_KEY: $openAi,
          OPENAI_EVALUATOR_MODEL: $evaluator, OPENAI_HOST_MODEL: $host,
          OPENAI_TIMEOUT_MS: "20000", COMMAND_FINGERPRINT_KEY: $fingerprint
        }
      }
    },
    publicEndpoint: {
      containerName: "api", containerPort: 3000,
      healthCheck: {
        healthyThreshold: 2, unhealthyThreshold: 2, timeoutSeconds: 5,
        intervalSeconds: 10, path: "/health/ready", successCodes: "200"
      }
    }
  }' > "$deployment_path"

aws lightsail create-container-service-deployment \
  --service-name "$LIGHTSAIL_SERVICE_NAME" \
  --cli-input-json "file://${deployment_path}" \
  --region "$AWS_REGION" \
  --query 'containerService.deployment.version' \
  --output text
