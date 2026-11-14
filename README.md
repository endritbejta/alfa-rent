# Alfa Rent a Car

Car rental management platform: a public customer-facing website (Albanian
and English) plus an internal admin dashboard for managing vehicles,
reservations, customers and staff.

New here? Read [`HANDOFF.md`](HANDOFF.md) for the state of the project and
what is open, and [`AGENTS.md`](AGENTS.md) for the rules that have already
caused incidents. Longer-lived docs (audits, runbooks) are indexed in
[`docs/`](docs/README.md).

## Tech Stack

| Layer      | Technology                                                    |
| ---------- | ------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript                 |
| UI         | Tailwind CSS 4, shadcn/ui (**Base UI** flavour), lucide-react |
| Forms      | React Hook Form + Zod                                         |
| Data       | Prisma 6 + PostgreSQL (Supabase in production)                |
| Auth       | Auth.js v5 (credentials, role-based, revocable sessions)      |
| Images     | Cloudinary (browser uploads directly on a signed request)     |
| Email      | Resend (booking notifications to staff and customers)         |
| Tests      | Vitest (unit, and integration against a local Postgres)       |
| Deployment | Vercel, with Vercel Cron for scheduled jobs                   |

## Getting Started

Requires Node 24 (see `.nvmrc`) and Docker.

```bash
npm install

# Starts postgres in Docker, creates .env from .env.example with a generated
# development AUTH_SECRET, and applies migrations. Add --seed for demo data.
npm run db:setup -- --seed

npm run dev
```

Cloudinary and Resend keys are left blank by `db:setup`: image upload stays
broken until you fill in the Cloudinary keys, and no email is sent without the
Resend ones. Everything else works without them. `.env.example` documents
every variable.

|                              |                                                 |
| ---------------------------- | ----------------------------------------------- |
| `npm run db:setup`           | schema only (safe to re-run)                    |
| `npm run db:setup -- --seed` | schema + demo data — **wipes application data** |
| `npm run db:down`            | stop the container, keep the data               |
| `npm run db:reset`           | destroy the volume and rebuild from scratch     |

> **Never run `prisma migrate dev`, `migrate reset` or `db push`.** Four objects
> are not modelled in `schema.prisma` — the `reservations_no_overlap` exclusion
> constraint, the `btree_gist` extension, row-level security on every table, and
> the CHECK constraints — and those commands drop all four. Write migrations by
> hand and apply them with `prisma migrate deploy`, which is what `db:setup`
> does. `npm run test:integration` fails if any of the four is missing.

## Architecture

```
src/
  app/
    (website)/      # Public routes: home, /car, /car/[slug], booking, contact, privacy, terms
    (dashboard)/    # Authenticated admin routes: /admin/*
    account/        # Staff password change
    api/            # Route handlers (public APIs, cron jobs, CSP reports, payment webhooks)
  components/
    ui/             # shadcn/ui primitives
    dashboard/      # Admin widgets (drawer, tables, charts)
    shared/         # Cross-cutting composites (header, footer, cards)
    forms/          # Form components (RHF + Zod)
  lib/              # Everything shared: one module per concern (pricing, rental-dates, …)
    auth/           # Auth.js config, session helpers, RBAC guards
    db/             # Prisma client singleton
    cloudinary/     # Signed upload params, upload verification
    email/          # Resend client and templates
    i18n/           # Albanian/English translations and locale
    payments/       # Staged online-payment adapters (disabled)
    validations/    # Zod schemas shared by client and server
  services/         # ALL business logic (vehicle, reservation, customer, …)
  types/            # Shared TypeScript types
  proxy.ts          # Next 16 proxy: CSP nonce and auth gate
prisma/
  schema.prisma     # Database schema
  migrations/       # Hand-written SQL migrations
scripts/            # db-setup, vercel-build, verify-restore
```

### Folder decisions

- **Route groups** `(website)` / `(dashboard)` separate the two apps without
  affecting URLs, letting each have its own layout, fonts, and auth boundary.
- **`services/`** holds every piece of business logic. Pages, server actions,
  and route handlers stay thin: they validate input, call a service, and
  format the response. This keeps logic unit-testable and prevents
  duplication between the website and the dashboard.
- **`lib/validations/`** centralizes Zod schemas so the same schema validates
  a form on the client and the payload on the server — one source of truth.
- **`lib/db/`** exports a single Prisma client instance to avoid connection
  exhaustion in dev hot-reload and serverless environments.
