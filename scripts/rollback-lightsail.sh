#!/usr/bin/env bash
set -Eeuo pipefail
set +x

required=(AWS_REGION LIGHTSAIL_SERVICE_NAME ROLLBACK_DEPLOYMENT_VERSION CONFIRM_ROLLBACK)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required rollback setting: %s\n' "$name" >&2
    exit 2
  fi
done
expected_confirmation="${LIGHTSAIL_SERVICE_NAME}:${ROLLBACK_DEPLOYMENT_VERSION}"
if [[ "$CONFIRM_ROLLBACK" != "$expected_confirmation" ]]; then
  printf 'CONFIRM_ROLLBACK must exactly match service:deployment-version.\n' >&2
  exit 2
fi

rollback_dir="$(mktemp -d "${TMPDIR:-/tmp}/bookseasoning-rollback.XXXXXX")"
deployments_path="${rollback_dir}/deployments.json"
request_path="${rollback_dir}/request.json"
cleanup() {
  rm -f "$deployments_path" "$request_path"
  rmdir "$rollback_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

aws lightsail get-container-service-deployments \
  --service-name "$LIGHTSAIL_SERVICE_NAME" \
  --region "$AWS_REGION" > "$deployments_path"
jq --arg service "$LIGHTSAIL_SERVICE_NAME" \
  --arg version "$ROLLBACK_DEPLOYMENT_VERSION" '
    .deployments[]
    | select((.version|tostring) == $version)
    | {serviceName:$service,containers:.containers,publicEndpoint:.publicEndpoint}
  ' "$deployments_path" > "$request_path"
if [[ ! -s "$request_path" ]]; then
  printf 'Requested deployment version was not found.\n' >&2
  exit 3
fi

aws lightsail create-container-service-deployment \
  --cli-input-json "file://${request_path}" \
  --region "$AWS_REGION" \
  --query 'containerService.deployment.version' \
  --output text
