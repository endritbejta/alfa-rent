# Alfa Rent — Audit Handoff

**Written:** 27 August 2026 · **Audited commit:** `7244622` on `main` (tree clean)
**Audience:** the next engineer or agent continuing this work.
**Self-contained:** you do not need to re-run the audit. Full evidence per topic is in
`docs/audit/PHASE-1…10` plus `docs/audit/ALFA-RENT-ENGINEERING-AUDIT.md`.

> **Read this first, then §17 (must not change) before touching anything.**
> The audit was read-only: no application code, config, schema or data was modified.

---

## 0. Operating rules for this repository

These have caused real incidents. Some are documented only in `HANDOFF.md`; they belong here
too.

| Rule                                                                                                                                               | Why                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`AGENTS.md` says: read `node_modules/next/dist/docs/` before writing Next-specific code.** Follow it.                                            | Next 16 has breaking changes. **Five would-be findings in this audit dissolved on reading those docs** — e.g. `priority` is _deprecated in favour of_ `preload`, and `src/proxy.ts` is correct, not stale middleware.      |
| **Never run `prisma migrate dev`, `migrate reset` or `db push`.**                                                                                  | Four database objects are invisible to `schema.prisma` (§7 H7). Those commands drop the double-booking constraint and all RLS. Hand-write `prisma/migrations/<ts>_<name>/migration.sql`, then `npx prisma migrate deploy`. |
| **Restart the dev server after `prisma generate`.**                                                                                                | Stale client → `PrismaClientValidationError`.                                                                                                                                                                              |
| **Prisma `Decimal` cannot cross the server/client boundary.** Convert to `Number` at the edge.                                                     | Has caused two bugs.                                                                                                                                                                                                       |
| **`Prisma.groupBy` loses its types inside `$transaction([...])`.** Use `Promise.all`.                                                              | Documented in code.                                                                                                                                                                                                        |
| **shadcn here is the Base UI flavour, not Radix.** No `asChild`; use `render={<Link/>}` + `nativeButton={false}`.                                  | Costs an afternoon if unread.                                                                                                                                                                                              |
| **Never route an uploaded file through a server action or route handler.**                                                                         | Vercel caps function request bodies at 4.5 MB regardless of Next config. Photos go browser → Cloudinary signed; the action carries only the receipt.                                                                       |
| **A direct upload means the client names the asset.** Verify Cloudinary's response signature and rebuild the URL server-side from the verified id. | Never store a client-supplied URL.                                                                                                                                                                                         |
| **ESLint forbids sync `setState` in an effect.** Wrap in `setTimeout(…, 0)`. Do **not** use `requestAnimationFrame`.                               | rAF does not fire in non-painting contexts and silently broke two features.                                                                                                                                                |
| **Never spread an optional-typed object straight into a Prisma `update`.**                                                                         | `undefined` means "leave unchanged". This is the root cause of bug B2 and latent bug L3 — and **only** those two (all 12 update sites enumerated).                                                                         |
| **Verify through the page, not the service.**                                                                                                      | A service test passed while the fleet filters were completely dead; the bug was in the page's `safeParse`.                                                                                                                 |
| Money is `Decimal(10,2)`. Never `float`. Conventional commits. `git commit -F <file>` for long messages.                                           |                                                                                                                                                                                                                            |

---

## 1. Architecture in one page

Two products in one Next.js 16 app, split by route group.

```
src/
  app/
    layout.tsx              root: fonts, ThemeProvider, LocaleProvider, metadata
                            ⚠ calls cookies() → makes ALL 22 routes dynamic (§9 H6)
    (website)/              PUBLIC: /, /car, /car/[slug], /booking, /contact
    (dashboard)/admin/      STAFF: dashboard, reservations, vehicles, customers,
                            calendar, analytics + 6 server-action modules
    api/                    vehicles · availability · bookings · payments/{checkout,webhook}
                            · auth/[...nextauth]
    login/                  staff sign-in (outside both groups)
  components/{ui,shared,forms,dashboard}/
  services/                 ALL data mutation — 18 write sites, none elsewhere
  lib/{auth,db,cloudinary,payments,validations,i18n}/ + errors, api, rate-limit,
      reservation-lifecycle, vehicle-policy, booking-calendar, site-config, use-focus-trap
  utils/                    pure: pricing, rental-dates, vehicle
  proxy.ts                  Next 16 request boundary, matcher ['/admin/:path*']
prisma/                     schema + 12 hand-written migrations + destructive seed
```

