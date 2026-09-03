# Alfa Rent a Car

Car rental management platform: a public customer-facing
website plus an internal admin dashboard for managing vehicles, reservations,
and customers.

## Tech Stack

| Layer      | Technology                                                  |
| ---------- | ----------------------------------------------------------- |
| Framework  | Next.js 16 (App Router), TypeScript                         |
| UI         | Tailwind CSS, shadcn/ui (**Base UI** flavour), lucide-react |
| Forms      | React Hook Form + Zod                                       |
| Data       | Prisma ORM + PostgreSQL (Supabase in production)            |
| Auth       | Auth.js (credentials, role-based)                           |
| Images     | Cloudinary                                                  |
| Deployment | Vercel                                                      |

## Getting Started

Requires Node (see `.nvmrc`) and Docker.

```bash
npm install

# Starts postgres in Docker, creates .env from .env.example with a generated
# development AUTH_SECRET, and applies migrations. Add --seed for demo data.
npm run db:setup -- --seed

npm run dev
```

Cloudinary keys are left blank by `db:setup`; image upload stays broken until
you fill them into `.env`. Everything else works without them.

|                              |                                                 |
| ---------------------------- | ----------------------------------------------- |
| `npm run db:setup`           | schema only (safe to re-run)                    |
| `npm run db:setup -- --seed` | schema + demo data — **wipes application data** |
| `npm run db:down`            | stop the container, keep the data               |
| `npm run db:reset`           | destroy the volume and rebuild from scratch     |

> **Never run `prisma migrate dev`, `migrate reset` or `db push`.** Four objects
> are not modelled in `schema.prisma` — the `reservations_no_overlap` exclusion
> constraint, the `btree_gist` extension, row-level security on every table, and
> two CHECK constraints — and those commands drop all four. Write migrations by
> hand and apply them with `prisma migrate deploy`, which is what `db:setup`
> does. `npm run test:integration` fails if any of the four is missing.

## Architecture

```
src/
  app/
    (website)/      # Public routes: home, /car, /car/[slug], booking, contact
    (dashboard)/    # Authenticated admin routes: /admin/*
    api/            # Route handlers (public APIs, webhooks)
  components/
    ui/             # shadcn/ui primitives
    shared/         # Cross-cutting composites (header, footer, cards)
    forms/          # Form components (RHF + Zod)
  lib/
    auth/           # Auth.js config, session helpers, RBAC guards
    db/             # Prisma client singleton
    cloudinary/     # Upload/delete helpers, signed upload params
    validations/    # Zod schemas shared by client and server
  services/         # ALL business logic (vehicle, reservation, customer)
  types/            # Shared TypeScript types
  utils/            # Pure utility functions
prisma/
  schema.prisma     # Database schema
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
- `npm run typecheck` — `tsc --noEmit` (also runs on pre-commit)
- `npx prettier --write .` — format
- Husky runs lint on pre-commit
- Branch from `main`, conventional commit messages (`feat:`, `fix:`, `chore:`)

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

   The pooled URL serves requests; the direct URL exists because
   migrations cannot run through PgBouncer.

3. **Deploy.** Vercel runs `vercel-build`, which runs `prisma migrate deploy`
   before `next build`, so the schema reaches the production database
   automatically. Plain `npm run build` is deliberately database-free, so CI
   can run it without one.
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

### Local vs production

Keep `AUTH_URL=http://localhost:3000` in your local `.env`. Pointing it at
the deployed URL breaks local sign-in callbacks.
