# Alfa Rent — Architecture Map (Audit Phase 1)

**Audit date:** 27 August 2026
**Scope:** whole repository at `main` @ `7244622` (working tree clean)
**Method:** read-only. Source, schema, migrations, config and installed Next.js 16 docs
read directly; `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`
executed. No application code, configuration, schema, or data was modified.
**Status:** discovery only — this phase builds the model. Judgement begins in Phase 2.

> **Note on prior audit documents.** `AUDIT_REPORT.md` (24 Jul), `HANDOFF.md` (17 Jul),
> `PERFORMANCE_AUDIT.md` and `plans/001-production-cleanup-audit.md` (30 Jul) are treated
> throughout as **hypotheses to verify, never as facts**. Several of their findings are
> now fixed; several are stale in the opposite direction; and the three largest bodies of
> work in the repo (i18n, light-theme standardisation, online payments) all landed _after_
> the last audit and have never been reviewed. See §10.

---

## 1. Verified baseline

Every number below was measured during this phase, not quoted from a document.

| Check             | Command                    | Result                                                    |
| ----------------- | -------------------------- | --------------------------------------------------------- |
| Install           | `npm ci`                   | clean (lockfileVersion 3, 637 packages)                   |
| Lint              | `npm run lint`             | **pass**, no output (85 rules over 179 files)             |
| Types             | `npx tsc --noEmit`         | **pass**, exit 0                                          |
| Unit tests        | `npm test`                 | **pass** — 20 files, 94 tests, **1.24 s**                 |
| Production build  | `npm run build`            | **pass** — compiled in 2.7 s, 22 routes                   |
| Integration tests | `npm run test:integration` | **not run** — requires PostgreSQL; none available locally |
| Dependency CVEs   | `npm audit`                | **not run** — needs your authorisation (see §11)          |

Source size: **175 files in `src/`** (92 `.tsx`, 78 `.ts`), **19,026 LOC**, plus
`prisma/` (schema, 12 migrations, seed) and 671 lines of `globals.css`.

Codebase discipline markers, all verified by grep: **zero** `TODO`/`FIXME`/`HACK`,
**zero** `any` / `@ts-ignore` / `@ts-expect-error` / `eslint-disable`, **zero** circular
imports, **six** intentional `console` calls (two seed progress logs, one seed fatal,
one unhandled-error fallback, one per error boundary).

---

## 2. Technology stack

| Layer     | Technology                                                               | Notes                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | **Next.js 16.2.11**, App Router, Turbopack                               | `src/proxy.ts` is the Next 16 request boundary (the renamed `middleware.ts`) — verified against `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`, **not** a stale convention |
| Runtime   | React **19.2.4**, TypeScript **5.x strict**                              | `strict: true`; `noUnusedLocals`/`noUnusedParameters` off; `allowJs` on with no JS source                                                                                                                      |
| Styling   | Tailwind **v4**, `@theme inline`, 209 CSS custom properties              | light/dark via `:root` + `.dark`; `prefers-reduced-motion` and `prefers-reduced-transparency` fallbacks; coarse-pointer media query                                                                            |
| UI kit    | shadcn/ui in its **Base UI** flavour                                     | **not Radix** — no `asChild`; the idiom is `render={<Link/>}` + `nativeButton={false}`                                                                                                                         |
| Forms     | react-hook-form 7 + Zod 4 via `@hookform/resolvers`                      |                                                                                                                                                                                                                |
| Data      | Prisma **6.19.3** → PostgreSQL (Supabase in production)                  | pooled `DATABASE_URL` + `DIRECT_URL` for migrations                                                                                                                                                            |
| Auth      | Auth.js **v5.0.0-beta.32**, credentials provider, JWT sessions           | deliberate release line; npm reports v4 as "latest" — that would be a downgrade                                                                                                                                |
| Images    | Cloudinary, **browser-direct signed upload**                             | never proxied through a function (Vercel caps request bodies at 4.5 MB)                                                                                                                                        |
| i18n      | hand-rolled, cookie-driven, `sq` (default) + `en`                        | 549 keys, 1,217-line dictionary module                                                                                                                                                                         |
| Deploy    | Vercel; `vercel-build` = `prisma migrate deploy && next build`           | plain `build` is deliberately database-free so CI needs no DB                                                                                                                                                  |
| CI        | GitHub Actions: lint → tsc → test → migrate deploy → integration → build | runs against a `postgres:16` service container                                                                                                                                                                 |

