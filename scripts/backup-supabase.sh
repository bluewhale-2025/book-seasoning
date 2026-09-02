#!/usr/bin/env bash
set -Eeuo pipefail
set +x

required=(SUPABASE_DB_URL BACKUP_S3_BUCKET BACKUP_S3_PREFIX BACKUP_KMS_KEY_ID AWS_REGION)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required backup setting: %s\n' "$name" >&2
    exit 2
  fi
done
for command_name in supabase aws tar; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

backup_reason="${BACKUP_REASON:-daily}"
case "$backup_reason" in
  daily|pre-migration|manual) ;;
  *) printf 'BACKUP_REASON must be daily, pre-migration, or manual\n' >&2; exit 2 ;;
esac

backup_dir="$(mktemp -d "${TMPDIR:-/tmp}/bookseasoning-backup.XXXXXX")"
archive_path="${backup_dir}/bookseasoning-backup.tar.gz"
cleanup() {
  rm -f "${backup_dir}/roles.sql" "${backup_dir}/schema.sql" \
    "${backup_dir}/data.sql" "$archive_path"
  rmdir "$backup_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

supabase db dump --db-url "$SUPABASE_DB_URL" --role-only \
  --file "${backup_dir}/roles.sql" >/dev/null
supabase db dump --db-url "$SUPABASE_DB_URL" \
  --file "${backup_dir}/schema.sql" >/dev/null
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only --use-copy \
  --file "${backup_dir}/data.sql" >/dev/null
tar -C "$backup_dir" -czf "$archive_path" roles.sql schema.sql data.sql

if command -v sha256sum >/dev/null; then
  archive_sha256="$(sha256sum "$archive_path" | cut -d' ' -f1)"
else
  archive_sha256="$(shasum -a 256 "$archive_path" | cut -d' ' -f1)"
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="${BACKUP_S3_PREFIX#/}"
prefix="${prefix%/}"
object_key="${prefix}/${timestamp}-${backup_reason}.tar.gz"
migration_head="$(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort | tail -n 1 | xargs basename)"

aws s3 cp "$archive_path" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
  --region "$AWS_REGION" \
  --sse aws:kms \
  --sse-kms-key-id "$BACKUP_KMS_KEY_ID" \
  --metadata "sha256=${archive_sha256},reason=${backup_reason},migration-head=${migration_head}" \
  --only-show-errors
aws s3api head-object \
  --bucket "$BACKUP_S3_BUCKET" \
  --key "$object_key" \
  --region "$AWS_REGION" >/dev/null

printf '{"status":"UPLOADED","objectKey":"%s","reason":"%s","migrationHead":"%s"}\n' \
  "$object_key" "$backup_reason" "$migration_head"
