#!/usr/bin/env bash
#
# Bring a local development database up from nothing.
#
#   npm run db:setup          schema only
#   npm run db:setup -- --seed  schema + the demo dataset (wipes app data)
#
# Deliberately uses `prisma migrate deploy`, never `migrate dev`: four database
# objects are not modelled in schema.prisma — the reservations_no_overlap GiST
# exclusion constraint, the btree_gist extension, row-level security on every
# table, and two CHECK constraints on rental_inspections. Commands that
# regenerate the schema from the model drop all four, and neither the test
# suite nor CI would notice. See docs/audit/PHASE-7-API-BACKEND-DATA.md.
set -euo pipefail

cd "$(dirname "$0")/.."

compose() {
  if docker compose version >/dev/null 2>&1; then docker compose "$@"; else docker-compose "$@"; fi
}

if [ ! -f .env ]; then
  echo "→ .env is missing; creating it from .env.example"
  cp .env.example .env
  # A dev-only signing key so Auth.js starts. Never reuse this anywhere real.
  secret=$(openssl rand -base64 32)
  # BSD and GNU sed disagree about -i, so write through a temp file.
  sed "s|^AUTH_SECRET=\"\"|AUTH_SECRET=\"${secret}\"|" .env > .env.tmp && mv .env.tmp .env
  echo "  generated a development AUTH_SECRET"
  echo "  Cloudinary keys are left blank: image upload will not work until you fill them in."
fi

echo "→ starting postgres"
compose up -d postgres

echo "→ waiting for it to accept connections"
for _ in $(seq 1 60); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' alfa-rent-db 2>/dev/null || echo starting)" = "healthy" ]; then
    break
  fi
  sleep 1
done
if [ "$(docker inspect -f '{{.State.Health.Status}}' alfa-rent-db 2>/dev/null || echo unknown)" != "healthy" ]; then
  echo "postgres did not become healthy; check: docker compose logs postgres" >&2
  exit 1
fi

echo "→ applying migrations"
npx prisma migrate deploy

if [ "${1:-}" = "--seed" ]; then
  echo "→ seeding (this deletes all application data in the local database)"
  ALLOW_DESTRUCTIVE_SEED=WIPE_AND_RESEED \
  SEED_ADMIN_PASSWORD="local-dev-admin-not-a-real-secret" \
  SEED_EMPLOYEE_PASSWORD="local-dev-employee-not-a-secret" \
    npm run db:seed
fi

echo
echo "Database ready at postgres://postgres:postgres@localhost:5432/alfa_rent"
echo "  npm run dev               start the app"
echo "  npm run test:integration  run the database-backed tests"
echo "  npm run db:setup -- --seed  load the demo dataset"