**Documentation drift found (confirmed):** `README.md:12` lists **Framer Motion** in the
stack table — absent from `package.json`, `node_modules`, and all source.
`README.md:60` documents a **`src/hooks/`** directory — it does not exist (the sole hook,
`use-focus-trap.ts`, lives in `src/lib/`). Test counts in `HANDOFF.md` (19) and
`plans/001` (17 files / 82 tests) are both stale; the real figure is 20 files / 94 tests.

---

## 3. Application structure

Two products in one Next.js app, split by route group so they share nothing but the root
layout, the design tokens, and the service layer.

```
src/
  app/
    layout.tsx                 root: fonts, ThemeProvider, LocaleProvider, metadata
    (website)/                 PUBLIC — home, /car, /car/[slug], /booking, /contact
    (dashboard)/admin/         STAFF — dashboard, reservations, vehicles, customers,
                               calendar, analytics  (+ 6 server-action modules)
    api/                       route handlers: vehicles, availability, bookings,
                               payments/checkout, payments/webhook, auth/[...nextauth]
    login/                     staff sign-in (outside both groups)
  components/
    ui/          11 Base UI primitives (button, dialog, sheet, popover, calendar,
                 table, card, input, label, textarea, skeleton)
    shared/      cross-cutting composites (header, footer, vehicle-card, status-badge,
                 language-selector, theme/locale providers, brand-logo)
    forms/       booking-form, vehicle-form, media-grid, date-range-picker,
                 fleet-filters, hero-search, availability-widget, mobile-booking-bar
    dashboard/   admin widgets (calendar-timeline, pending-banner, detail-drawer,
                 confirm-dialog, pagination, charts, panels)
  services/      ALL data mutation — 10 modules
  lib/           auth/ db/ cloudinary/ payments/ validations/ i18n/ + errors, api,
                 rate-limit, reservation-lifecycle, vehicle-policy, booking-calendar,
                 site-config, use-focus-trap, utils
  utils/         pure helpers: pricing, rental-dates, vehicle
  types/         api.ts, next-auth.d.ts
  proxy.ts       Next 16 request boundary, matcher ['/admin/:path*']
prisma/          schema.prisma, 12 migrations, seed.ts (+ seed-safety, 2 test files)
```

### Ten largest modules

|   LOC | File                                               | Why it is large                                                                             |
| ----: | -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1,217 | `src/lib/i18n/translations.ts`                     | two 549-key dictionaries; **97.6 % of keys are referenced** — load-bearing, not dead weight |
|   642 | `src/components/forms/vehicle-form.tsx`            | 20-field entity form + media grid + repairs + registration/service blocks                   |
|   619 | `src/components/dashboard/calendar-timeline.tsx`   | continuous scrolling fleet timeline, zoom, click-to-book modal                              |
|   614 | `src/services/reservation.service.ts`              | the core domain: availability, quoting, creation, transitions, extension, calendar reads    |
|   522 | `src/components/forms/media-grid.tsx`              | drag-and-drop gallery with per-file upload progress                                         |
|   515 | `src/components/forms/booking-form.tsx`            | the whole public conversion path                                                            |
|   469 | `src/app/(dashboard)/admin/reservation-detail.tsx` | drawer + context provider + all reservation actions                                         |
|   439 | `src/services/analytics.service.ts`                | 6 exported readers, ~35 queries total                                                       |
|   398 | `src/components/forms/date-range-picker.tsx`       | one calendar system shared by public and admin                                              |
|   310 | `src/services/vehicle.service.ts`                  | admin + public reads behind one filter builder                                              |

---

## 4. Architectural patterns actually in use

These are the load-bearing conventions. Each was verified, not assumed.

1. **Services own every mutation.** A repo-wide grep for writes to `reservation`,
   `vehicle`, `customer` and `payment` finds **18 sites, all inside `src/services/`**.
   Only two non-test modules outside `services/` import Prisma at all, and neither
   touches a domain model: `lib/auth/guards.ts` (reads `User` for session
   revalidation) and `lib/rate-limit.ts` (owns its own `RateLimit` table).
   **The stated rule holds for data.**

2. **Thin boundaries.** Route handlers parse → call a service → `ok()`. Server actions
   guard → parse → call a service → `revalidatePath`. Pages `await` a guard, read
   search params through a Zod schema, and call a service.

