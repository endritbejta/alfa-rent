#!/usr/bin/env bash
#
# Check that a restored (or any) database still has the four objects that
# schema.prisma does not model:
#
#   1. the reservations_no_overlap GiST exclusion constraint (the only real
#      guarantee against double-booking)
#   2. the btree_gist extension it depends on
#   3. row-level security on every table in the public schema
#   4. the two CHECK constraints on rental_inspections
#
# Prisma cannot see any of these, so `prisma migrate status` reports a restore
# as healthy even when all four are gone. Run this after every restore and
# before pointing the app at the result. See docs/runbooks/backup-and-restore.md.
#
#   scripts/verify-restore.sh "postgresql://user:pass@host:5432/dbname"
#   DATABASE_URL=... scripts/verify-restore.sh
#
# Read-only: it runs SELECTs and nothing else. Exits 0 when every check
# passes, 1 when any fails, 2 on usage or connection errors. The URL is never
# printed, because it carries the password.
set -euo pipefail

url="${1:-${DATABASE_URL:-}}"
if [ -z "$url" ]; then
  echo "usage: $0 <postgres-url>   (or set DATABASE_URL)" >&2
  exit 2
fi
# Prisma-only query parameters (pgbouncer, connection_limit, schema) are not
# understood by libpq, so strip the query string before handing it to psql.
url="${url%%\?*}"

command -v psql >/dev/null || { echo "psql is not installed" >&2; exit 2; }

# One row per check: name | ok (t/f) | detail. Every check is a single SELECT
# so a missing table yields "f" rather than an error that aborts the run.
read -r -d '' SQL <<'EOF' || true
SELECT 'reservations_no_overlap exclusion constraint',
       EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'reservations_no_overlap' AND contype = 'x'),
       coalesce((SELECT contype::text FROM pg_constraint
                 WHERE conname = 'reservations_no_overlap'), 'missing')
UNION ALL
SELECT 'btree_gist extension',
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'),
       coalesce((SELECT extversion FROM pg_extension
                 WHERE extname = 'btree_gist'), 'missing')
UNION ALL
SELECT 'row-level security on every public table',
       (SELECT count(*) FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind = 'r') >= 11
       AND NOT EXISTS (SELECT 1 FROM pg_class
                       WHERE relnamespace = 'public'::regnamespace
                         AND relkind = 'r' AND NOT relrowsecurity),
       (SELECT count(*) FILTER (WHERE relrowsecurity) || '/' || count(*)
               || coalesce(' without RLS: ' || string_agg(relname, ', ')
                             FILTER (WHERE NOT relrowsecurity), '')
        FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relkind = 'r')
UNION ALL
SELECT 'rental_inspections CHECK constraints',
       (SELECT count(*) FROM pg_constraint
        WHERE contype = 'c'
          AND conname IN ('rental_inspections_fuel_level_check',
                          'rental_inspections_mileage_check')) = 2,
       coalesce((SELECT string_agg(conname, ', ' ORDER BY conname)
                 FROM pg_constraint
                 WHERE contype = 'c'
                   AND conname IN ('rental_inspections_fuel_level_check',
                                   'rental_inspections_mileage_check')),
                'missing');
EOF

if ! out=$(psql "$url" -X -A -t -F '|' -v ON_ERROR_STOP=1 -c "$SQL" 2>&1); then
  echo "could not run the checks:" >&2
  echo "$out" >&2
  exit 2
fi

failed=0
while IFS='|' read -r name ok detail; do
  [ -z "$name" ] && continue
  if [ "$ok" = "t" ]; then
    printf 'ok    %s (%s)\n' "$name" "$detail"
  else
    printf 'FAIL  %s (%s)\n' "$name" "$detail"
    failed=1
  fi
done <<<"$out"

if [ "$failed" -ne 0 ]; then
  echo
  echo "One or more unmodelled objects are missing. Do not point the app at this"
  echo "database. Re-apply them from prisma/migrations (see the runbook)."
  exit 1
fi
echo
echo "All four unmodelled objects are present."
