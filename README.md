# Alfa Rent a Car

Car rental management platform: a public customer-facing
website plus an internal admin dashboard for managing vehicles, reservations,
and customers.

## Tech Stack

| Layer      | Technology                                           |
| ---------- | ---------------------------------------------------- |
| Framework  | Next.js 16 (App Router), TypeScript                  |
| UI         | Tailwind CSS, shadcn/ui, Framer Motion, lucide-react |
| Forms      | React Hook Form + Zod                                |
| Data       | Prisma ORM + PostgreSQL (Supabase in production)     |
| Auth       | Auth.js (credentials, role-based)                    |
| Images     | Cloudinary                                           |
| Deployment | Vercel                                               |

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, Cloudinary keys

# 3. Set up the database (requires a running PostgreSQL, e.g. `brew services start postgresql`)
createdb alfa_rent   # once
npx prisma migrate dev

# The seed deletes all application data. Use distinct 16+ character passwords.
ALLOW_DESTRUCTIVE_SEED=WIPE_AND_RESEED \
SEED_ADMIN_PASSWORD="<unique-admin-password>" \
SEED_EMPLOYEE_PASSWORD="<unique-employee-password>" \
npx prisma db seed

# 4. Run the dev server
npm run dev
```

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
  hooks/            # Client-side React hooks
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
- `npm test` — vitest
- `npm run lint` — ESLint
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