3. **One API envelope.** `{success:true,data}` / `{success:false,error:{message,code}}`
   from `lib/api.ts` + `lib/errors.ts`, applied by `withErrorHandling` to all five
   app-owned HTTP endpoints. A seven-class `AppError` taxonomy maps to HTTP status.

4. **The database is the authority, the app is the UX.** The GiST exclusion constraint
   `reservations_no_overlap` (`tsrange`, `WHERE status IN ('CONFIRMED','ACTIVE')`) is
   what actually prevents double-booking. Every application-level availability check is
   explicitly documented as _advisory_, existing only to produce a friendly message
   instead of a raw `23P01`.

5. **Optimistic concurrency by conditional write.** State transitions use
   `updateMany({ where: { id, status: <expected> } })` and throw `ConflictError` when
   `count !== 1` — a compare-and-swap, not a read-then-write.

6. **Explicit public allowlist.** `publicVehicleSelect` (`vehicle.service.ts:34`) is a
   `Prisma.validator` scalar allowlist, not `include` — with a test that fails if a
   sensitive field is added. This exists because `include` is exactly how registration
   and service costs once leaked to the public API.

7. **Capability tokens, not guessable references.** Payment checkout requires a 256-bit
   token whose SHA-256 hash is stored on the reservation, compared with
   `timingSafeEqual`; unknown reservation and bad token return the identical 404.

8. **Untrusted upload receipts.** Photos go browser → Cloudinary directly; the server
   only ever receives a receipt, re-derives Cloudinary's signature over
   `(public_id, version)`, and **rebuilds the URL server-side** from the verified id.
   Client-supplied URLs are never stored.

9. **Decimal never crosses the boundary.** Money is `Decimal(10,2)` in Postgres and is
   converted to `Number` at each server→client edge (`detail-actions.ts` does this
   exhaustively with mapped types). Verified still true in code written after both
   prior audits.

10. **URL as admin state.** List filters, status filters and pagination live in search
    params parsed by Zod on the server; React state is reserved for genuinely ephemeral
    UI (drawer open, calendar zoom, upload progress).

11. **Server computes, client renders.** The calendar timeline receives pre-computed
    `dayLabels`, `dayDates`, `months`, `todayIndex`, `rows` — all date maths happens on
    the server.

---

## 5. Data model

10 models, all `@@map`-ed to snake_case tables.

```
User ──< RentalInspection >── Reservation ──< Payment ──< PaymentEvent
                                   │  │
Vehicle ──< Reservation ───────────┘  └──< RentalInspection ──< InspectionPhoto
   ├──< VehicleImage
   └──< Repair
Customer ──< Reservation
RateLimit  (standalone infrastructure table)
```

**Enums:** `Role`(2) `VehicleStatus`(4) `VehicleCategory`(6) `Transmission`(2)
`FuelType`(4) `ReservationStatus`(5) `InspectionType`(2) `PaymentStatus`(6).

**Referential intent is deliberate and varied:** `Restrict` on
`Reservation→Vehicle`/`Customer` and `Payment→Reservation` (history must survive);
`Cascade` on images, repairs, inspections, inspection photos, payment events.

**Invariants enforced by the database** (not just by Zod):

- `reservations_no_overlap` — GiST EXCLUDE on `(vehicleId =, tsrange(pickup,return) &&)`
  where status ∈ {CONFIRMED, ACTIVE}. `tsrange` not `tstzrange`, because Prisma
  `DateTime` maps to `timestamp without time zone` and the tz cast is not `IMMUTABLE`.
- Uniques: `users.email`, `customers.email`, `vehicles.slug`, `vehicles.plate`,
  `rental_inspections(reservationId,type)`, `inspection_photos.publicId`,
  `payments.idempotencyKey`, `payments.providerPaymentId`,
  `payment_events.providerEventId`, `reservations.paymentAccessTokenHash`.
- Two CHECK constraints on `rental_inspections`.
- **RLS enabled on all 10 tables with zero policies** (deny-by-default for Supabase's
  `anon`/`authenticated` roles), plus privilege and default-privilege revokes. The
  application's Prisma role is the table owner and therefore bypasses RLS by design.

