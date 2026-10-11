#!/bin/bash
# Applies the database migrations in drizzle/migrations/ to a Supabase (PostgreSQL) database, in order,
# each in its own transaction, and records what was applied (name + SHA-256) in app_meta.applied_migrations.
# Re-running is safe: applied files are skipped, and a changed applied file stops the run.
#
#   DATABASE_URL=postgresql://postgres:...@host:5432/postgres bash scripts/migrate.sh           apply pending
#   DATABASE_URL=... bash scripts/migrate.sh --status                                           list state only
#   DATABASE_URL=... bash scripts/migrate.sh --baseline 0011                                    mark 0000-0011 applied
#                                                                                                 without running them
# (--baseline is only for a database restored from a copy that already contains those migrations.)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="${MIGRATIONS_DIR:-$HERE/../drizzle/migrations}"
: "${DATABASE_URL:?Set DATABASE_URL to the database connection string (the postgres user)}"
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
P=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At)

MODE="apply"; BASELINE=""
case "${1:-}" in
  --status) MODE="status" ;;
  --baseline) MODE="baseline"; BASELINE="${2:?--baseline needs a migration number, e.g. 0011}" ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

"${P[@]}" -c "CREATE SCHEMA IF NOT EXISTS app_meta;
  CREATE TABLE IF NOT EXISTS app_meta.applied_migrations (
    name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
  REVOKE ALL ON SCHEMA app_meta FROM PUBLIC;" >/dev/null

shopt -s nullglob
files=("$DIR"/[0-9][0-9][0-9][0-9]_*.sql)
[ ${#files[@]} -gt 0 ] || { echo "No migrations found in $DIR" >&2; exit 1; }
applied=0; skipped=0
for f in "${files[@]}"; do
  name="$(basename "$f" .sql)"; num="${name%%_*}"
  sum="$(sha256sum "$f" | cut -d' ' -f1)"
  have="$("${P[@]}" -c "SELECT sha256 FROM app_meta.applied_migrations WHERE name = '$name'")"
  if [ -n "$have" ]; then
    if [ "$have" != "$sum" ]; then
      echo "STOP: $name was applied earlier but the file has changed since. Add a new migration instead of editing an applied one." >&2
      exit 1
    fi
    [ "$MODE" = "status" ] && echo "applied   $name"
    skipped=$((skipped + 1)); continue
  fi
  case "$MODE" in
    status) echo "pending   $name" ;;
    baseline)
      if [ "$((10#$num))" -le "$((10#$BASELINE))" ]; then
        "${P[@]}" -c "INSERT INTO app_meta.applied_migrations (name, sha256) VALUES ('$name', '$sum')" >/dev/null
        echo "baselined $name"
      fi ;;
    apply)
      echo "applying  $name"
      # One transaction per file: either the whole migration and its record land, or nothing does.
      { echo "BEGIN;"; cat "$f"; echo; echo "INSERT INTO app_meta.applied_migrations (name, sha256) VALUES ('$name', '$sum');"; echo "COMMIT;"; } \
        | "${P[@]}" -f - >/dev/null
      applied=$((applied + 1)) ;;
  esac
done
[ "$MODE" = "apply" ] && echo "Done: $applied applied, $skipped already applied."
exit 0