- **`components/ui/`** is owned by shadcn (generated); handwritten composites
  live in `shared/` and `forms/` so upgrades never clobber custom code.

## Conventions

- Server Components by default; `"use client"` only where interactivity
  requires it.
- Every external input is validated with Zod at the boundary.
- All API responses use one envelope:
  `{ success: true, data }` / `{ success: false, error: { message, code } }`
- Mutations go through Server Actions; public read APIs through route
  handlers.
- No business logic in pages or components.

## Development Workflow

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build (no database needed)
- `npm test` — unit tests; needs no database
- `npm run test:integration` — database-backed tests; refuses a non-local `DATABASE_URL`
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run db:seed` — demo data; **wipes application data** and needs the
  acknowledgement in `.env.example`
- Husky's pre-commit runs lint-staged (ESLint `--fix` and Prettier on staged
  files) and then the typecheck
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests,
  migrations against Postgres 16, integration tests and the build
- Branch from `main` as `<type>/<short-name>`, conventional commit messages
  (`feat:`, `fix:`, `chore:`)

## Deployment (Vercel + Supabase)

The app is stateless; everything lives in Postgres. Vercel cannot reach a
database on your laptop, so production needs a hosted one.

1. **Create a Supabase project** and copy its two connection strings.
2. **Set these in Vercel** (Project → Settings → Environment Variables):

   | Variable                                                                 | Value                                                                      |
   | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
   | `DATABASE_URL`                                                           | Supabase **pooled** URL (port 6543) + `?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL`                                                             | Supabase **direct** URL (port 5432) — used for migrations                  |
   | `AUTH_SECRET`                                                            | `openssl rand -base64 32`                                                  |
   | `AUTH_URL`                                                               | `https://<your-app>.vercel.app` (no trailing slash)                        |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | from Cloudinary                                                            |
   | `RESEND_API_KEY` / `EMAIL_FROM` / `STAFF_NOTIFICATION_EMAILS`            | from Resend; `EMAIL_FROM` on a verified domain                             |
   | `CRON_SECRET`                                                            | `openssl rand -hex 32` — the cron endpoints refuse every call without it   |
   | `NEXT_PUBLIC_CONTACT_*`                                                  | public phone, email, address and map link; empty ones are hidden           |
   | `CSP_ENFORCE`                                                            | leave unset (report-only) until the CSP reports are clean, then `true`     |

   `SITE_URL`, `SITE_INDEXING` and the payment variables are optional; see
   `.env.example`.

   The pooled URL serves requests; the direct URL exists because
   migrations cannot run through PgBouncer.

   Scope `DATABASE_URL` and `DIRECT_URL` to **Production** only. If previews
   need a database, give the Preview environment one of its own, never the
   production URLs.

3. **Deploy.** Vercel runs `vercel-build` (`scripts/vercel-build.sh`). For
   the production deployment it runs `prisma migrate deploy` before
   `next build`, so the schema reaches the production database automatically.
   Preview deployments build without migrating, so pushing a branch can never
   change the production schema. A preview with a database of its own can opt
   in with `MIGRATE_PREVIEW_DATABASE=true` on the Preview environment. Plain
   `npm run build` is deliberately database-free, so CI can run it without
   one.
4. **Seed once** (optional, for a new disposable demo database) from your machine:

   ```bash
   ALLOW_DESTRUCTIVE_SEED=WIPE_AND_RESEED \
   SEED_ADMIN_PASSWORD="<unique-admin-password>" \
   SEED_EMPLOYEE_PASSWORD="<unique-employee-password>" \
   npm run db:seed
   ```

   Seeding is deliberately not part of the build: the seed wipes the
   database, and a redeploy must never destroy real bookings. The seed refuses
   to run without the acknowledgement and both distinct 16+ character passwords.

5. **Scheduled jobs** are declared in `vercel.json` and need `CRON_SECRET`:
   `/api/cron/expired-requests` lapses booking requests nobody answered and
   emails the customer; `/api/cron/sweep-rate-limits` deletes expired
   rate-limit windows.

### Backup and restore

The production database is the system of record. How it is backed up, how to
restore it into a scratch target and verify the objects Prisma does not model
(`scripts/verify-restore.sh`), and how to cut over, is in
[`docs/runbooks/backup-and-restore.md`](docs/runbooks/backup-and-restore.md).
Take a `pg_dump` before any production deploy that adds a migration.

### Local vs production

Keep `AUTH_URL=http://localhost:3000` in your local `.env`. Pointing it at
the deployed URL breaks local sign-in callbacks.