**Indexes (19 total).** Well matched to the reservation query shapes
(`(vehicleId,pickup,return)`, `(status,pickup)`, `(status,return)`, `createdAt`).
**No index on `vehicles.brand`** — and the admin brand filter uses
`mode:"insensitive"`, which a plain btree could not serve anyway. Free-text search is
`contains … insensitive` (→ `ILIKE '%q%'`) across three tables, unindexable as written.

**Migrations:** 12, linear, append-only, hand-written (`prisma migrate dev` needs a TTY
and is not used here). One is non-reversible: `20260724161500` unconditionally nulls
matching `reservations.notes`.

---

## 6. Critical flow A — public booking request

Traced hop by hop against the code.

| #   | Hop                                                                                                                                                                                                                                                                                                                                          | Evidence                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Customer picks dates on home/fleet/detail; selection travels as `?from=&to=` search params                                                                                                                                                                                                                                                   | `(website)/page.tsx`, `car/page.tsx`, `hero-search.tsx`       |
| 2   | Detail page server-renders the booking calendar: blocked ranges + registration ceiling, as **`yyyy-MM-dd` strings** so no timezone conversion happens at the RSC boundary                                                                                                                                                                    | `reservation.service.ts:114` `getVehicleBookingCalendar`      |
| 3   | `AvailabilityWidget` debounces 250 ms, `fetch('/api/availability')`, cancels in-flight results with a `cancelled` flag                                                                                                                                                                                                                       | `availability-widget.tsx:64-99`                               |
| 4   | `/api/availability` → `checkAvailability` (status policy + registration + overlap count) then `getQuote`                                                                                                                                                                                                                                     | `api/availability/route.ts:6-13`                              |
| 5   | `/booking?vehicle=<slug>` server-renders `BookingForm` with the calendar; **no slug → `redirect()` to `/car`**                                                                                                                                                                                                                               | `booking/page.tsx:49`                                         |
| 6   | Client validation: a **second, client-local Zod schema** built from translated messages                                                                                                                                                                                                                                                      | `booking-form.tsx:34-49`                                      |
| 7   | Submit: `fetch('/api/bookings')`, dates serialised as **hardcoded `T10:00:00Z`**                                                                                                                                                                                                                                                             | `booking-form.tsx:147-153`                                    |
| 8   | Rate limit **8 per IP per hour**, then `createBookingSchema.parse`                                                                                                                                                                                                                                                                           | `api/bookings/route.ts:18-30`                                 |
| 9   | `createReservation`: advisory availability → `findOrCreateCustomerByEmail` (**never updates an existing customer** — it runs unauthenticated) → transaction: re-read vehicle, re-check status policy, assert registration covers return, compute price from the **server-side** `pricePerDay`, insert as `PENDING` with a payment-token hash | `reservation.service.ts:152-197`, `customer.service.ts:25-46` |
| 10  | 201 with `{id, status, totalPrice, paymentAccessToken}`                                                                                                                                                                                                                                                                                      | `api/bookings/route.ts:32-40`                                 |
| 11  | Client swaps the form for a confirmation card with the reference id                                                                                                                                                                                                                                                                          | `booking-form.tsx:170-199`                                    |
| 12  | Staff see it in the pending queue / pending banner / attention badge                                                                                                                                                                                                                                                                         | `pending-queue.tsx`, `pending-banner.tsx`                     |

**Two facts about this flow that matter for later phases:**

- **No notification of any kind exists.** Repo-wide grep for `nodemailer`, `resend`,
  `sendgrid`, `smtp`, `twilio`: zero hits. The customer receives no email; staff receive
  no alert. Confirmation depends entirely on someone opening the dashboard.
- **The `fetch` at `booking-form.tsx:147` has no `try`/`catch`.** A network failure
  produces no user-visible error.

## 7. Critical flow B — staff rental lifecycle

```
                    ┌──────────── ALLOWED_TRANSITIONS (reservation.service.ts:59)
   PENDING ──┬──> CONFIRMED ──┬──> ACTIVE ──> COMPLETED
             └──> CANCELLED   └──> CANCELLED
```

- **PENDING → CONFIRMED** — `updateReservationStatusAction` → `requireRole("EMPLOYEE")`
  → transition table → `assertRegistrationCovers` → conditional `updateMany`. This is
  the moment the **exclusion constraint** decides: two staff confirming competing
  requests cannot both succeed.
