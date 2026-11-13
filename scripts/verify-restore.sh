#!/usr/bin/env bash
#
# Check that a restored (or any) database still has the four objects that
# schema.prisma does not model:
#
#   1. the reservations_no_overlap GiST exclusion constraint (the only real
#      guarantee against double-booking)
#   2. the btree_gist extension it depends on
#   3. row-level security on every table: each table schema.prisma maps, and
#      anything else in the public schema
#   4. the two CHECK constraints on rental_inspections
#
# Prisma cannot see any of these, so `prisma migrate status` reports a restore
# as healthy even when all four are gone. Run this after every restore and
# before pointing the app at the result. See docs/runbooks/backup-and-restore.md.
#
#   scripts/verify-restore.sh "postgresql://user:pass@host:5432/dbname"
#   DATABASE_URL=... scripts/verify-restore.sh
#
# Read-only: it runs one SELECT. Exits 0 when every check passes, 1 when any
# fails, 2 on usage or connection errors. The password is handed to psql via
# PGPASSWORD, never on its command line, and the URL is never printed.
set -euo pipefail

cd "$(dirname "$0")/.."

url="${1:-${DATABASE_URL:-}}"
if [ -z "$url" ]; then
  echo "usage: $0 <postgres-url>   (or set DATABASE_URL)" >&2
  exit 2
fi
command -v psql >/dev/null || { echo "psql is not installed" >&2; exit 2; }

# --- the connection string ---------------------------------------------------
#
# Drop only Prisma's own query parameters, which libpq rejects. Everything
# else stays, sslmode and sslrootcert above all: removing those would quietly
# downgrade a verified TLS connection to libpq's default, sslmode=prefer.
base="${url%%\?*}"
query=""
[ "$base" != "$url" ] && query="${url#*\?}"
kept=()
if [ -n "$query" ]; then
  IFS='&' read -r -a params <<<"$query"
  for p in "${params[@]}"; do
    case "${p%%=*}" in
      pgbouncer | connection_limit | pool_timeout | schema | socket_timeout | \
        statement_cache_size | sslaccept | sslidentity | sslpassword) ;;
      *) kept+=("$p") ;;
    esac
  done
fi

# Move the password out of the URL so it never appears in `ps` output.
# postgresql://user:password@host/... ; the password is percent-encoded.
password=""
rest="${base#*://}"
scheme="${base%%://*}"
if [ "$rest" != "$base" ] && [[ "$rest" == *@* ]]; then
  userinfo="${rest%%@*}"
  hostpart="${rest#*@}"
  if [[ "$userinfo" == *:* ]]; then
    password="${userinfo#*:}"
    userinfo="${userinfo%%:*}"
    base="${scheme}://${userinfo}@${hostpart}"
  fi
fi
conn="$base"
if [ "${#kept[@]}" -gt 0 ]; then
  conn="${base}?$(IFS='&'; echo "${kept[*]}")"
fi
if [ -n "$password" ]; then
  # Percent-decode: %40 -> @ and so on.
  PGPASSWORD="$(printf '%b' "${password//%/\\x}")"
  export PGPASSWORD
fi

# --- the tables RLS must cover -----------------------------------------------
#
# Derived from schema.prisma's @@map lines, as migration-integrity does, so a
# table that the restore lost entirely fails the check instead of shrinking
# the denominator.
tables=$(sed -n 's/.*@@map("\([a-z0-9_]*\)").*/\1/p' prisma/schema.prisma)
if [ "$(echo "$tables" | grep -c .)" -lt 10 ]; then
  echo "could not read the table list from prisma/schema.prisma" >&2
  exit 2
fi
table_array="ARRAY[$(echo "$tables" | sed "s/.*/'&'/" | paste -sd, -)]::text[]"

# --- the checks --------------------------------------------------------------
#
# One row per check: name | ok (t/f) | detail. to_regclass() keeps a missing
# table from aborting the query, so it reports "f" instead.
read -r -d '' SQL <<EOF || true
WITH expected(relname) AS (SELECT unnest(${table_array})),
public_tables AS (
  SELECT relname::text, relrowsecurity FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
),
rls AS (
  SELECT
    (SELECT string_agg(e.relname, ', ' ORDER BY e.relname) FROM expected e
     WHERE NOT EXISTS (SELECT 1 FROM public_tables t WHERE t.relname = e.relname)) AS missing,
    (SELECT string_agg(relname, ', ' ORDER BY relname) FROM public_tables
     WHERE NOT relrowsecurity) AS without_rls,
    (SELECT count(*) FILTER (WHERE relrowsecurity) || '/' || count(*) FROM public_tables) AS ratio
)
SELECT 'reservations_no_overlap exclusion constraint',
       EXISTS (SELECT 1 FROM pg_constraint
               WHERE conname = 'reservations_no_overlap' AND contype = 'x'
                 AND conrelid = to_regclass('public.reservations')),
       coalesce((SELECT contype::text FROM pg_constraint
                 WHERE conname = 'reservations_no_overlap'
                   AND conrelid = to_regclass('public.reservations')), 'missing')
UNION ALL
SELECT 'btree_gist extension',
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'),
       coalesce((SELECT extversion FROM pg_extension
                 WHERE extname = 'btree_gist'), 'missing')
UNION ALL
SELECT 'row-level security on every table',
       missing IS NULL AND without_rls IS NULL,
       ratio || coalesce('; missing tables: ' || missing, '')
             || coalesce('; without RLS: ' || without_rls, '')
FROM rls
UNION ALL
SELECT 'rental_inspections CHECK constraints',
       (SELECT count(*) FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid = to_regclass('public.rental_inspections')
          AND conname IN ('rental_inspections_fuel_level_check',
                          'rental_inspections_mileage_check')) = 2,
       coalesce((SELECT string_agg(conname, ', ' ORDER BY conname)
                 FROM pg_constraint
                 WHERE contype = 'c'
                   AND conrelid = to_regclass('public.rental_inspections')
                   AND conname IN ('rental_inspections_fuel_level_check',
                                   'rental_inspections_mileage_check')),
                'missing');
EOF

# stdout carries only the rows; stderr (notices, TLS warnings) goes to a file
# that is shown only if psql fails, so it cannot be mistaken for a check.
errfile=$(mktemp)
trap 'rm -f "$errfile"' EXIT
if ! out=$(psql "$conn" -X -q -A -t -F '|' -v ON_ERROR_STOP=1 -c "$SQL" 2>"$errfile"); then
  echo "could not run the checks:" >&2
  cat "$errfile" >&2
  exit 2
fi

failed=0
rows=0
while IFS='|' read -r name ok detail; do
  [ -z "$name" ] && continue
  rows=$((rows + 1))
  if [ "$ok" = "t" ]; then
    printf 'ok    %s (%s)\n' "$name" "$detail"
  else
    printf 'FAIL  %s (%s)\n' "$name" "$detail"
    failed=1
  fi
done <<<"$out"

if [ "$rows" -ne 4 ]; then
  echo "expected 4 check results, got $rows; not trusting this run" >&2
  exit 2
fi
if [ "$failed" -ne 0 ]; then
  echo
  echo "One or more unmodelled objects are missing. Do not point the app at this"
  echo "database. Re-apply them from prisma/migrations (see the runbook)."
  exit 1
fi
echo
echo "All four unmodelled objects are present."
