#!/usr/bin/env bash
set -Eeuo pipefail
set +x

if [[ "${RESTORE_TARGET_CLASS:-}" != "ephemeral-drill" ]] \
  || [[ "${CONFIRM_RESTORE:-}" != "RESTORE_EPHEMERAL_DRILL" ]]; then
  printf 'Restore is restricted to an explicitly confirmed ephemeral drill target.\n' >&2
  exit 2
fi
required=(RESTORE_ARCHIVE_S3_URI RESTORE_TOMBSTONE_S3_URI RESTORE_DATABASE_URL AWS_REGION)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    printf 'Missing required restore setting: %s\n' "$name" >&2
    exit 2
  fi
done
for command_name in aws psql tar supabase; do
  command -v "$command_name" >/dev/null || {
    printf 'Required command is unavailable: %s\n' "$command_name" >&2
    exit 2
  }
done

restore_dir="$(mktemp -d "${TMPDIR:-/tmp}/bookseasoning-restore.XXXXXX")"
archive_path="${restore_dir}/backup.tar.gz"
tombstone_path="${restore_dir}/restore-tombstones.sql"
cleanup() {
  rm -f "$archive_path" "$tombstone_path" "${restore_dir}/roles.sql" \
    "${restore_dir}/schema.sql" "${restore_dir}/data.sql"
  rmdir "$restore_dir" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

aws s3 cp "$RESTORE_ARCHIVE_S3_URI" "$archive_path" \
  --region "$AWS_REGION" --only-show-errors
archive_members="$(tar -tzf "$archive_path" | sort | tr '\n' ' ')"
if [[ "$archive_members" != "data.sql roles.sql schema.sql " ]]; then
  printf 'Backup archive contains an unexpected member set.\n' >&2
  exit 3
fi
tar -C "$restore_dir" -xzf "$archive_path"

psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${restore_dir}/roles.sql" >/dev/null
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${restore_dir}/schema.sql" >/dev/null
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "${restore_dir}/data.sql" >/dev/null
supabase db push --db-url "$RESTORE_DATABASE_URL" --include-all >/dev/null

aws s3 cp "$RESTORE_TOMBSTONE_S3_URI" "$tombstone_path" \
  --region "$AWS_REGION" --only-show-errors
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$tombstone_path" >/dev/null

psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select case when count(*)=0 then 'ok' else 'failed' end from private.ai_private_prep_bodies body where not exists(select 1 from auth.users account where account.id=body.author_user_id);" \
  | grep -qx ok
psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atc \
  "select case when count(*)=0 then 'ok' else 'failed' end from public.room_memberships membership join public.profiles profile on profile.user_id=membership.user_id where membership.profile_name_snapshot='탈퇴한 사용자';" \
  | grep -qx ok

printf '{"status":"RESTORE_DRILL_DATA_VALIDATED","externalProviders":"DISABLED_REQUIRED"}\n'