- **CONFIRMED → ACTIVE** — _not_ reachable through the status action, which explicitly
  refuses it (`"Record the pickup inspection to start this rental"`). It happens only
  inside `recordRentalInspection`, which in **one transaction**: validates the
  inspection type against the reservation status, rejects a duplicate, checks
  `getReservationTiming().canStart`, requires `vehicle.status === AVAILABLE`, re-checks
  registration, verifies every photo's Cloudinary signature **and folder prefix**,
  writes the inspection, then flips the reservation to `ACTIVE` + `startedAt` and the
  vehicle to `RENTED` — each with a `count !== 1` guard.
- **ACTIVE → COMPLETED** — the RETURN inspection, with a mileage floor taken from the
  PICKUP record, then `completedAt` and vehicle → `AVAILABLE`.
- **Extension** — `extendReservation` re-prices only the added days at today's rate,
  keeping the originally agreed days at the agreed price; `getExtensionWindow` computes
  the ceiling up front so staff see the limit rather than discovering it by refusal.
- **Vehicle status is _stored_, not derived** — a deliberate second source of truth kept
  in sync inside the inspection transaction. This is the single most important coupling
  in the system (§9).

## 8. Critical flow C — online payments (inert)

The whole feature is **structurally unreachable, in four independent ways**:

1. `registerPaymentProvider()` has **zero call sites** — no bank adapter exists, so
   `getPaymentProvider()` always throws `ServiceUnavailableError`.
2. `PAYMENTS_ENABLED` defaults to `"false"`; `getPaymentRuntimeConfig()` throws first.
3. `PAYMENT_PROVIDER` is empty in `.env.example`.
4. **Nothing in the UI ever calls `/api/payments/checkout`** — the booking form receives
   `paymentAccessToken`, stores it in React state, and never uses it.

`docs/online-payments.md` documents this as intentional staging pending a Kosovo bank's
gateway documentation. The ledger (`Payment`, `PaymentEvent`), the idempotency keys, the
strict status-transition table, the raw-body webhook seam and the capability token are
all built and migrated. **There is no admin surface for payments at all.**

---

## 9. Coupling and complexity map

| Area                                           | Nature of the coupling                                                                                                                                                                            | Why it matters                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`Vehicle.status` ↔ reservation lifecycle**   | Dual source of truth, synced only inside `recordRentalInspection`. `updateVehicle` writes `status` with **no invariant check at all**.                                                            | The highest-risk coupling in the codebase. Priority target for Phase 3.                                                                                                                          |
| **`AdminShell` → `ReservationDetailProvider`** | Every admin route eagerly imports the full detail-drawer graph (reservation + customer + vehicle + inspection + extension + image + date + drawer UI). **Zero dynamic imports exist in the app.** | Sets the client-JS floor for all 8 admin routes.                                                                                                                                                 |
| **`cookies()` in the root layout**             | `getI18n()` reads the locale cookie in `app/layout.tsx`, which opts **every route** into dynamic rendering.                                                                                       | Confirmed by the build: **all 22 routes are `ƒ` (dynamic)** — including `/contact`, which has no `force-dynamic` of its own. Nothing in the app can be static or cached.                         |
| **Whole dictionary → RSC payload**             | `LocaleProvider` is a client component receiving the full active dictionary as a prop.                                                                                                            | ~28 KB of JSON in every page's payload, including ~335 `admin.*` keys served to anonymous storefront visitors.                                                                                   |
| **`errors.ts` ↔ migration SQL**                | The friendly 409 for double-booking depends on `error.message.includes("reservations_no_overlap")` — a substring match on a Postgres message, not SQLSTATE `23P01`.                               | The most load-bearing invariant in the system rests on a string, with no test.                                                                                                                   |
| **`requireUser()` fan-out**                    | 25 guard call sites; layout **and** page both call it, and it is not wrapped in React `cache()`.                                                                                                  | Two identical `User` lookups per admin navigation, against a pooler documented at `connection_limit=1`. `cache()` _is_ used elsewhere (`car/[slug]/page.tsx:41`), so the pattern is established. |
| **Presentation re-implements service rules**   | The transition table, the pickup/return rule, and the rental-day pricing rule each exist in a second copy in a component. None is wrong today.                                                    | Silent-drift risk; catalogue in Phase 2.                                                                                                                                                         |
| **`analytics.service.ts`**                     | 6 readers, ~35 queries; `getDashboardData` is a **13-query `$transaction` destructured positionally**, and the calendar page invokes it a second time.                                            | Complexity + performance hotspot.                                                                                                                                                                |

