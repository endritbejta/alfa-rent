#!/usr/bin/env bash
#
# Vercel's build command (package.json "vercel-build"): migrate, then build.
#
# Migrations run for the production deployment only. Vercel runs this same
# script for every preview deployment, and a preview environment can easily be
# left with the production database's URL. Pushing any branch would then apply
# that branch's unreviewed migrations to production, before review, and with
# no way back: there are no down-migrations here, and four database objects the
# schema does not model make a bad one expensive (see AGENTS.md).
#
# A preview that has a database of its own can opt back in by setting
# MIGRATE_PREVIEW_DATABASE=true on the Preview environment, and only there.
#
# `npm run build` stays database-free for CI; only this script migrates.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ "${VERCEL_ENV:-}" = "production" ] || [ "${MIGRATE_PREVIEW_DATABASE:-}" = "true" ]; then
  echo "→ applying migrations (VERCEL_ENV=${VERCEL_ENV:-unset})"
  npx prisma migrate deploy
else
  echo "→ skipping migrations: VERCEL_ENV=${VERCEL_ENV:-unset} is not production"
fi

npx next build
