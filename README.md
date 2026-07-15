# Alfa Rent a Car

Production-ready car rental management platform: a public customer-facing
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
npx prisma db seed   # 10 vehicles, 2 users, sample reservations

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
- `npm run build` — production build
- `npm run lint` — ESLint
- `npx prettier --write .` — format
- Husky runs lint on pre-commit
- Branch from `main`, conventional commit messages (`feat:`, `fix:`, `chore:`)
