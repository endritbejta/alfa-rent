# Alfa Rent — Engineering Handoff

First written 17 July 2026; brought up to date on 14 November 2026 (after PR #54).
Read this first, then [`README.md`](README.md) for setup and
[`AGENTS.md`](AGENTS.md) for the rules that have already cost someone a day.

This is a continuation brief for whoever picks the project up next, human or
agent. It covers what exists, what is deliberately the way it is, and what is
still open — in priority order. The full engineering audit and its history are
in [`docs/`](docs/README.md).

---

## 1. What this is

A car rental platform for a real Kosovo business (part of the Alfa Globe
group). Two products in one Next.js app:

- **Public site** (Albanian and English) — fleet browsing, availability,
  booking requests, privacy notice and rental terms.
- **Admin dashboard** — staff manage vehicles (with service and repair
  history), reservations (pickup and return inspections, extensions, late and
  early returns), customers, staff accounts, a fleet calendar, analytics, and
  an audit history of staff actions.

**Live:** https://alfa-rent.vercel.app · **Repo:** github.com/endritbejta/alfa-rent (private)

Staff credentials are never documented in the repository. Admins create staff
accounts in **Admin → Staff** with a temporary password the person must change
at first sign-in.

## 2. Stack and where things live

Next.js 16.4 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui
(**Base UI** flavour) · Prisma 6 + PostgreSQL (Supabase) · Auth.js v5 ·
Cloudinary (direct signed uploads) · Resend (email) · Vitest · Vercel (with
Vercel Cron). Node 24 (`.nvmrc`, `engines`).

```
src/
  app/(website)/     public routes      app/(dashboard)/admin/  staff routes
  app/api/           route handlers     components/dashboard/   admin widgets
  services/          ALL business logic components/forms/       forms
  lib/               shared modules     components/shared/      cross-cutting
  lib/validations/   Zod schemas        components/ui/          shadcn primitives
  lib/auth/          Auth.js + guards   proxy.ts                CSP nonce + auth gate
prisma/              schema + hand-written migrations + seed
scripts/             db-setup, vercel-build, verify-restore
```

**The one rule that matters:** business logic lives in `services/`. Pages,
route handlers and server actions validate input, call a service, and format
the result. Keep it that way — it is why the logic is testable.

## 3. Conventions you must know (these have bitten before)

`AGENTS.md` has the short list; this is the longer history behind some of it.

- **shadcn here is Base UI, not Radix.** There is no `asChild`. Use
  `render={<Link/>}` plus `nativeButton={false}` on `Button`, and the same
  `render` pattern on `DialogTrigger`.
- **Never run `prisma migrate dev`, `migrate reset` or `db push`.** Four
  database objects are not modelled in `schema.prisma` (the
  `reservations_no_overlap` exclusion constraint, `btree_gist`, row-level
  security, and CHECK constraints), and those commands drop them. Hand-write
  `prisma/migrations/<timestamp>_<name>/migration.sql`, then
  `npx prisma migrate deploy`. Every migration in this repo was made that way,
  and `npm run test:integration` fails if any of those objects is missing.
- **Restart the dev server after `prisma generate`**, or you get
  `PrismaClientValidationError` from a stale client.
- **Prisma `Decimal` cannot cross the server/client boundary.** Convert to
  `Number` at the edge (server action return, or the page's `.map`). This has
  caused two separate bugs.
- **`Prisma.groupBy` loses its types inside `$transaction([...])`** — use
  `Promise.all` instead.
- **Inside a `$transaction`, helpers must use the transaction client.**
  Production runs with `connection_limit=1`, so a helper that reaches for the
  global `prisma` waits for the connection its own transaction holds and
  deadlocks until the timeout.
- **Never spread an optional-typed object straight into a Prisma `update`.**
  `undefined` means "leave unchanged", so a field the user cleared silently
  keeps its old value. Use `null` to clear.
- **ESLint forbids sync `setState` in an effect.** Wrap in `setTimeout(…, 0)`.
  Do **not** use `requestAnimationFrame` — it does not fire in headless/
  non-painting contexts and silently broke two features.
- **Never route an uploaded file through a server action or route handler.**
  Vercel caps function request bodies at **4.5 MB** whatever Next.js is told,
  and the rejection happens before your `try` block, so it surfaces as a
  generic error. `bodySizeLimit: "12mb"` looked fine locally and broke on two
  phone photos in production. Photos go browser → Cloudinary on a signed
  request; the action only ever carries the receipt.
- **A direct upload means the client names the asset.** Anything the browser
  reports about an upload — `publicId` above all — is untrusted input. Verify
  Cloudinary's response signature and rebuild the URL server-side from the
  verified id. Never store a client-supplied URL.
- **Verify through the page, not the service.** A service-level test passed
  while the fleet filters were completely dead, because the bug was in the
  page's `safeParse`. Curl the route or drive the browser.
- **Every new server action needs a row in
  `src/app/server-action-authorization.test.ts`.** The test discovers every
  `"use server"` export, so one added without a row fails CI.
- Money is `Decimal(10,2)` in the DB. Never `float`.
- Commit style: conventional (`feat:`, `fix:`, `chore:`), and messages
  explain _why_. Use `git commit -F <file>` — long messages break the shell.

## 4. Deliberate decisions — do not "fix" these without reading

| Decision                                                                                                 | Why                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GiST exclusion constraint** on `reservations` blocks overlapping CONFIRMED/ACTIVE per vehicle          | Application checks lose under concurrency. The DB is the authority; the app check is advisory UX. Uses `tsrange` **not** `tstzrange` — Prisma `DateTime` is `timestamp without tz` and the tz cast is not `IMMUTABLE`.                                                                                         |
| **Rate limiting is Postgres-backed**, not Redis                                                          | Already shared by every serverless instance; no extra vendor. An in-memory counter resets on cold start and counts per-instance — protection in appearance only. Increments in one SQL statement (read-then-write races). **Fails open** on limiter error.                                                     |
| **Login limiter keyed by IP, not email**                                                                 | Email-keyed lets an attacker lock real staff out of their own accounts. Only failures count; success clears the window.                                                                                                                                                                                        |
| **Blocked login shows the generic "invalid credentials"**                                                | Confirming the limit tells an attacker the endpoint is worth resuming.                                                                                                                                                                                                                                         |
| **Public reads use an explicit allowlist** (`publicVehicleSelect`)                                       | `include` published every new column automatically — that is exactly how registration/service costs leaked to the public API. A test fails if a sensitive field returns.                                                                                                                                       |
| **Public booking never mutates an existing customer**                                                    | It runs unauthenticated; upsert let anyone rewrite the phone number staff ring to confirm a rental.                                                                                                                                                                                                            |
| **Seeding is NOT in the build**                                                                          | The seed wipes the database. A redeploy must never destroy real bookings.                                                                                                                                                                                                                                      |
| **`build` is hermetic; migrations live in `vercel-build`**                                               | CI runs `build` without a database. Coupling them turned CI red for a day.                                                                                                                                                                                                                                     |
| **Repairs are separate from servicing**                                                                  | A service is upkeep; a repair is an unplanned cost. Mixing them destroys the yearly per-vehicle spend figure, which is the point of the feature.                                                                                                                                                               |
| **Confirmation actions are green (`--success`), brand red is for CTAs, destructive is outlined crimson** | With a red brand, "Book now" and "Delete" would otherwise compete. Budget: **one filled-red element per viewport**.                                                                                                                                                                                            |
| **Vehicle cards → edit page; dashboard widgets → drawer**                                                | Staff open a vehicle to manage it; a dashboard widget should not cost you your place.                                                                                                                                                                                                                          |
| **Photos upload browser → Cloudinary; the form submits the whole ordered gallery**                       | Vercel caps function request bodies at 4.5 MB, so proxying files through an action could never work — and per-file progress needs each file on its own request. Submitting one ordered list makes add/remove/reorder a single intent: a failed save leaves nothing half-applied, and Cancel genuinely reverts. |
| **Slugs are never recomputed, and always end in a random suffix**                                        | A shared or indexed `/car/[slug]` link must keep working after an edit, and a plate must never appear in a public URL.                                                                                                                                                                                         |
| **One time model: `src/lib/business-time.ts`**                                                           | Rental dates are naive branch-calendar values pinned to `T10:00Z`; every conversion goes through this module. `businessCalendarStart` is DST-safe and tested in both seasons — do not swap in `date-fns-tz`.                                                                                                   |
| **Rental days are inclusive** (`src/lib/rental-dates.ts`)                                                | Pickup day and return day are both billed and both occupied; a car out and back on one day is one day. Every day count uses this one convention.                                                                                                                                                               |
| **Returns are settled in one place** (`settleReturn` in `inspection.service.ts`)                         | Late and early returns are billed there. An early return needs an explicit staff choice (`ACTUAL_DAYS` at the agreed `dailyRate`, or `FULL_BOOKING`); `totalPrice` is the amount charged, `bookedTotal` keeps the original.                                                                                    |
| **Every staff write records one audit event in its own transaction** (`src/lib/audit.ts`)                | An event can never describe a change that rolled back. The table is append-only at the database level; there is deliberately no fire-and-forget variant.                                                                                                                                                       |
| **CSP is nonce-based and report-only** until `CSP_ENFORCE=true` is set in Vercel Production              | The nonce policy is set in `src/proxy.ts`, the baseline headers in `next.config.ts`. Reports land in Vercel logs as `csp-violation` lines via `/api/csp-report`. Removing the variable rolls back.                                                                                                             |
| **Online payments are staged, not half-finished**                                                        | Four independent gates keep them off until a bank adapter passes sandbox testing; see [`docs/online-payments.md`](docs/online-payments.md). Do not "finish" them casually.                                                                                                                                     |

The audit's [Things that should NOT be changed](docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md#things-that-should-not-be-changed)
lists fifteen more, with reasons.

The full design system (tokens, palette, component specs) is at
https://claude.ai/code/artifact/c6d3cf98-a175-4d1c-9d96-2ed57a4dd268

## 5. Environment

`.env` is gitignored; [`.env.example`](.env.example) lists every variable the
code reads, with comments. Always verify which database `.env` targets before
running the application or a Prisma command; never assume it is a disposable
local database.

> **Careful:** `npm run db:seed` deletes all application data. It refuses to
> run without the explicit destructive acknowledgement and two distinct strong
> staff passwords documented in `.env.example`. Do not set those values against
> production.

`AUTH_URL` must stay `http://localhost:3000` locally; the deployed URL lives
in Vercel's env. Vercel vars are marked **Sensitive**, so `vercel env pull`
returns empty strings — use `vercel logs <url> --json` to diagnose instead
(that is how the localhost-database bug was found). Errors are logged as
structured JSON lines through `src/lib/observability.ts`.

**Builds and migrations:** `vercel-build` (`scripts/vercel-build.sh`) runs
`prisma migrate deploy` only for the production deployment, or for a preview
whose environment sets `MIGRATE_PREVIEW_DATABASE=true`. Plain `npm run build`
never touches a database.

**Scheduled jobs** (`vercel.json`): `/api/cron/expired-requests` (daily 07:00
UTC — lapses unanswered booking requests and emails the customer) and
`/api/cron/sweep-rate-limits` (daily 03:30 UTC). Both refuse every call unless
`CRON_SECRET` is set and presented as `Authorization: Bearer <secret>`.

**Email:** Resend. With `RESEND_API_KEY` or `EMAIL_FROM` unset nothing is
sent, and nothing else breaks.

**Backups and restores:** see
[`docs/runbooks/backup-and-restore.md`](docs/runbooks/backup-and-restore.md).
`prisma migrate status` says "up to date" even when the exclusion constraint,
RLS or the CHECKs are gone; after any restore, run
`scripts/verify-restore.sh <url>`.

## 6. Known issues — the next work, in priority order

Re-verify each before acting; the code moves faster than this list.

### Operator actions (need production access)

1. **Complete and privately document the open credential-rotation incident.**
   Staff credentials appeared in git history and earlier production secrets
   were recorded as disclosed. Rotate every affected credential, revoke old
   sessions (staff sessions can now be revoked from **Admin → Staff**),
   inspect provider audit logs, and keep the evidence in a private incident
   system, never in this repository.
2. **Check Vercel environment scoping.** `DATABASE_URL`/`DIRECT_URL` must be
   Production-only, and `MIGRATE_PREVIEW_DATABASE` must never be set where a
   preview could reach the production database.
3. **Run the production restore rehearsal** and agree RPO/RTO — the runbook's
   operator checklist (plan, PITR, retention, Cloudinary backups) is still
   open.
4. **Turn on CSP enforcement** (`CSP_ENFORCE=true` in Production) once the
   report-only logs stay clean.
5. **Supply the legal facts** in `src/lib/legal-facts.ts` (business name,
   registration, retention periods, rental terms). Until then `/privacy` and
   `/terms` render as drafts; `REQUIRE_FINAL_LEGAL_FACTS=1 npm test` lists
   what is missing.

### Engineering

6. **No error tracking.** `src/lib/observability.ts` is the single seam every
   unexpected failure passes through, but it only writes to the platform log.
   Wiring a vendor (Sentry or similar) is one edit to `deliver` there; client
   errors are still invisible.
7. **Nothing on the storefront is cacheable.** The locale is read from a
   cookie, so every page renders dynamically. Fix only together with the
   `revalidatePath` gaps that caching would expose.
8. **Connection model under load is unverified** (`connection_limit=1` on the
   pooler). Measure before changing.
9. **Missing workflows:** changing a reservation's dates, car or customer
   still means cancel and re-create; there is no no-show outcome.
10. **Platform deprecations:** `unstable_cache` (replaced by `use cache` in
    Next 16), `package.json#prisma` seed config (removed in Prisma 7), and
    `next-auth` is still a beta.
11. **Payments, before enabling:** reuse of an open checkout after the total
    changes, concurrent checkout creation, a success on a cancelled
    reservation, and a webhook racing `providerPaymentId`. Add these to the
    pre-enable checklist in `docs/online-payments.md`.
12. **Scalability hotspots that are fine today:** analytics aggregation in JS,
    the duplicate-customer regexp scan, `ILIKE '%term%'` search without
    trigram indexes, and no rate limit on `/api/vehicles` and
    `/api/availability`.
13. **Small items:** `prisma/seed.ts` still prices with the old exclusive day
    count; no `/api/health` endpoint; three `.gitkeep` files in non-empty
    folders; orphaned draft uploads in Cloudinary's `_drafts/` folder are never
    swept.

### Test coverage

`npm test` runs the unit suite with no database; `npm run test:integration`
covers auth, RBAC, the services, the double-booking constraint and the
migration-only database objects against a local Postgres. Both run in CI.

## 7. Audit history

- **27 Aug 2026** — full engineering audit:
  [`docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md`](docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md),
  its ten phase reports, and its
  [handoff](docs/audit/AUDIT-HANDOFF-2026-08-27.md). Its roadmap was worked
  through in PRs #24–#54.
- **26 Oct 2026** — admin panel audit:
  [`docs/audit/ADMIN-PANEL-AUDIT-2026-10-26.md`](docs/audit/ADMIN-PANEL-AUDIT-2026-10-26.md).
- **July 2026** — the first production-readiness and performance audits and
  the design and cleanup plans. Superseded; their findings are reconciled in
  [Phase 1 §10](docs/audit/PHASE-1-ARCHITECTURE-MAP.md), and the files are in
  git history (`git show e5f7a02:AUDIT_REPORT.md`).

## 8. Original brief

The 7-phase plan (foundation → DB → backend → auth → admin → website →
polish) is complete. SEO (sitemap, OpenGraph, JSON-LD) shipped; error
tracking (§6.6) and the `prisma.config.ts` migration remain.

Deferred by decision: **customer portal** (needs customer auth — booking
emails now exist, and the design tokens already cover it).