---

## 10. Prior-audit claims: verified status

| Claim (source)                                                       | Verified status today                                                                                                                                                                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slug collisions latent; `createVehicle` has no dedupe (HANDOFF #2)   | **Fixed** — `slugify(brand, model, year, identity)` with `identity = plate ?? randomUUID().slice(0,8)` (`vehicle.service.ts:206`)                                                                                                      |
| `updateVehicle` silently changes public URLs (HANDOFF #3)            | **Fixed, differently** — the slug is now never recomputed. New consequence: an edited vehicle keeps a slug describing its old brand/model/year                                                                                         |
| JWT sessions cannot be revoked (AUDIT_REPORT H2)                     | **Substantially fixed** — `active` + `sessionVersion` columns, and `requireUser()` re-reads the user row on every protected request. **But `sessionVersion` has no writer anywhere in the app** — revocation is a manual SQL operation |
| `services/dashboard.service.ts` is dead code (HANDOFF #8)            | **Fixed** — file no longer exists                                                                                                                                                                                                      |
| Six dead UI modules + `sonner` + 5 scaffold SVGs (plans/001 Batch A) | **Executed** — all removed; `public/` now holds only `brand/alfa-logo-red.png`                                                                                                                                                         |
| Missing index on `reservation.createdAt` (HANDOFF #5)                | **Fixed** — `reservations_createdAt_idx`                                                                                                                                                                                               |
| Missing index on `vehicle.brand` (HANDOFF #5)                        | **Still open**                                                                                                                                                                                                                         |
| `eur()` redefined in 4 files (HANDOFF #9)                            | **Still open, and inconsistent** — 2 use `toFixed(2)` ("1234.00 EUR"), 2 use `toLocaleString(undefined,{maximumFractionDigits:0})` ("1,234 EUR"), and the latter follows the _browser_ locale, not the app locale                      |
| Nothing is cached; every admin page `force-dynamic` (HANDOFF #6)     | **Confirmed and broader** — all 22 routes are dynamic, public pages included                                                                                                                                                           |
| No error reporting beyond `console.error` (HANDOFF #7)               | **Still open**                                                                                                                                                                                                                         |
| No focus trap in `DetailDrawer`/`ConfirmDialog` (HANDOFF #10)        | **Partly fixed** — `use-focus-trap.ts` now exists and is used by the drawer and command palette; `ConfirmDialog` moved to the Base UI `Dialog`                                                                                         |
| `plans/001` Batch B / Batch C                                        | **Not executed** — 4 `eur` helpers, 14 duplicated `date-fns` locale selections, `AreaChart` and `table.tsx` still `"use client"`, still zero dynamic imports                                                                           |
| SEO: sitemap, robots, JSON-LD (HANDOFF §8 Phase 7)                   | **Still open** — `generateMetadata` exists on 6 routes; no `sitemap.ts`, `robots.ts`, or structured data anywhere                                                                                                                      |

---

## 11. Things I need to understand better

Genuine uncertainty, not hedging. Items marked **(you)** need your answer; the rest I
can resolve in later phases.

**Business rules**

1. **(you)** Should `ACTIVE → CANCELLED` be possible? Today an active rental has exactly
   one exit (COMPLETED via return inspection). Theft, write-off, or a customer who never
   returns the car have no representation.
2. **(you)** Should staff be able to manually book a vehicle in `SERVICE`? The public
   path forbids it; `createManualReservation` rejects only `INACTIVE`.
3. **(you)** Is revenue correctly bucketed by `createdAt` (when the booking was made)
   rather than by rental dates? Every figure in `analytics.service.ts` uses `createdAt`.
4. **(you)** Is unlimited overlapping `PENDING` intended? The constraint covers only
   CONFIRMED/ACTIVE, so ten customers can request the same car for the same week.
5. **(you)** What is the real fleet size and monthly reservation volume? Several
   performance questions are only answerable against real cardinality. (The seed
   generates 46 vehicles; prior docs mention 133 rows in production.)

**Operational facts not visible from the repository** 6. **(you)** Is `PAYMENTS_ENABLED` actually `false` in Vercel, and has the payments
migration been applied to production? No `.env` exists locally. 7. **(you)** Are Vercel Preview and Production environment variables scoped separately?
If not, opening a PR could run `prisma migrate deploy` against production. 8. **(you)** Which Node version builds production? `.nvmrc` says 23.5.0 (non-LTS, and
Vercel does not read `.nvmrc`), `engines` says `>=20`, this machine runs 26.6.0 —
three different versions across three environments. 9. **(you)** Is RLS actually enabled on the live Supabase database, and does the Prisma
role hold ownership/`BYPASSRLS`? The test proves the SQL was _written_; CI proves it
_applies_; neither proves production state. 10. **(you)** Does Vercel replace or append to a client-supplied `x-forwarded-for`?
This decides whether both rate limiters are header-spoofable. 11. **(you)** May I run **`npm audit`**? The previous audit declined it because it
discloses this private project's full dependency inventory to the public registry.
`npm ci` already reported vulnerabilities exist but I have not enumerated them.

**Technical questions I will resolve myself in later phases** 12. Does a Postgres exclusion-constraint violation inside a Prisma interactive
transaction actually surface with `reservations_no_overlap` in `error.message`?
Requires a live database — Phase 3. 13. Which error boundary really renders when `requireUser()` throws from the admin
_layout_? Next 16 docs say `error.tsx` does not wrap its own segment's layout. 14. Are the two dictionary literals tree-shaken out of the client bundle, or shipped
twice (once in the RSC payload, once in JS)? Needs bundle analysis — Phase 6. 15. Do the raw-SQL rate-limit semantics hold under Supabase's transaction pooler? The
tests mock `$queryRaw` entirely, so that SQL has never actually executed in CI.

---

## 12. Areas flagged for deeper investigation

Ordered by where I expect the most value, carried into Phases 2–9.

1. **`Vehicle.status` synchronisation** — the dual-source-of-truth seam, plus the
   unguarded `updateVehicle` write path.
2. **The whole payments subsystem** — newest, largest, entirely untested and unaudited,
   with money semantics: duplicate checkouts, webhook idempotency under concurrency,
   extension-vs-settled-amount reconciliation, expiry reaping.
3. **Concurrency around reservations** — the one integration test covers a single race;
   the constraint, the CAS updates, and the error mapping deserve real database proof.
4. **Non-atomic external side effects** — `syncVehicleImages` (Cloudinary + DB, no
   transaction), `deleteVehicle`, `createVehicleAction` (vehicle created, images fail).
5. **Rendering and caching architecture** — one `cookies()` call makes 22 routes dynamic;
   no route can be cached; the dashboard fires ~17 queries per load with duplicated
   auth lookups.
6. **Test strategy** — 7 of 20 test files assert on _source text_ rather than behaviour;
   all 7 landed 28–30 July, after the last audit. Services, auth, RBAC and every admin
   surface have no behavioural coverage.
7. **i18n completeness** — service error messages are hardcoded English and rendered raw
   in an Albanian-default UI; 9 date-formatting sites omit the locale entirely.
8. **Accessibility** — hand-rolled overlays (drawer, palette, calendar booking modal),
   with the calendar modal having neither focus trap nor restore.
9. **Observability** — `console.error` only; no error reporting, no audit log of staff
   actions beyond `RentalInspection.createdById`, no sign-in logging.

---

## 13. What already looks genuinely good

Recorded now so later phases do not erode it.

- The **database-as-authority** posture, and the discipline of labelling application
  checks as advisory.
- **Comments that explain _why_.** Nearly every non-obvious decision carries its
  rationale and, frequently, the incident that motivated it. This is unusually good and
  made this audit dramatically faster.
- The **public DTO allowlist** with a test that fails when a sensitive field is added.
- **Direct-to-Cloudinary uploads with server-side signature verification** and
  server-rebuilt URLs.
- The **inspection transaction** — a legally significant record and two state changes,
  atomic, with compare-and-swap guards.
- **`utils/rental-dates.ts`** — all-UTC, documented, and the only date module with real
  test coverage.
- **Zero** `any`, `TODO`, lint suppressions or circular imports across 19 k LOC.
- A **clean, fast, meaningful CI pipeline** that runs migrations against a real Postgres.
- The **seed safety gate** — refuses to run without an explicit wipe acknowledgement and
  two distinct 16+ character passwords.

---

_End of Phase 1. No code was modified. Phase 2 (Code Quality & Architecture) has not
begun._
