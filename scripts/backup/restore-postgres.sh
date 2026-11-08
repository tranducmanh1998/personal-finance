#!/usr/bin/env bash
set -Eeuo pipefail

repository_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
environment_file="${ENV_FILE:-$repository_root/.env.compose}"
project_name="${COMPOSE_PROJECT_NAME:-personal-finance-isolated}"

if (($# < 2 || $# > 2)); then
  printf 'Usage: %s backup-file disposable-database-name_test\n' "$0" >&2
  exit 2
fi

backup_path="$1"
target_database="$2"

if [[ ! -f "$environment_file" ]]; then
  printf 'Environment file not found: %s\n' "$environment_file" >&2
  printf 'Set ENV_FILE to the protected Compose environment file.\n' >&2
  exit 1
fi
if [[ ! -s "$backup_path" ]]; then
  printf 'Backup file is missing or empty: %s\n' "$backup_path" >&2
  exit 1
fi
if [[ ! "$target_database" =~ ^[a-zA-Z0-9_]{1,58}_test$ ]]; then
  printf 'Restore target must be a safe PostgreSQL database name ending in _test.\n' >&2
  exit 1
fi

compose=(docker compose --project-name "$project_name" --env-file "$environment_file")
production_database="$("${compose[@]}" exec -T database printenv POSTGRES_DB)"
if [[ "$target_database" == "$production_database" ]]; then
  printf 'Refusing to restore into the configured application database.\n' >&2
  exit 1
fi

"${compose[@]}" exec -T database pg_restore --list \
  <"$backup_path" >/dev/null

database_user="$("${compose[@]}" exec -T database printenv POSTGRES_USER)"
existing_database="$("${compose[@]}" exec -T database \
  psql -X -U "$database_user" -d postgres -v ON_ERROR_STOP=1 \
  -Atqc "SELECT 1 FROM pg_database WHERE datname = '$target_database'")"
if [[ "$existing_database" == "1" ]]; then
  printf 'Refusing to overwrite existing restore target: %s\n' "$target_database" >&2
  exit 1
fi

"${compose[@]}" exec -T database \
  psql -X -U "$database_user" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE \"$target_database\""

"${compose[@]}" exec -T database \
  pg_restore --exit-on-error --no-owner --no-privileges \
  --username "$database_user" --dbname "$target_database" \
  <"$backup_path"

printf 'Restored backup into disposable database: %s\n' "$target_database"
printf 'Validate its schema and synthetic/expected records before removing that database.\n'
