#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
environment_file="${ENV_FILE:-$repository_root/.env.compose}"
project_name="${COMPOSE_PROJECT_NAME:-personal-finance-isolated}"
default_backup_dir="${BACKUP_DIR:-$HOME/backups}"
backup_path="${1:-$default_backup_dir/personal-finance-$(date -u +%Y%m%dT%H%M%SZ).dump}"

if (($# > 1)); then
  printf 'Usage: %s [backup-file]\n' "$0" >&2
  exit 2
fi

if [[ ! -f "$environment_file" ]]; then
  printf 'Environment file not found: %s\n' "$environment_file" >&2
  printf 'Set ENV_FILE to the protected Compose environment file.\n' >&2
  exit 1
fi

if [[ "$backup_path" != /* ]]; then
  backup_path="$PWD/$backup_path"
fi
backup_directory="$(dirname -- "$backup_path")"
mkdir -p -- "$backup_directory"
backup_directory="$(cd -- "$backup_directory" && pwd -P)"
backup_path="$backup_directory/$(basename -- "$backup_path")"

case "$backup_path" in
  "$repository_root"|"$repository_root"/*)
    printf 'Refusing to write a database backup inside the repository: %s\n' "$backup_path" >&2
    exit 1
    ;;
esac

if [[ -e "$backup_path" ]]; then
  printf 'Refusing to overwrite existing backup: %s\n' "$backup_path" >&2
  exit 1
fi

temporary_path="$(mktemp "$backup_directory/.personal-finance-backup.XXXXXXXX")"
cleanup() {
  rm -f -- "$temporary_path"
}
trap cleanup EXIT

compose=(docker compose --project-name "$project_name" --env-file "$environment_file")
"${compose[@]}" exec -T database sh -ec \
  'pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  >"$temporary_path"

if [[ ! -s "$temporary_path" ]]; then
  printf 'PostgreSQL produced an empty backup.\n' >&2
  exit 1
fi

"${compose[@]}" exec -T database pg_restore --list \
  <"$temporary_path" >/dev/null

if ! ln -- "$temporary_path" "$backup_path"; then
  printf 'Could not publish backup without overwriting an existing file: %s\n' "$backup_path" >&2
  exit 1
fi
rm -f -- "$temporary_path"
trap - EXIT

printf 'Verified PostgreSQL custom-format backup: %s (%s bytes)\n' \
  "$backup_path" "$(stat -c '%s' "$backup_path")"