**Stack:** Next 16.2.11 · React 19.2.4 · TypeScript strict · Prisma 6 → PostgreSQL (Supabase)
· Auth.js 5.0.0-beta.32 (JWT) · Tailwind v4 · shadcn/**Base UI** · Cloudinary · Vercel.

**Load-bearing patterns:** services own every mutation · the **database is the authority**
(GiST exclusion constraint) and app checks are explicitly advisory · optimistic concurrency via
`updateMany({where:{id,status:expected}})` + `count !== 1` · explicit public DTO allowlist ·
capability tokens for payment · untrusted upload receipts · Decimal never crosses the boundary
· URL-as-state for admin list controls.

**Baseline (verified 27 Aug):** lint clean · `tsc --noEmit` clean · 94/94 tests pass in 1.24 s ·
production build passes · **all 22 routes dynamic**.

---

## 2. Important files

| File                                                 |  LOC | Why it matters                                                       |
| ---------------------------------------------------- | ---: | -------------------------------------------------------------------- |
| `src/services/reservation.service.ts`                |  614 | The core domain. **One aggregate — do not split.**                   |
| `src/services/inspection.service.ts`                 |  167 | The only path to ACTIVE/COMPLETED. Fully atomic.                     |
| `src/services/vehicle.service.ts`                    |  310 | Public DTO allowlist + `updateVehicle` (bug B14).                    |
| `src/services/analytics.service.ts`                  |  439 | 6 readers, ~35 queries. Mixed month semantics (B10).                 |
| `src/services/image.service.ts`                      |  111 | Not atomic; 3 N+1 loops (B11/B12).                                   |
| `src/lib/rate-limit.ts`                              |   77 | **Fails closed (B3) — the C2 lockout chain.**                        |
| `src/lib/errors.ts`                                  |  136 | Error taxonomy; the untested constraint substring match.             |
| `src/lib/auth/guards.ts`                             |   46 | The real authz boundary. Re-reads the user every request.            |
| `src/lib/reservation-lifecycle.ts`                   |  122 | DST-safe business-day maths. **Verified correct.**                   |
| `src/lib/i18n/translations.ts`                       | 1217 | 549 keys, 97.6% used, compile-time key safety.                       |
| `src/components/forms/booking-form.tsx`              |  515 | The revenue path. **Bug B1.**                                        |
| `src/components/forms/vehicle-form.tsx`              |  642 | Cohesive — **do not split.** Hosts the repairs panel (B4).           |
| `src/components/dashboard/calendar-timeline.tsx`     |  619 | ~18.7k DOM buttons; `BookingModal` a11y gap.                         |
| `src/app/(dashboard)/admin/reservation-detail.tsx`   |  469 | Context + drawer + body in one file.                                 |
| `prisma/migrations/20260715060451_.../migration.sql` |    — | **The exclusion constraint. The system's most important invariant.** |

---

## 3. Critical flows

**Public booking.** `/car` → `/car/[slug]` (server-renders blocked ranges as `yyyy-MM-dd`
strings) → availability widget debounces 250 ms to `GET /api/availability` → `/booking?vehicle=`
→ client Zod → `POST /api/bookings` (8/hr/IP) → `createReservation`:
`findOrCreateCustomerByEmail` **outside** the transaction, then a transaction re-reading the
vehicle, re-checking the status policy, asserting registration covers the return, pricing from
the **server's** rate, inserting `PENDING`. → 201 with a reference id.
**No notification of any kind is sent — no email/SMS infrastructure exists.**

**Rental lifecycle.**
`PENDING → CONFIRMED` (employee action; the **exclusion constraint decides** here) →
`CONFIRMED → ACTIVE` **only** via `recordRentalInspection` PICKUP (atomic: validates type,
rejects duplicates, checks the pickup day, requires vehicle `AVAILABLE`, re-checks
registration, verifies each photo's signature **and folder**, writes the record, flips
reservation + vehicle with `count !== 1` guards) → `ACTIVE → COMPLETED` via RETURN inspection
(mileage floor from PICKUP) → `CANCELLED` from PENDING/CONFIRMED only.
Extension re-prices only the added days at today's rate.
**`Vehicle.status` is stored, not derived — three writers, one unguarded.**

**Payments — inert, four independent gates.** No adapter registered
(`registerPaymentProvider` has zero call sites) · `PAYMENTS_ENABLED` defaults false ·
`PAYMENT_PROVIDER` empty · **no UI ever calls checkout**. The ledger, idempotency keys, status
machine, capability token and webhook seam are all built. **No admin payment surface exists.**

---

## 4. Confirmed bugs

| ID      | Bug                                                               | Location                                                             | Cause                                                                                                                                                                                   | Sev  | Conf      | Action                                                                                                  |
| ------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------- | ------------------------------------------------------------------------------------------------------- |
| **B1**  | Booking lost silently on any network error                        | `booking-form.tsx:145-168` `onSubmit`                                | `fetch` has no `try`/`catch`; RHF resets `isSubmitting` then re-throws as an unhandled rejection React 19 does not route to a boundary                                                  | high | confirmed | wrap in `try`/`catch`, `setServerError(...)`. **3 lines**                                               |
| **B2**  | Five optional vehicle fields cannot be cleared                    | `vehicles/actions.ts:32-49` `parseVehicleFields`                     | `get(x) \|\| undefined` → `.partial()` keeps the key → Prisma reads `undefined` as no-change. Affects `plate`, `registrationDate`, `lastServiceDate`, `nextServiceDate`, `serviceNotes` | high | confirmed | map to `null`; schema accepts `null`                                                                    |
| **B3**  | Limiter fails **closed**, contradicting its own comment           | `rate-limit.ts:28-49` `consumeRateLimit`                             | `$queryRaw` unwrapped; only the empty-rowset branch fails open. Propagates out of `authorize()` → failed sign-in for everyone                                                           | high | confirmed | `try`/`catch` → return the same fail-open result. **Breaks the C2 chain**                               |
| **B4**  | Opening the repairs panel blocks saving the vehicle               | `repairs.tsx:150` inside `vehicle-form.tsx:126`                      | Panel's `required` inputs are inside the vehicle `<form>`, which has **no `noValidate`**. Also duplicate `name`/`id="description"`                                                      | high | confirmed | give `RepairsPanel` its own `<form>`; rename fields `repair-*`. **Removes 3 workarounds + an a11y bug** |
| **B13** | RETURN branch does not verify the vehicle was released            | `inspection.service.ts:159-162`                                      | `updateMany({where:{status:"RENTED"}})` with **no count check**, unlike the PICKUP branch at `:140`                                                                                     | high | confirmed | assert `count === 1`, or comment why leniency is intended                                               |
| **B14** | `updateVehicle` can mark a rented car available                   | `vehicle.service.ts:216-222`                                         | Bare `update({data: input})`; `input` includes `status`; no invariant check                                                                                                             | high | confirmed | reject contradicting status changes, or split status into a guarded transition                          |
| **B5**  | Calendar bar-width guard is dead code                             | `calendar/page.tsx:99`                                               | `to === r.returnDate` is always false — `date-fns` `min()` returns a clone (verified by execution). The clipped and unclipped cases render identically                                  | med  | confirmed | compare `getTime()`. Visual impact needs a browser to confirm                                           |
| **B6**  | Two different "lifetime spend" figures for one customer           | `reservation-detail.tsx:180,411` vs `customer-detail-body.tsx:22,31` | Both sum a **truncated** include — `take: 20` vs `take: 50` — and format differently (`toFixed(2)` vs `Math.round`)                                                                     | med  | confirmed | one service function using a DB `_sum`                                                                  |
| **B7**  | `?page=abc\|0\|-3` throws a crash screen                          | `reservations/page.tsx:46`, `customers/page.tsx:26`                  | `paginationSchema.parse` throws; the fleet page uses per-field `.catch()` and is correct                                                                                                | med  | confirmed | apply `.catch(1)`                                                                                       |
| **B8**  | Palette search: stale results overwrite fresh                     | `command-palette.tsx:123-138`                                        | Cleanup clears the timer but not the in-flight action; no `cancelled` flag (the availability widget has one)                                                                            | med  | confirmed | copy the `cancelled` pattern                                                                            |
| **B9**  | Palette reports every failure as "nothing matches"                | `command-palette.tsx:133`                                            | `setHits("error" in result ? [] : result.hits)` — the only discarded error in the codebase                                                                                              | med  | confirmed | keep and render the error                                                                               |
| **B10** | Revenue KPI and revenue chart disagree on months                  | `analytics.service.ts:32,331` vs `:58,282`                           | Mixes `startOfMonth` (UTC on Vercel) with `businessMonthStart` (Belgrade). A booking made 22:00–24:00 UTC on the last day lands in different months                                     | med  | confirmed | use `business*` throughout                                                                              |
| **B11** | Failed photo save → vehicle created; retry duplicates it          | `vehicles/actions.ts:93-95`                                          | `createVehicle` commits, then `syncVehicleImages` can throw. Plateless vehicles get a random slug suffix, so no unique constraint stops the second                                      | med  | confirmed | one transactional service function                                                                      |
| **B12** | Delete destroys Cloudinary photos, then a DB delete that can fail | `vehicle.service.ts:227-255`                                         | Three non-atomic steps; `onDelete: Restrict` makes the final delete fail if a booking lands in the TOCTOU window. Photos are already gone                                               | med  | confirmed | DB delete first inside a transaction, assets after                                                      |
| **B15** | Inspection photos silently truncated past six                     | `inspection-photo-upload.tsx:107-133`                                | `.slice(0, room)` with no message; if full, returns having done nothing visible                                                                                                         | med  | confirmed | report truncation; track rejections per file                                                            |
| **B16** | Extension refusals matched by English string equality             | `extend-reservation.tsx:50-62`                                       | Compares `extension.reason` to three exact literals from `reservation.service.ts:421`; the 4th case never matches                                                                       | low  | confirmed | error codes                                                                                             |
| **B17** | Pending banner flashes before hydration                           | `pending-banner.tsx:45-56`                                           | Reads `localStorage` in an effect; the sidebar solves this with a cookie and documents why                                                                                              | low  | confirmed | cookie, matching `sidebar-state.ts`                                                                     |
| **B18** | Banner memory vs persisted state diverge after 8                  | `pending-banner.tsx:60`                                              | `setDismissed(next)` but persists `next.slice(-8)`                                                                                                                                      | low  | confirmed | persist what you set                                                                                    |
| **B19** | Object URLs never revoked on unmount                              | `inspection-photo-upload.tsx`                                        | Revoked only in `remove()`                                                                                                                                                              | low  | confirmed | cleanup effect                                                                                          |
| **B20** | `EXIT_MS = 192` contradicts its own comment                       | `detail-drawer.tsx:9`                                                | Comment says it must match `--motion-panel-exit`, which is `160ms`                                                                                                                      | low  | confirmed | align                                                                                                   |

## 5. Potential bugs

**Highly likely** — mechanism certain, trigger timing-dependent:

- `syncVehicleImages` (`image.service.ts:70-101`) — a mid-loop failure leaves the gallery
  half-reconciled with no rollback. The _ordering_ is deliberate and documented; the missing
  rollback is not. **Made likely by the absent Cloudinary timeout (§8).**
- `errors.ts:116-123` — the friendly double-booking 409 depends on
  `error.message.includes("reservations_no_overlap")`. **Untested.** A Prisma upgrade that
  rewords the wrapper turns every double-booking into an opaque 500.

**Latent — cannot fire while payments are off. Fix ALL of these before registering an adapter:**

| ID  | Issue                                                                                     | Location                      |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| L1  | Two concurrent checkouts → two payments (no lock, no unique constraint)                   | `payment.service.ts:89-108`   |
| L2  | Concurrent duplicate webhooks both pass the duplicate check                               | `payment.service.ts:161-183`  |
| L3  | `failureCode`/`failureMessage` survive a later success (**same `undefined` cause as B2**) | `payment.service.ts:191-199`  |
| L4  | Nothing reaps expired checkouts; `isTerminalPaymentStatus` has no caller                  | `payment.service.ts:36-49`    |
| L5  | Extension changes `totalPrice` with no reconciliation against a settled payment           | `reservation.service.ts:490`  |
| L6  | Internal faults reported to the customer as a bank outage                                 | `payment.service.ts:110-152`  |
| L7  | Walk-in reservations can never be paid online (no `paymentAccessTokenHash`)               | `reservation.service.ts:236`  |
| L8  | Return/cancel URLs point at `/booking`, which redirects away without a `vehicle` param    | `payments/config.ts:53-54`    |
| L9  | Webhook has no rate limit; the 256 KB cap runs _after_ the body is buffered               | `payments/webhook/route.ts:8` |

## 6. Cross-system findings

**C2 · Anonymous traffic → staff lockout.** Unrate-limited `/api/availability` +
`/api/vehicles` → saturate the `connection_limit=1` pool → `rate_limits` writes fail → B3
throws → `authorize()` fails → **every staff member gets "invalid credentials"**. Fixing B3
alone breaks the chain.

**C4 · A returned car silently leaves the fleet.** B14 (set a rented car to `SERVICE`) + B13
(RETURN release no-ops, unchecked) + `isPublicBookableVehicleStatus` excluding `SERVICE` → the
car is off the storefront, unbookable, forever. **Nothing surfaces it:** no reconciliation
check exists, and `getDashboardData()` computes `kpis.maintenance` and renders it **zero
times**.

**X3 · Caching work must include the revalidation gaps.** The uneven `revalidatePath` coverage
is harmless today (`staleTimes.dynamic` defaults to 0 since Next 15 + everything
`force-dynamic`). **It becomes a set of live staleness bugs the moment caching is introduced.**
Close them in the same change. Known gaps: `createManualReservationAction` omits
`/admin/reservations`; nothing ever revalidates `/admin/analytics` or `/admin/customers`;
`POST /api/bookings` revalidates nothing.

## 7. Security findings

| ID     | Finding                                                                                                                                                                                                                                               | Location                                            | Sev  | Conf                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| **S1** | **Post-login redirect bypassable** → phishing on the genuine domain. `/\evil.com`, `/\/evil.com`, `/<TAB>/evil.com` all pass and resolve off-origin (verified by execution). Auth.js's own validation is bypassed by `redirect:false` + `router.push` | `login/page.tsx:29-32` → `login-form.tsx:33`        | high | guard bypass confirmed; router navigation **not** browser-verified |
| **S2** | No way to create, deactivate or revoke staff. No `session.maxAge` (30-day rolling default); `sessionVersion` is read every request but **never written**; no staff UI                                                                                 | `auth/config.ts:13-15`                              | med  | confirmed                                                          |
| **S3** | Two unauthenticated DB endpoints with no rate limit and no `Cache-Control`                                                                                                                                                                            | `api/vehicles`, `api/availability`                  | med  | confirmed                                                          |
| **S4** | Any EMPLOYEE can mint Cloudinary write credentials for an **arbitrary** reservation id (never verifies it exists or is inspectable)                                                                                                                   | `reservations/actions.ts:30-54`                     | med  | confirmed                                                          |
| **S5** | CSP has **no `default-src`/`script-src`** — zero XSS mitigation. _(No XSS vector found, so this is a missing layer, not a hole)_                                                                                                                      | `next.config.ts:5-8`                                | med  | confirmed                                                          |
| **S6** | EMPLOYEE can read per-vehicle **net profit**, while only ADMIN can edit vehicles. **May be intended — verify**                                                                                                                                        | `detail-actions.ts:106` → `fleet.service.ts:155`    | med  | code confirmed, intent unknown                                     |
| S7     | `deleteRepairAction` never checks the repair belongs to the vehicle (ADMIN-only, so defence-in-depth)                                                                                                                                                 | `vehicles/actions.ts:155-167`                       | low  | confirmed                                                          |
| S8     | Vehicle images verify the signature but **not the folder**; inspection photos verify both                                                                                                                                                             | `image.service.ts:57` vs `inspection.service.ts:97` | low  | confirmed                                                          |
| S9     | Public bookings unverified by email → a real customer's record can be polluted                                                                                                                                                                        | `customer.service.ts:25`                            | low  | confirmed (deliberate trade-off)                                   |
| S10    | A 256-bit payment token is minted and transmitted for **every** booking, then discarded unused                                                                                                                                                        | `reservation.service.ts:163,192`                    | low  | confirmed                                                          |
| S11    | The generic 500 path logs the whole error object (Prisma `meta` can carry PII) into Vercel logs, with no retention policy                                                                                                                             | `errors.ts:125`                                     | low  | confirmed                                                          |

**Verified sound — do not re-investigate:** no XSS surface (no `dangerouslySetInnerHTML`,
`innerHTML`, `eval`; all `src` values rebuilt server-side) · no SQL-injection surface (one raw
query, tagged template) · **CSRF covered** — Next enforces same-origin on Server Actions by
default and `allowedOrigins` is unset · authorization three layers deep, **all 16 actions
guarded**, immediate revocation · bcrypt + dummy compare + generic errors · capability token
compared with `timingSafeEqual`, identical 404 for unknown-vs-bad · RLS deny-by-default on all
10 tables with a schema-derived test · secrets never client-side (4 `NEXT_PUBLIC_` vars, all
contact details).

## 8. Reliability infrastructure — none

**There is not a single timeout, abort signal, or retry anywhere in the application.**

| Call                 | Consequence                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch` × 2          | No `AbortSignal`; a hung request never resolves its `finally`                                                                                                                                                       |
| XHR → Cloudinary × 2 | `xhr.timeout` defaults to 0. A stalled upload leaves `status:"uploading"` forever and the inspection form's Save is gated on it — **recoverable** only by discovering the tile's ✕                                  |
| Cloudinary SDK       | No `timeout` configured (~60 s default) × up to 32 sequential calls in `syncVehicleImages`, under Vercel's function limit (no `vercel.json`, no `maxDuration`) → **killed mid-loop → the non-atomic partial write** |
| Prisma               | No `transactionOptions`. Defaults `maxWait 2000ms` / `timeout 5000ms` against `connection_limit=1`; the 13-query dashboard transaction can fail to _acquire_ → generic 500                                          |

## 9. Performance findings — all measured from the real build

| ID     | Finding                                                                                                                                                                  | Measurement                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **H5** | **Duplicate library chunks** — `react-day-picker`+`date-fns` emitted **4×** (47.2 KiB gzip each), `zod` **2×** (63.1 KiB each), one per route island so not cache-shared | **315 KiB gzip = 38% of all client JS**                                            |
| **H6** | **Nothing cached; 22/22 routes dynamic** — caused by one `cookies()` call in the root layout                                                                             | `/contact` floor 48 KiB gzip                                                       |
| PERF-2 | Every admin route eagerly loads the whole detail-drawer graph; **zero dynamic imports exist**                                                                            | admin floor **211 KiB gzip**, spread <40 KiB across 9 routes                       |
| PERF-6 | `requireUser()` runs **twice** per admin render, uncached (React `cache()` used once in the codebase, correctly, at `car/[slug]/page.tsx:42`)                            | —                                                                                  |
| PERF-7 | `getDashboardData()` (13 queries) is called by **both** dashboard and calendar                                                                                           | calendar = **19 queries**                                                          |
| PERF-8 | 3 N+1 loops, all in `image.service.ts`                                                                                                                                   | up to **32 sequential round trips** for 8 photos                                   |
| PERF-9 | 3 unindexable `ILIKE '%q%'` searches; no `vehicles.brand` index; `getVehicleBrands` scans                                                                                | —                                                                                  |
| PERF-3 | Fleet page serialises **three** renderings of the same list                                                                                                              | at `perPage: 24`                                                                   |
| PERF-4 | Images optimised twice (Cloudinary 1920×1080, then Vercel's optimizer)                                                                                                   | —                                                                                  |
| —      | i18n dictionary in every RSC payload                                                                                                                                     | 24.0 KiB raw / 8.2 KiB gzip, **61% admin-only keys shipped to anonymous visitors** |

**Queries per admin render:** calendar 19 · analytics 18 · dashboard 17 · customers 12 ·
reservations 11 · vehicles 11 (layout 3 + page).

## 10. Scalability — what breaks first

1. **The connection pool (breaks with _users_, not rows).** `connection_limit=1` + 11–19
   queries/render + zero caching + two unlimited public endpoints. **Already the binding
   constraint.** Verify the setting first — it may be a one-character fix.
2. **Free-text search (rows).** Three sequential-scan `ILIKE` queries per ⌘K keystroke. Fix:
   `pg_trgm` GIN.
3. **Analytics in application memory (rows).** `findMany` over six months, bucketed with
   `filter`+`reduce` per bucket. Fix: `date_trunc` + `GROUP BY`.
4. **Calendar DOM (fleet size).** One `<button>` per vehicle per day; `MAX_MONTHS = 14` →
   **~18,700 buttons today, ~187,000 at 10× fleet.** _(The file already optimised day
   dividers into one gradient "to avoid a node per cell"; the click targets reintroduced it.)_
5. `getVehicleBrands()`'s `distinct` scan.

## 11. UX / accessibility findings

| ID     | Finding                                                                                                                                                                                                                                                                                                                                                 | Location                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **U1** | **No admin mutation confirms it worked.** No toast mechanism exists; `?created=1` is dead code. This is why B2 and B11 went unnoticed                                                                                                                                                                                                                   | app-wide                       |
| **A1** | Dark theme: **3 computed contrast failures** — white on `--primary #e8535c` = **3.61**, white on `--success #1aa36a` = **3.24** (need 4.5); `--input rgba(255,255,255,.16)` = **1.62** (needs 3.0). Light theme passes all 20 pairs, and light `--input #918b89` = 3.36 **with a comment saying it must clear 3:1 — the fix was never carried to dark** | `globals.css` `.dark`          |
| **A2** | **Zero live regions** (`aria-live: 0`, `role="status": 0`). Six async messages silent; **booking success moves no focus and announces nothing**                                                                                                                                                                                                         | app-wide                       |
| **A3** | `BookingModal` is the only overlay with no `role="dialog"`, no `aria-modal`, no focus trap/restore. Its backdrop is a full-viewport `<button aria-label="Close">` — the first tab stop. Escape _does_ work                                                                                                                                              | `calendar-timeline.tsx:485`    |
| **A8** | Interactive content nested inside `role="button"` — `InspectionAction`/`StatusActions` inside the clickable row, on the busiest staff screen                                                                                                                                                                                                            | `reservation-rows.tsx:56,131`  |
| A4     | Two unlabelled selects — `Group` renders its label as a `<p>`                                                                                                                                                                                                                                                                                           | `vehicle-filters.tsx:101,116`  |
| A5     | Duplicate `id="description"` → the repairs label points at the vehicle's textarea                                                                                                                                                                                                                                                                       | (B4's root cause)              |
| A6     | `jsx-a11y`: only **6 of ~35 rules**, all at **severity 1** — can never fail CI                                                                                                                                                                                                                                                                          | `eslint.config.mjs`            |
| A7     | No admin `not-found.tsx` → unknown ids give a crash screen, not a 404                                                                                                                                                                                                                                                                                   | —                              |
| U2     | Reservation/customer detail have **no URL** — cannot bookmark, share, or Back to close                                                                                                                                                                                                                                                                  | —                              |
| U3     | The vehicle P&L drawer is reachable **only via ⌘K**                                                                                                                                                                                                                                                                                                     | —                              |
| U4     | Server error messages are **English** in an Albanian-default UI                                                                                                                                                                                                                                                                                         | service layer                  |
| U5     | **43 of 44 vehicles show an identical generic Albanian description** — `ALBANIAN_DESCRIPTIONS` has **one** entry and the fallback discards the real text. Also the `<meta description>`                                                                                                                                                                 | `i18n/vehicle-content.ts:9-22` |
| U6     | **No notification infrastructure at all** — a customer books and hears nothing                                                                                                                                                                                                                                                                          | app-wide                       |

**Verified sound:** every image has alt · 17 `role="alert"` · drawer + palette fully correct
(trap **and** restore) · all form labels correct except A4 · reduced-motion **and**
reduced-transparency · tables scroll via the primitive's own container · the calendar contains
its own overflow with `overscroll-x-contain` · **touch targets meet WCAG 2.2 AA** — `default`
is `h-11 sm:h-9` and `icon` is `size-11 sm:size-8`, i.e. 44 px on touch (**the prior audit's
M13 measured against AAA and missed this**).

## 12. Testing gaps

**94 tests pass in 1.24 s. Zero of the twenty confirmed bugs would have been caught.**
Not a quality problem — an _aim_ problem: the 76 behavioural tests cover the pure-function core,
and this audit independently verified that core is **correct**. Every bug lives in an untested
layer.

- **7 of 21 files assert source _text_.** Keep three (`rls-security` — derives its matrix from
  `@@map()`, the pattern to follow; `public-vehicle-boundary`; `vehicle.service`). Retire the
  five asserting CSS substrings — they fail on reformatting and pass on real regressions.
- **`vitest.config.ts` includes `*.test.ts` only — never `.tsx`**, no DOM env. **A component
  test is silently ignored.** The integration config excludes `prisma/`.
- Zero tests for auth/RBAC, server actions, services (except one race), components, pages, E2E.
- The integration test writes to **whatever `DATABASE_URL` names, with no production guard** —
  unlike the carefully-gated seed.

**Write these four first:** (1) `consumeRateLimit` with a **rejecting** `$queryRaw` — one
`mockRejected` line in an existing file, guards B3/C2; (2) a migration-integrity test against
the CI Postgres (§13 H7); (3) a double-booking integration test asserting the **409 through
`normalizeError`**; (4) `parseVehicleFields` round-trip (B2, no DB needed).

## 13. Technical debt

**What is NOT debt** (measured over 19,026 lines): **0** TODO/FIXME/HACK · **0** commented-out
code · **0** `any`/`@ts-ignore` · **0** `eslint-disable` · **0** circular imports · **0** unused
production deps · **0** non-linear migrations.

**Dependencies.** Every `^` range resolves to its **floor** — nothing has moved since the
lockfile. Four exactly-pinned packages are behind (as of the 30 Jul record, now stale):
`next`/`eslint-config-next` 16.2.11→16.2.12, `react`/`react-dom` 19.2.4→19.2.8. Update as two
paired commits; **re-run `npm outdated` first**. `next-auth@5.0.0-beta.32` runs production auth
— a correct choice (v4 would be a downgrade) that **deserves a written decision**. Three Node
versions across three environments (`.nvmrc` 23.5.0, `engines` >=20, nothing pins production).

**H7 · Four DB objects are invisible to `schema.prisma`:** the `reservations_no_overlap`
EXCLUDE constraint, `btree_gist`, RLS on all 10 tables, two CHECKs on `rental_inspections`.
Any schema-regenerating command drops them — **and the test suite would still pass** (it greps
migration _files_) **and CI would still pass** (it applies migrations to a fresh DB). Add a CI
test asserting them via `pg_constraint`/`pg_class`; the infrastructure already runs.
**Zero down migrations**; `vercel-build` advances the schema even when the build fails.

**Ten unmarked workarounds** with per-item verdicts in
`docs/audit/PHASE-9-TECH-DEBT-CONSISTENCY.md` §3. **Four of them trace to B4's nested form.**

**Competing approaches:** 5 form-submission · 5 client-validation · 4 action result shapes
(`ActionResult` declared identically in two files) · 4 overlays · 4 preference-persistence
mechanisms · 4 money formats · 3 enum-label type strategies over 14 sites.

## 14. Recommended changes — implementation order

**Phase 0 — Critical (days).** B1 (3 lines) · B3 (breaks C2) · S1 · B13 + render
`kpis.maintenance` (closes C4) · **confirm the credential rotation in `HANDOFF.md` §6.1 —
outranks everything if incomplete** · verify `connection_limit`.

**Phase 1 — Reliability (1–2 wks).** **Error reporting first** — it is how you verify the rest ·
B4 (one fix, four outcomes) · B2 · B14 · B6/B7/B8/B9/B10 · B11/B12 · timeouts (§8).

**Phase 2 — Architecture (2–3 wks).** Split the drawer context from its bodies + back it with a
search param (U2) · reverse the 6 `components→app` edges · consolidate the Decimal boundary ·
state the `lib/` vs `utils/` rule in `AGENTS.md` · **replace English-string error matching with
error codes** (unblocks U4).

**Phase 3 — Performance (2–3 wks).** H5 shared vendor chunk (measure before/after) · **H6
caching decision — must include the X3 revalidation gaps** · `requireUser` in `cache()` (one
line) · `pg_trgm` + `lower(brand)` indexes · narrow the calendar reader · view switcher to a
search param · Cloudinary image loader · batch the image N+1s.

**Phase 4 — UX / A11y (2 wks).** Toast (U1) · four dark tokens (A1) · live regions + focus on
booking success (A2) · route `BookingModal` through `Dialog` (A3) · un-nest interactive content
(A8) · label the two selects (A4) · translate service errors (needs Phase 2) · **U5 vehicle
descriptions need a schema change** (`descriptionEn`/`descriptionSq`) · **U6 notification
infrastructure** — a business decision, but customers currently hear nothing.

**Phase 5 — Testing / DX (2 wks).** `docker-compose.yml` + `db:setup` — **unblocks everything
below** · H7 migration-integrity test · the four tests · `*.test.tsx` + DOM env · guard the
integration test · reconcile README with HANDOFF and move the incident rules into `AGENTS.md` ·
`jsx-a11y` to `error` · pin one Node version.

**Phase 6 — Cleanup.** Money/date/enum standardisation · dependency updates · 9 dead tokens ·
`CardAction`/`CardFooter` · the deprecated `priority` at `car/[slug]/page.tsx:128` · `EXIT_MS` ·
4 stale comments · retire the 5 CSS-substring tests.

## 15. Dependencies between changes

```
verify connection_limit ─► H6 caching ─► MUST include the revalidatePath gaps (X3)
error reporting ─► everything after it (you cannot verify what you cannot observe)
B4 (repairs form) ─► B4 fixed + A5 fixed + 3 workarounds deleted      [1 fix, 4 outcomes]
B14 (status owner) ─► B13 (return check) ─► C4 closed
                  └─► render kpis.maintenance ─► the state becomes visible
docker-compose ─► integration tests ─► H7 · HL-2 verification · browser checks
error codes ─► translating server errors (B16's string matching must go first)
H5 (vendor chunk) ─► measure ─► PERF-2 (split + lazy-load). Do not start with the harder one.
```

## 16. Risks

- **A well-intentioned cleanup pass is the biggest risk to this codebase** — stripping the
  rationale comments, splitting the cohesive files, abstracting the already-consistent
  patterns. §17 exists for that reason.
- **H6 (caching) has high regression risk** and a hard prerequisite (X3). Do not attempt it
  before error reporting exists.
- **Any Prisma schema-regenerating command silently destroys the system's core invariant**
  (H7), and nothing currently detects it.
- **The payments feature will need all nine latent issues fixed** before an adapter is
  registered. It is safely inert today — do not "finish" it casually.
- **`next-auth` beta** may not receive backported security fixes.

## 17. Things that MUST NOT be changed

1. **The GiST exclusion constraint and the advisory-check convention.** The entire
   double-booking guarantee.
2. **`reservation.service.ts` as one 614-line module** — one aggregate, one invariant.
3. **`vehicle-form.tsx` as one 642-line file** — 442 lines are markup for one cohesive form.
4. **`businessCalendarStart`** (`reservation-lifecycle.ts:61-84`) — DST-safe, documented,
   tested in both seasons. **Do not replace with `date-fns-tz`.**
5. **`src/proxy.ts`** — the current Next 16 convention (docs-verified). Not stale middleware.
6. **The IP-keyed login limiter** and the generic "invalid credentials" message.
7. **The dummy bcrypt compare** (`user.service.ts:29`) — a timing-attack control.
8. **Postgres-backed rate limiting** — do not add Redis. Add the missing `try`/`catch`.
9. **`Promise.all` instead of `$transaction` for grouped reads** — a real Prisma type
   limitation.
10. **The five `setTimeout(…, 0)` sites** — fix the unnecessary _effects_, keep the pattern.
11. **The rationale comments throughout.** The codebase's best documentation.
12. **The booking/reservation vocabulary split** — principled, checked both ways.
13. **`adminVehicleFilterSchema`'s per-field `.catch()`** — the correct design; the two pages
    using `.parse()` are the outliers.
14. **The public DTO allowlist and its test.**
15. **Accurate image `sizes` descriptors** — better than most production apps.

**Do not over-engineer:** no repository layer over Prisma · no state-management library · no
i18n framework (you would lose `keyof typeof en` key safety) · do not replace `date-fns` (four
copies is a _chunking_ problem) · no generic `EmptyState` rollout · no `useActionError` hook ·
no design-token generator · do not memoise components.

## 18. Decisions recorded

- Payments are **deliberately staged**, not half-finished (`docs/online-payments.md`, four
  independent gates).
- Public booking **never** mutates an existing customer — it runs unauthenticated.
- Seeding is **not** in the build; the seed wipes the database.
- `build` is hermetic; migrations live in `vercel-build`.
- Repairs are separate from servicing (a service is upkeep; a repair is an unplanned cost).
- Slugs are **never recomputed** on update — link stability over accuracy.
- `manualReservationSchema` restricts status to `PENDING|CONFIRMED`, so staff cannot bypass the
  inspection.

## 19. Unresolved questions

**Only you can answer these:**

1. Should `ACTIVE → CANCELLED` be possible? Today theft or a write-off has no representation.
2. Should staff be able to manually book a vehicle in `SERVICE`? The public path forbids it.
3. Is revenue correctly bucketed by `createdAt` rather than rental dates?
4. Is unlimited overlapping `PENDING` intended? Ten customers can request the same car.
5. Should EMPLOYEE see per-vehicle net profit (S6)?
6. Real fleet size and monthly reservation volume — decides whether the §10 walls are near.

**Environment / operational:** 7. **Has the `HANDOFF.md` §6.1 credential rotation been completed?** Outranks all technical work. 8. **Does Vercel replace or append a client-supplied `x-forwarded-for`?** Decides whether the
login limiter is bypassable by rotating a header. 9. **`npm audit` was never authorised.** `npm ci` reported vulnerabilities exist. _(Note: `npm
   ci` already fetched every package from the registry, so the marginal disclosure is near nil.)_ 10. Production values: real `connection_limit` · is `PAYMENTS_ENABLED` false · are Preview and
Production env vars scoped separately (else a PR runs `migrate deploy` against production)
· which Node version builds · is RLS actually enabled on the live database.

**Answerable locally — Docker is available:** a throwaway `postgres:16` would let the next
context run the integration test, verify the exclusion-constraint 409 mapping, prove the H7
migration objects exist, and browser-verify the UX/a11y/performance items that this audit could
only assess statically.

---

_Audit: 11 phases, read-only, 27 August 2026. Nine would-be findings were removed as unsound —
each dissolved on reading the installed documentation or executing the code rather than
reasoning about it. Do the same._
