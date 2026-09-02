#!/usr/bin/env bash
set -Eeuo pipefail
set +x

required=(SUPABASE_DB_URL BACKUP_S3_BUCKET TOMBSTONE_S3_PREFIX BACKUP_KMS_KEY_ID AWS_REGION)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required tombstone export setting: %s\n' "$name" >&2
    exit 2
  fi
done
for command_name in psql aws; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

export_dir="$(mktemp -d "${TMPDIR:-/tmp}/bookseasoning-tombstones.XXXXXX")"
tombstone_path="${export_dir}/restore-tombstones.sql"
cleanup() {
  rm -f "$tombstone_path"
  rmdir "$export_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

psql "$SUPABASE_DB_URL" -X -v ON_ERROR_STOP=1 -Atc "
  select format(
    'select private.reapply_account_deletion_tombstone(%L::uuid,%L::uuid[]);',
    tombstone.former_user_id,
    tombstone.participant_identity_ids::text
  )
  from private.account_deletion_restore_tombstones tombstone
  where tombstone.expires_at > timezone('utc',now())
  order by tombstone.created_at,tombstone.deletion_id;
" > "$tombstone_path"

if command -v sha256sum >/dev/null; then
  tombstone_sha256="$(sha256sum "$tombstone_path" | cut -d' ' -f1)"
else
  tombstone_sha256="$(shasum -a 256 "$tombstone_path" | cut -d' ' -f1)"
fi
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
prefix="${TOMBSTONE_S3_PREFIX#/}"
prefix="${prefix%/}"
object_key="${prefix}/${timestamp}-restore-tombstones.sql"

aws s3 cp "$tombstone_path" "s3://${BACKUP_S3_BUCKET}/${object_key}" \
  --region "$AWS_REGION" \
  --sse aws:kms \
  --sse-kms-key-id "$BACKUP_KMS_KEY_ID" \
  --metadata "sha256=${tombstone_sha256},retention-days=37" \
  --only-show-errors
aws s3api head-object --bucket "$BACKUP_S3_BUCKET" --key "$object_key" \
  --region "$AWS_REGION" >/dev/null

printf '{"status":"UPLOADED","objectKey":"%s"}\n' "$object_key"
