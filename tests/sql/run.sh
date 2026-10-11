#!/bin/bash
# Local, key-free checks of the security migrations (0008 segregation of duties, 0009 AI assistance, 0010 guidance) on plain PostgreSQL 16.
# Builds a throwaway database: Supabase stubs -> migrations 0000-0007 -> pre-0008 fixtures -> 0008 -> checks -> 0009 -> checks -> 0010 -> checks.
# Connection comes from the standard PG* variables (PGHOST, PGPORT, PGUSER). Run: bash tests/sql/run.sh
# This complements, and does not replace, `bun run test:db` against the real backend.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
M="$HERE/../../drizzle/migrations"
DB="${KAU_SQL_TEST_DB:-kau_sql_test}"
P="psql -q -v ON_ERROR_STOP=1"
$P -d postgres -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
$P -d "$DB" -f "$HERE/supabase_stub.sql" >/dev/null 2>&1
for f in "$M"/000[0-7]_*.sql; do $P -d "$DB" -f "$f" >/dev/null; done
$P -d "$DB" -f "$HERE/helpers.sql" >/dev/null
$P -d "$DB" -f "$HERE/0008_pre.sql" >/dev/null
$P -d "$DB" -f "$M/0008_review_segregation_of_duties.sql"
$P -d "$DB" -f "$HERE/0008_checks.sql" | grep -v '^$' | grep -vE '^[0-9a-f-]{36}$'
$P -d "$DB" -f "$M/0009_ai_assistance.sql"
$P -d "$DB" -f "$HERE/0009_checks.sql" | grep -v '^$' | grep -vE '^[0-9a-f-]{36}$|^\{'
$P -d "$DB" -f "$M/0010_guidance.sql"
$P -d "$DB" -f "$HERE/0010_checks.sql" | grep -v '^$' | grep -vE '^[0-9a-f-]{36}$|^\{'
$P -d postgres -c "DROP DATABASE $DB" >/dev/null
