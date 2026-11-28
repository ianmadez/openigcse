#!/usr/bin/env bash
# Phase 8: proves a nightly dump restores. Usage: backup-restore-check.sh <dir with schema.sql data.sql> <postgres url>
# Restores into a fresh database, then compares each table's restored row count with the rows the dump holds.
set -euo pipefail
dir="$1"; db="$2"

psql "$db" -v ON_ERROR_STOP=0 -q -f "$dir/roles.sql" >/dev/null 2>&1 || true
psql "$db" -q -c "drop schema public cascade; create schema public;"
psql "$db" -v ON_ERROR_STOP=1 -q -f "$dir/schema.sql"
{ echo "set session_replication_role = replica;"; cat "$dir/data.sql"; } | psql "$db" -v ON_ERROR_STOP=1 -q

fail=0; tables=0
while IFS='=' read -r table expected; do
  tables=$((tables + 1))
  actual=$(psql "$db" -tAc "select count(*) from public.\"$table\"")
  if [ "$actual" != "$expected" ]; then echo "MISMATCH $table: dump $expected, restored $actual"; fail=1; fi
done < <(awk '
  { sub(/\r$/, "") }
  /^COPY "public"\./ { name = $2; sub(/^"public"\."/, "", name); sub(/".*/, "", name); n = 0; on = 1; next }
  on && /^\\\.$/ { print name "=" n; on = 0; next }
  on { n++ }
' "$dir/data.sql")

[ "$tables" -gt 0 ] || { echo "The dump holds no public tables"; exit 1; }
[ "$fail" = 0 ] || exit 1
echo "Restore check passed: $tables tables, every row count matches the dump."
