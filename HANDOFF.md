# Alfa Rent — Engineering Handoff

Written 17 July 2026. Read this first, then `README.md` for setup.

This is a continuation brief for whoever picks the project up next, human or
agent. It covers what exists, what is deliberately the way it is, what is
known-broken, and what to do next — in priority order.

---

## 1. What this is

A car rental platform for a real Kosovo business (part of the Alfa Globe
group). Two products in one Next.js app:

- **Public site** — fleet browsing, availability, booking requests.
- **Admin dashboard** — staff manage vehicles, reservations, customers,
  a fleet calendar, analytics, and per-vehicle running costs.

**Live:** https://alfa-rent.vercel.app · **Repo:** github.com/endritbejta/alfa-rent (private)

Staff login: `admin@alfarent.com` / `employee@alfarent.com`, password
`ChangeMe123!` (seeded — change before real use).

## 2. Stack and where things live

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (**Base UI**
flavour) · Prisma + PostgreSQL (Supabase) · Auth.js v5 · Cloudinary · Vercel.

```
src/
  app/(website)/     public routes      app/(dashboard)/admin/  staff routes
  app/api/           route handlers     components/dashboard/   admin widgets
  services/          ALL business logic components/forms/       forms
  lib/validations/   Zod schemas        components/shared/      cross-cutting
  lib/auth/          Auth.js + guards   utils/                  pure helpers
prisma/              schema + migrations + seed
```

**The one rule that matters:** business logic lives in `services/`. Pages,
route handlers and server actions validate input, call a service, and format
the result. Keep it that way — it is why the logic is testable.

## 3. Conventions you must know (these have bitten before)

- **shadcn here is Base UI, not Radix.** There is no `asChild`. Use
  `render={<Link/>}` plus `nativeButton={false}` on `Button`, and the same
  `render` pattern on `DialogTrigger`.
- **`prisma migrate dev` needs a TTY and will not run here.** Hand-write
  `prisma/migrations/<timestamp>_<name>/migration.sql`, then
  `npx prisma migrate deploy`. Every migration in this repo was made that way.
- **Restart the dev server after `prisma generate`**, or you get
  `PrismaClientValidationError` from a stale client.
- **Prisma `Decimal` cannot cross the server/client boundary.** Convert to
  `Number` at the edge (server action return, or the page's `.map`). This has
  caused two separate bugs.
- **`Prisma.groupBy` loses its types inside `$transaction([...])`** — use
  `Promise.all` instead.
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

The full design system (tokens, palette, component specs) is at
https://claude.ai/code/artifact/c6d3cf98-a175-4d1c-9d96-2ed57a4dd268

## 5. Environment

`.env` is gitignored and **currently points at Supabase (production)**.

> **Careful:** `npm run dev` therefore reads and writes live data, and
> `npm run db:seed` would **wipe it**. For day-to-day work, uncomment the
> local Postgres lines at the top of `.env`.

`AUTH_URL` must stay `http://localhost:3000` locally; the deployed URL lives
in Vercel's env. Vercel vars are marked **Sensitive**, so `vercel env pull`
returns empty strings — use `vercel logs <url> --json` to diagnose instead
(that is how the localhost-database bug was found).

## 6. Known issues — the next work, in priority order

### Security / correctness

1. **Rotate the Supabase credentials.** The DB password, `service_role` key
   and JWT secret were pasted into a chat on 16 Jul. Not in git, but exposed.
2. **Slug collisions are latent.** `createVehicle` has no dedupe, but the seed
   needed it. Production already has 2× E-Class, 2× RAV4, 2× Octavia (different
   years). Buying a second E-Class _of the same year_ → P2002 with an unhelpful
   message. Normal business action, guaranteed to happen.
3. **`updateVehicle` silently changes public URLs.** Editing brand/model/year
   regenerates the slug and breaks any shared or indexed `/car/[slug]` link.
   No redirect.
4. **Timezone.** Pickup times are hardcoded `T10:00:00Z` and dates are
   `timestamp` without zone. Kosovo is UTC+2, so a "10:00" pickup stores as
   12:00 local. Needs a real decision before staff rely on times. Possibly
   worse than it looks — audit it properly. (`utils/rental-dates.ts` is
   UTC-correct and tested; it is the pattern to follow, not a fix for this.)

### Performance

5. **Missing indexes.** No index on `reservation.createdAt` (analytics filters
   it 9×) or `vehicle.brand` (the new filter). Fine at 133 rows, sequential
   scans at 100k.
6. **Nothing is cached.** Every admin page is `force-dynamic`; the dashboard
   fires ~11 queries per load against a pooler with `connection_limit=1`.

### Observability (blocks "production ready")

7. **No error reporting.** `console.error` only. Wire Sentry or similar —
   the error boundaries already surface a `digest` to correlate against.

### Cleanup

8. `services/dashboard.service.ts` is **dead code** (referenced only by itself).
9. `eur()` is redefined in **4** files. `getFleetCostSummary()` is built,
   tested, and unused — wire it into analytics or delete it.
10. No focus trap or focus restore in `DetailDrawer` / `ConfirmDialog`.
11. Registration/service **cost** fields exist in schema and form, but the seed
    leaves them null, so the vehicle cost overview shows 0 for those lines.
12. **Orphaned draft uploads.** Photos added on the _new vehicle_ page upload
    to `alfa-rent-a-car/vehicles/_drafts/<uuid>/` and are renamed into place
    on save. Abandon the form and the assets stay there. Harmless but
    unbounded — a sweep of `_drafts/` older than a day would settle it.

### Test coverage

19 tests: pricing, booking validation, the public-payload guard, the rate
limiter. **Zero** coverage of auth, RBAC, the services, or the overlap
constraint — the places bugs have actually appeared.

## 7. Audit scores (17 Jul, after fixes)

Architecture 7 · Code Quality 7 · Frontend 7 · Backend 7 · Database 7 ·
Security 6 (was 4) · Performance 6 · Maintainability 7 · Scalability 5 ·
Reusability 6 · DevEx 7 · **Production Readiness 6** (was 4)

Still short of "ready" mainly on **observability** (#7) and **scalability**
(#5, #6). The original blockers — red CI, the public data leak, the
customer-overwrite hole, no rate limiting, no error boundaries — are fixed
and verified in production.

## 8. Original brief

The 7-phase plan (foundation → DB → backend → auth → admin → website →
polish) is complete through Phase 6. **Phase 7 remains:** SEO (sitemap,
OpenGraph, JSON-LD structured data), error logging, and the `prisma.config.ts`
migration (`package.json#prisma` is deprecated in Prisma 7).

Deferred by decision: **customer portal** (needs customer auth + email
infrastructure — design tokens already cover it).
