# Alfa Rent — Admin Panel Audit

**Date:** 26 October 2026 · **Branch:** `chore/security-observability` @ `c84fd24` (plus an uncommitted `globals.css` edit)
**Scope:** the staff admin panel (`/admin/*`), the services and API it depends on, and the database guarantees underneath.
**Method:** the app was started locally and driven in a browser as an ADMIN and as an EMPLOYEE. Key actions were traced from page → server action → service → database, and the results were checked in Postgres. The unit and integration suites, typecheck, lint and `npm audit` were all run. No application code was changed.

Every finding below is labelled:

- **Confirmed (runtime):** reproduced in the running app or the database.
- **Confirmed (code):** read in the source, with a file and line reference, but not exercised.
- **Risk:** a plausible problem that has not been demonstrated.

---

## 1. Executive summary

The admin panel is **well-engineered underneath, but incomplete as a daily tool for running a rental desk.**

**Strongest areas**

- **The database itself prevents double-booking.** A GiST exclusion constraint does it, and I confirmed it end to end. An overlapping CONFIRMED booking was refused from the calendar dialog. Confirming an overlapping PENDING request was refused too. The concurrency and double-booking integration tests pass.
- **Authorization is enforced on the server.** An EMPLOYEE who requests an ADMIN-only page gets a `ForbiddenError` from the server. Signed-out requests to `/admin` are redirected to the login page. Every request re-checks the user against the database.
- **Lifecycle changes are atomic.** Pickup and return inspections change the reservation and vehicle status in one transaction, with compare-and-swap guards. A failed booking rolls back the walk-in customer it created (confirmed: no orphan row).
- **The code is clean and documented.** Typecheck and lint are clean, there is no raw unsafe SQL and no `dangerouslySetInnerHTML`, and comments explain the reasoning behind decisions.

**Biggest risks**

1. **Overdue rentals are invisible to availability.** A car still out on a rental that was due back in July is reported as _available_ by the public API and the calendar. It has already been given a second confirmed booking. Nothing flags this until the handover itself fails.
2. **A phone booking records only a name.** There is no phone number, no email, and no way to choose an existing customer. Every walk-in becomes a new customer with a fake email and phone `-`.
3. **Customers cannot be created, edited, searched or merged** anywhere in the admin.
4. **A reservation cannot be changed.** Staff can only extend the return date. To change the pickup date, the car or the customer, they must cancel and re-create.
5. **Cancelling takes one click, cannot be undone, and records no reason and no staff member.** There is no audit trail of who did what.
6. **Dependency advisories are still open.** Next.js 16.4.0 is still inside the range of a critical/high advisory, and zod is below its fixed version.

**Readiness:** it is suitable for a supervised pilot. It is **not yet ready** to be the system of record for a real phone desk. The reservation engine is trustworthy for _scheduled_ dates. The surrounding workflows (customer data, changes, no-shows, overdue returns, payments, accountability) are missing or incomplete.

---

## 2. Startup and runtime status

| Item                       | Result                                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack (verified)           | Next.js 16.4.0 (App Router, Turbopack), React 19.2, Prisma 6.19 + PostgreSQL, Auth.js v5 beta (credentials, JWT), Cloudinary, Sentry                                                                                                                                                         |
| Database                   | Local Homebrew **PostgreSQL 17** on `localhost:5432`. Docker is not installed, so `npm run db:setup` cannot run on this machine. The existing local database was used. `prisma migrate status` reports 12 of 12 migrations applied.                                                          |
| Data                       | Seed/demo data (49 vehicles, 135 reservations, 36 customers, `@example.com` emails). The latest reservation was created on 16 Jul 2026, so many bookings are now "overdue". This turned out to be useful for testing.                                                                        |
| Dev server                 | `next dev -p 3002`, because port 3000 is used by two other local projects. `AUTH_URL` was overridden to match. A second entry was added to `.claude/launch.json`; the original entry is unchanged.                                                                                           |
| Login                      | The seeded `admin@alfarent.com` password is **not** the one in `scripts/db-setup.sh`. I did not reseed (that wipes data). Instead I added two local test accounts, `audit-admin@alfarent.test` (ADMIN) and `audit-employee@alfarent.test` (EMPLOYEE).                                        |
| Connectivity               | `/` 200, `/api/vehicles` 200, `/api/availability` 200/400/404 as expected, `/admin/*` → 307 to `/login` when signed out, 200 when signed in                                                                                                                                                  |
| Routes exercised           | `/admin/dashboard`, `/reservations` (+`?status=PENDING`, reservation drawer), `/calendar` (add-reservation dialog), `/vehicles` (+ hidden `?from&to` filter), `/vehicles/new`, `/customers`, `/analytics`; EMPLOYEE run of `/vehicles/new`, `/vehicles/:id/edit`, `/analytics`, `/dashboard` |
| Responsive                 | Checked at 375 px (no horizontal overflow) and at desktop width                                                                                                                                                                                                                              |
| `npm test`                 | **177 pass, 4 fail.** All 4 failures are in `theme-contrast.test.ts`, caused by the uncommitted `globals.css` edit (see F-22).                                                                                                                                                               |
| `npm run test:integration` | **48 / 48 pass** (double-booking, concurrency, extension, delete, RLS/constraint integrity)                                                                                                                                                                                                  |
| `typecheck` / `lint`       | Clean                                                                                                                                                                                                                                                                                        |
| `npm audit --omit=dev`     | 5 vulnerabilities (1 critical, 4 high): `next` 16.0.0–16.4.0, `zod` < 4.6.6, `prisma`/`deepmerge-ts`                                                                                                                                                                                         |
| Not verified               | Cloudinary uploads (I did not upload to the real account), production headers on Vercel, the real behaviour of `X-Forwarded-For` on Vercel, email/SMS (none exists)                                                                                                                          |

**Test data cleanup:** the 2 test reservations and 2 walk-in customers I created were deleted afterwards. Row counts are back to 135 and 36. The two audit staff accounts remain; see §9.

---

## 3. Findings by module

Severity: **Critical / High / Medium / Low**. Effort: **S** (≤ ½ day), **M** (1–3 days), **L** (> 3 days).

### Reservations and availability

#### F-01 · High · Data integrity · Overdue ACTIVE rentals do not block availability — _Confirmed (runtime)_

- **Where:** `reservation.service.ts` `checkAvailability`, `getCalendarReservations`, `extendReservation` clash query; the `reservations_no_overlap` constraint; admin fleet `from/to` filter in `vehicle.service.ts` `buildVehicleWhere`.
- **What:** every availability check uses the _scheduled_ `returnDate`. An ACTIVE rental whose return date has passed stops occupying the car on paper, even though the car is physically still out.
- **Evidence:**
  - BMW 1 Series `01-782-RJ` has been ACTIVE since 11 Jul, due back 16 Jul. It **also** has a CONFIRMED booking for 2–6 Aug. The Toyota RAV4 `03-875-DK` is in the same state.
  - `GET /api/availability?vehicleId=<BMW>&pickupDate=2026-10-28…&returnDate=2026-10-30…` → `{"available":true,"totalPrice":104}`.
  - The calendar draws the BMW as free from 17 Jul onwards.
- **Business impact:** the same car is promised to a second customer, publicly and by staff. The conflict only appears at the counter, when the pickup inspection refuses because the vehicle is not AVAILABLE (`inspection.service.ts:113`).
- **Fix:**
  - (a) Treat an ACTIVE reservation as occupying the car until it is completed: its effective end is `max(returnDate, now)` in availability, calendar and conflict queries.
  - (b) Warn when confirming or creating a booking on a car with an overdue ACTIVE rental.
  - (c) List overdue returns prominently (see F-12).
  - The exclusion constraint cannot express "now", so this is an application-level check plus a process: extend the overdue rental, which the constraint then guards.
- **Effort:** M.

#### F-02 · High · Functionality · A phone or walk-in booking captures only a name — _Confirmed (runtime + code)_

- **Where:** `calendar-timeline.tsx` add-reservation dialog; `manualReservationSchema`; `createManualReservation` (`reservation.service.ts:208-255`).
- **What:**
  - The dialog asks for vehicle, name, dates, status and notes. There is no phone number, no email, and no way to look up an existing customer.
  - Every submission creates a **new** customer with email `walkin.<random>@alfarent.local` and phone `-`.
  - No price is shown before saving.
- **Evidence:** a test booking produced `AUDIT Test One · walkin.mvpe9lygy0l1@alfarent.local · phone "-"` in the database.
- **Business impact:**
  - Staff cannot call the customer back to confirm, reschedule or chase a late return.
  - A returning customer's history is split across duplicate records.
  - "Top customers" and "returning customers" analytics are wrong.
  - Once real phone bookings start, the walk-in placeholders pile up.
- **Fix:** add a customer combobox that searches name, phone and email, with inline creation that requires a phone number. Send `customerId` or a new-customer payload. Show the computed total, using the server's `calculateTotalPrice`, before submit.
- **Effort:** M.

#### F-03 · High · Functionality · Reservations cannot be edited beyond extending the return — _Confirmed (code + runtime)_

- **Where:** `reservations/actions.ts` (only status, extend and inspection actions exist); the reservation drawer offers only "Extend rental", "Start rental" and "Cancel".
- **What:** there is no way to move a pickup date, shorten a rental, swap the car or fix the customer.
- **Evidence:** the error staff get for a missed pickup window tells them to _"Update the dates or cancel the reservation"_ (`inspection.service.ts:101`), but no such update exists.
- **Business impact:** the most common phone request is "can I pick it up a day later?". Today that means cancel and re-create. That loses the original booking, double-counts the request, and has no link between the two records.
- **Fix:** add `rescheduleReservation(id, {pickupDate, returnDate, vehicleId})`, modelled on `extendReservation`:
  - in a transaction, with a compare-and-swap on `updatedAt`;
  - an advisory clash check, with the constraint as the authority;
  - an explicit, shown price recalculation.
- **Effort:** M.

#### F-04 · High · UX / data loss · Cancel is one click, irreversible, with no reason — _Confirmed (runtime)_

- **Where:** `status-actions.tsx`, `pending-request-card.tsx`. Only the vehicle form and vehicle delete use a confirmation dialog.
- **What:**
  - Clicking **Cancel** on a pending card or reservation row immediately sets `CANCELLED`, a terminal status (`ALLOWED_TRANSITIONS.CANCELLED = []`).
  - No confirmation, no reason, no record of who did it.
  - The button sits next to **Confirm** / **Start rental**.
- **Business impact:** one mis-click irreversibly kills a customer's booking. Nobody can later say why or by whom.
- **Fix:** add a confirmation dialog with an optional reason, and record the reason and the actor (needs F-07). Optionally allow a short "undo" window, or let an ADMIN reinstate a cancelled booking if the dates are still free.
- **Effort:** S (dialog); M (with reason and actor).

#### F-05 · Medium · Functionality · Missed pickups linger as CONFIRMED forever — _Confirmed (runtime)_

- **Where:** reservation lifecycle; `REVENUE_STATUSES` in `analytics.service.ts:14`.
- **What:**
  - 6 CONFIRMED reservations have return dates in July. They show "Pickup overdue / Rental window has ended", and the only action offered is Cancel.
  - There is no NO_SHOW (or EXPIRED) outcome.
  - They still count toward revenue and toward "booked" metrics.
- **Business impact:** revenue and utilisation are overstated. No-shows cannot be told apart from customer cancellations.
- **Fix:** add a `NO_SHOW` status (hand-written migration; the constraint's `WHERE status IN ('CONFIRMED','ACTIVE')` is unaffected). Add a "Mark no-show" action and exclude no-shows from revenue.
- **Effort:** M.

#### F-06 · Medium · Functionality · No pickup or return times; every booking is at 10:00 — _Confirmed (code)_

- **Where:** `calendar-timeline.tsx:464-465`, `booking-form.tsx:181-182`, `availability-widget.tsx:79`. All of them send `${date}T10:00:00Z`.
- **What:**
  - Staff cannot record "pickup 08:00, return 19:00".
  - Back-to-back bookings on the same day are allowed with zero turnaround time for cleaning or inspection.
  - Billing is always whole 24-hour blocks between two 10:00 instants.
- **Business impact:** early and late handovers are not captured. Same-day turnarounds can be over-promised.
- **Fix:** decide the policy first (times plus an optional buffer, or daily rental only). If times are adopted, add time inputs and keep UTC-as-calendar storage (`rental-dates.ts` explains why). Optionally add a configurable turnaround buffer to the conflict check.
- **Effort:** L.

#### F-07 · Medium · Data integrity / accountability · No audit trail — _Confirmed (code)_

- **Where:** the `Reservation` model has no `createdById`, `updatedById` or status history. Only inspections record a `createdById`.
- **Business impact:** for a booking that was confirmed, cancelled or extended, nobody can say who did it or when the status changed. Disputes and staff errors cannot be investigated.
- **Fix:**
  - Add a `reservation_events` table (reservationId, actorId, type, from/to status, payload, at).
  - Write it inside the same transactions as each mutation.
  - Add `createdById` to `reservations` (nullable, because public bookings have no actor).
  - Hand-written migration; enable RLS on the new table like every other table.
- **Effort:** M.

#### F-08 · Medium · UX · Conflicts with pending requests are only discovered on Confirm — _Confirmed (runtime)_

- **Where:** pending request card; calendar bar rendering.
- **What:**
  - A PENDING request overlapping a CONFIRMED booking shows no warning on its card. Clicking Confirm then returns "Vehicle is already booked for the selected dates", without naming the clashing booking.
  - On the calendar, the pending bar is drawn **on top of** the confirmed bar in the same row and hides it.
- **Fix:** compute `conflictsWith` for each pending request (one query per page) and show it on the card. Stack overlapping bars or draw them with an outline. Name the clashing booking in the error.
- **Effort:** S–M.

#### F-09 · Medium · Correctness · Calendar bars are always one day too long — _Confirmed (runtime + code)_

- **Where:** `calendar/page.tsx`, in the `span` calculation: `to === r.returnDate`.
- **What:** `date-fns` `min()` returns a new `Date`, so the identity check is always `false` (verified: `min([r,end])===r → false`). The code meant to add +1 only for bars cut off at the edge of the range, but it adds it to every bar. A 28–29 Oct booking covers two cells.
- **Business impact:** back-to-back bookings look like they overlap. A car returned on day X looks busy all of day X.
- **Fix:** compare `.getTime()` values, or compute `clipped = r.returnDate > rangeEnd`.
- **Effort:** S.

### Calendar, availability and the "which cars are free?" question

#### F-10 · Medium · UX · No availability search in the UI — _Confirmed (runtime)_

- **Where:** the fleet page, the calendar, and the add-reservation dialog.
- **What:**
  - `buildVehicleWhere` supports `from`/`to` (verified: `/admin/vehicles?from=2026-10-28&to=2026-10-29` correctly hides the booked Dacia). The fleet page has no date inputs and no text search, so staff cannot use it.
  - The calendar has no filters (category, transmission, free-only).
  - The dialog's vehicle dropdown lists all 43 non-retired cars, including the 26 with expired registration, with no availability, status or price shown.
  - The dialog's date picker greys out only past days, not the chosen car's booked days.
- **Business impact:** "What do we have free from Friday to Monday?" means scanning a calendar of 43 rows by eye, and overdue cars look free (F-01).
- **Fix:**
  - Add a date-range and category bar to Fleet, or better to Calendar, using the existing filter.
  - In the dialog, pick dates first, then show only bookable cars with their quoted total, and disable booked days using `getVehicleBookingCalendar`, which already exists for the public site.
- **Effort:** M.

#### F-11 · Medium · Functionality · SERVICE is a single flag with no schedule, and booking rules are inconsistent — _Confirmed (code + runtime)_

- **Where:** `vehicle.service.ts` `assertStatusChangeAllowed`; `createManualReservation` blocks only `INACTIVE`; the fleet list.
- **What:**
  - A car can be set to SERVICE without any warning about its upcoming confirmed bookings. Those bookings then fail at pickup.
  - Staff _can_ book a car that is in SERVICE.
  - There is no "in service from X to Y" window, so planned maintenance cannot be put on the calendar.
  - The fleet strip shows "Free 40" and badges cars "Available" even though 26 of them have expired registration and cannot legally be rented.
- **Fix:**
  - Warn, listing the affected bookings, when moving a car to SERVICE or INACTIVE.
  - Show "Not rentable: registration expired" in place of "Available".
  - Later (P3), add maintenance blocks as calendar entries.
- **Effort:** S (warnings and labels); L (maintenance windows).

### Dashboard

#### F-12 · Medium · UX · "Needs attention" is a number with no list or link — _Confirmed (runtime)_

- **Where:** `dashboard/page.tsx` `StatStrip` (no links); `getDashboardData` `overdue` count.
- **What:**
  - The dashboard shows **9 needs attention**, but it does not say which 9, and the number is not clickable.
  - Three cars missing since July do not appear anywhere on the dashboard as named items.
  - "Upcoming pickups/returns" cover the next 7 days and leave out anything already overdue.
- **Fix:** make the dashboard an operations board, in this order:
  1. Overdue returns.
  2. Missed pickups.
  3. Today's pickups.
  4. Today's returns.
  5. Pending requests.
  6. Conflicts (F-01, F-08).

  Each row should open the drawer, and each KPI should link to a filtered list.

- **Effort:** S–M.

#### F-13 · Medium · Data accuracy · "Revenue this week/month" is really bookings created — _Confirmed (code)_

- **Where:** `analytics.service.ts:119-132`.
- **What:** the figure sums `totalPrice` for reservations with `createdAt` in the period, and includes CONFIRMED bookings (including no-shows, F-05). A booking made today for next summer counts as this week's revenue.
- **Fix:** rename it "Booked this week", or compute earned revenue from COMPLETED/ACTIVE by rental dates. Show both if both are wanted.
- **Effort:** S.

### Customers

#### F-14 · High · Functionality · No customer create, edit, search or merge — _Confirmed (code)_

- **Where:** `customer.service.ts` has only read functions and `findOrCreateCustomerByEmail`. A search finds no `customer.update`, `customer.create` (outside booking) or delete/merge anywhere in `src/`. The customers page is a paginated list with no search box.
- **What:** the service's own comment says a changed phone number _"is corrected by staff in the admin"_, but no such screen exists.
- **Evidence:** duplicates already exist (`Ilir Rexhepi` twice), and every walk-in adds another (F-02).
- **Business impact:** wrong phone numbers cannot be fixed. Duplicates cannot be merged. A customer cannot be found by phone while they are on the line (the command palette searches name and email only).
- **Fix:**
  - Customer edit (ADMIN and EMPLOYEE, validated with zod).
  - Search by name, email and phone on the list page.
  - A "possible duplicates" view (same phone or same name) with an ADMIN-only merge that re-points reservations in one transaction.
  - Add phone to the command-palette search.
- **Effort:** M.

#### F-15 · Low · Privacy · Customer PII is visible to every staff member, with no access log — _Risk_

All staff roles can see every customer's email, phone and history. That is normal for a small rental desk. It should still be a deliberate decision, and with F-07 in place reads can be audited later if needed.

### Fleet

Vehicle create/edit/delete and repairs are in good shape:

- Delete soft-retires any car that has history.
- Status changes guard against making a rented car AVAILABLE.
- Cleared optional fields write `null`.
- The form uses native required validation (verified: an empty submit focuses Brand).

The fleet issues are F-10 and F-11 above, plus:

#### F-16 · Low · Architecture · `assertStatusChangeAllowed` counts then updates outside a transaction — _Confirmed (code)_

A reservation that becomes ACTIVE between the count and the `vehicle.update` could leave the status inconsistent. The window is tiny, and the inspection's guarded `updateMany` protects the important direction. Fold it into a transaction when that code is next touched.

- **Effort:** S.

### Pricing and rental operations

What exists and works:

- Daily price × started 24-hour blocks (`pricing.ts`).
- The price is stored on the reservation when booked.
- An extension charges only the added days, at the current rate.
- Registration expiry is enforced when booking and at handover (verified: a booking past the expiry was refused with a clear date).
- Pickup and return inspections record mileage, fuel, damage, signer and photos, and return mileage cannot be below pickup mileage.

What does not exist (see §4): deposits, discounts, extras (child seat, extra driver), recording payment received at the counter, and one-way or location fees. Online payments are fully scaffolded but disabled (`PAYMENTS_ENABLED=false`, no provider adapter). The drawer just says "Due at pickup".

### Security and access control

#### F-17 · High · Security · Dependency advisories are still open — _Confirmed (`npm audit`)_

- **What:**
  - `next@16.4.0` is inside the advisory range 16.0.0–16.4.0 (GHSA-p3m5-59mp-jv5r server-action DoS; GHSA-2464… and GHSA-673q… RCEs). Commit `c1e2d8d` says it upgraded "for critical advisories", but 16.4.0 is still flagged. 16.4.3 is published.
  - `zod@4.4.3` < 4.6.6 (GHSA-mrhx-c7xc-m3w5, memory exhaustion). zod parses every public request body.
- **Exposure:** the two RCEs need SVG images through the optimizer or `use cache`. Neither is used here (a custom Cloudinary loader, and no `use cache` in `src/`), so they are probably not exploitable. The server-action DoS and the zod issue do apply.
- **Fix:** `next@16.4.3`, `eslint-config-next@16.4.3`, and `zod@^4.6.6`. Re-run tests and the build. The `prisma` advisory is a dev-tool chain; track it, but it is not urgent.
- **Effort:** S.

#### F-18 · Medium · Security / operations · No staff management or session revocation — _Confirmed (code)_

- **What:**
  - There is no UI to add, deactivate or change the role of staff, or to reset or change a password.
  - `sessionVersion` exists, and is checked on every request (good), but **nothing ever increments it**.
  - Sign-out clears the browser cookie but does not invalidate the JWT. Auth.js's default lifetime is 30 days.
- **Business impact:** offboarding an employee or responding to a lost laptop requires direct SQL on production.
- **Fix:** an ADMIN-only Staff page with: list, invite/create, deactivate, set role, reset password, and a "sign out everywhere" button (increments `sessionVersion`). Consider bumping `sessionVersion` on sign-out, and a shorter `session.maxAge` (for example 12 h).
- **Effort:** M.

#### F-19 · Low · Security · Rate limiters trust the left-most `X-Forwarded-For` — _Confirmed (runtime, locally)_

- **Where:** `rate-limit.ts:85-89`.
- **Evidence:** 10 failed logins from `X-Forwarded-For: 203.0.113.7` → the correct password is then refused from that address. Changing the header to `.8` → login succeeds.
- **Exposure:**
  - Vercel overwrites this header with the real client IP, so production is probably safe. This should be checked on the deployed app.
  - Behind any other proxy, the login and booking limits can be bypassed.
  - Separately: all staff in one office share one public IP. Ten failed attempts by anyone there locks the whole desk out for 15 minutes, and the message they see is "wrong password".
- **Fix:** keep the IP key (it is deliberate; see the engineering audit's do-not-change list). Read the client IP from a platform-trusted source (`request.ip` / Vercel's `x-real-ip`). Consider a softer lockout message for staff.
- **Effort:** S.

#### F-20 · Low · Security · The admin pages can be framed by the portfolio site; CSP is minimal — _Confirmed (runtime headers)_

- **What:**
  - `frame-ancestors 'self' https://endritsportfolio.netlify.app` applies to **every** route, including `/admin`.
  - `X-Frame-Options: ALLOW-FROM` is obsolete and ignored by modern browsers.
  - The CSP has no `default-src` or `script-src`, so it gives no extra protection against XSS. No XSS sink was found, though: no `dangerouslySetInnerHTML`, and React escapes output.
- **Fix:** send the embed-allowing headers only for public routes. Use `frame-ancestors 'none'` for `/admin` and `/login`. Drop `ALLOW-FROM`.
- **Effort:** S.

#### F-21 · Low · Security / UX · Employees see revenue, analytics and vehicle costs — _Confirmed (runtime)_

The dashboard and analytics pages use `requireUser`, so an EMPLOYEE sees all revenue figures. The vehicle drawer also shows repair, service and registration costs to employees. This may be intended. If not, gate those panels with `requireRole("ADMIN")`.

- **Effort:** S.

Verified sound: SQL is parameterised (Prisma plus one tagged `$queryRaw`), every server action calls a guard, revocation is checked on every request, the post-login redirect is validated (`safeCallbackUrl`), the public data allowlist is in place, and RLS is enabled on every table.

### UX, accessibility, i18n

#### F-22 · Low · Maintainability · The uncommitted `globals.css` edit reverts documented contrast fixes — _Confirmed (runtime)_

It sets `--primary-foreground: #fff`, which measures 3.61:1 against the requirement of 4.5:1, and changes `--input` back to a 16 % white that measures about 1.6:1 against the required 3:1. It also removes `--success-hover`. This is the cause of the 4 failing unit tests. **Do not commit it as it is.**

#### F-23 · Low · Accessibility · The add-reservation dialog's inputs have no labels — _Confirmed (runtime)_

The "Customer name" and "Notes" `<label>`s are not associated with their inputs, so a screen reader announces only the placeholder. The calendar renders about **5,300 buttons** (measured) for one view: heavy for keyboard users and for low-end devices.

#### F-24 · Low · UX / i18n · Registration banner — _Confirmed (runtime)_

The banner mixes English "and" into Albanian ("26 vetura me regjistrim të skaduar **and** 6 skadojnë…"). It takes up about a third of a phone screen on every admin page.

#### F-25 · Low · UX · The forbidden page is a generic error — _Confirmed (runtime)_

An EMPLOYEE who opens an ADMIN-only page gets "Something went wrong" with HTTP 200. They should see a page saying they don't have access.

#### F-26 · Medium · UX · The reservations list has no search, date or vehicle filter, and no sort — _Confirmed (runtime)_

The list has only status tabs. `getReservations` already accepts `vehicleId`, but nothing in the UI uses it. Finding "the Golf booking next week for Krasniqi" depends on the command palette, which shows 4 hits per type.

- **Effort:** M.

#### F-27 · Low · Architecture · Seed-specific string in the UI — _Confirmed (code)_

`customer-detail-body.tsx:49` special-cases the seed note `"Repeat customer, prefers automatic."` for translation. Remove it.

### Can staff answer the six operational questions?

| Question                                                 | Today                   | Why                                                                                                                                                        |
| -------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Which cars are free for a date range?                 | **No (slow)**           | No date-range search in the UI (F-10). Staff scan the calendar by eye, and overdue cars look free (F-01).                                                  |
| 2. Which cars are rented right now?                      | **Yes**                 | The "Active" tab and the "Rented now" KPI                                                                                                                  |
| 3. Picked up or returned today?                          | **Mostly**              | The Reservations header ("0 pickups and 0 returns today") and the 7-day lists. There is no single "today" board.                                           |
| 4. Any conflicting reservations?                         | **Partly**              | Confirmed overlaps are impossible (DB). Pending conflicts appear only on Confirm (F-08). Overdue-vs-next-booking conflicts are not detected at all (F-01). |
| 5. Which reservations need attention?                    | **Partly**              | The count is shown (9), and rows have badges, but there is no filtered list or link (F-12).                                                                |
| 6. A phone booking in seconds, without missing anything? | **Fast but incomplete** | No phone number, no customer lookup, no price preview, no times (F-02, F-06, F-10).                                                                        |

---

## 4. Missing functionality

**Essential for real operations**

1. Customer management: search by phone, edit, merge duplicates (F-14).
2. Phone booking linked to a real customer, with a required phone number and a price preview (F-02).
3. Changing a reservation: dates, car, customer (F-03).
4. No-show handling (F-05) and visible overdue returns that block availability (F-01).
5. Audit trail of staff actions (F-07).
6. Staff management and session revocation (F-18).
7. **Recording payment and deposit at the counter.** Even with online payment disabled, staff need to mark "paid €X cash/card" and "deposit held/released". The existing `Payment` model (`provider`, `amount`, `status`, `paidAt`) could hold manual payments with `provider = "manual"`.
8. A decision on pickup/return times and turnaround buffer (F-06).

**Optional enhancements**

- Maintenance windows on the calendar.
- Pricing rules: seasonal or weekly rates, discounts, extras, deposits per category.
- Customer notifications (email/SMS confirmation and reminders). None exist today; a customer who books hears nothing.
- Activating online payments, once a bank adapter passes sandbox testing (`docs/online-payments.md`).
- Rental agreement PDF and printable handover sheet.
- Reports export (CSV), utilisation per car, revenue by category.
- Calendar virtualisation for a larger fleet.

---

## 5. Prioritised roadmap

Each item lists: why · depends on · how to verify it is done.

### P0 — Critical (do first)

| #    | Item                                                              | Why                                                              | Depends on | Verify                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0-1 | Upgrade `next` → 16.4.3 and `zod` → ≥ 4.6.6 (F-17) — **S**        | An open server-action DoS, and memory exhaustion on public input | —          | `npm audit --omit=dev` shows no next/zod entries; unit and integration tests, typecheck and build pass; smoke-test login, booking, an admin action                                                                                                                    |
| P0-2 | Overdue ACTIVE rentals occupy the car (F-01) — **M**              | Prevents promising a car that is still out                       | —          | New integration test: an ACTIVE rental with `returnDate < now` makes `checkAvailability` false for today+, hides the car from the `from/to` fleet filter, and draws the calendar bar up to today. The BMW case returns `available:false` through `/api/availability`. |
| P0-3 | Confirm before cancelling (F-04, dialog only) — **S**             | One click currently destroys a booking for good                  | —          | In the browser, Cancel opens a dialog; Escape leaves the status unchanged (checked in the DB); confirming cancels                                                                                                                                                     |
| P0-4 | Don't commit the `globals.css` contrast regression (F-22) — **S** | It reintroduces documented WCAG failures                         | —          | `npm test` is fully green                                                                                                                                                                                                                                             |

### P1 — Essential

| #    | Item                                                                                                   | Why                                      | Depends on                                   | Verify                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-1 | Customer picker + required phone + price preview in the phone booking (F-02) — **M**                   | Staff must be able to reach the customer | P1-2 (shared customer search)                | Booking for an existing customer reuses their row (no new `walkin.*`); a new customer must have a phone; the shown total equals the stored `totalPrice`                  |
| P1-2 | Customer search (name/phone/email), edit, merge (F-14) — **M**                                         | Fix wrong data and duplicates            | —                                            | Edit persists after reload; merge moves all reservations in one transaction (integration test); the palette finds by phone                                               |
| P1-3 | Reschedule a reservation: dates and car (F-03) — **M**                                                 | The most common phone request            | P1-5 for attribution (optional)              | Integration tests: an overlapping reschedule is refused by the constraint; adjacent is allowed; concurrent edits get a CAS conflict; the price is recalculated and shown |
| P1-4 | No-show status and action (F-05) — **M**, _schema_                                                     | Truthful revenue and lifecycle           | Hand-written migration adding the enum value | The 6 stale CONFIRMED bookings can be marked NO_SHOW; revenue excludes them; `migration-integrity` test still green                                                      |
| P1-5 | Audit trail: `reservation_events` + `createdById` (F-07), cancellation reason (F-04) — **M**, _schema_ | Accountability                           | Hand-written migration with RLS              | Every mutation writes exactly one event in the same transaction (integration test that rolls back on failure); the drawer shows the history                              |
| P1-6 | Staff management + "sign out everywhere" (F-18) — **M**                                                | Offboarding without SQL                  | —                                            | A deactivated user's next request → 401; a `sessionVersion` bump logs out the other browser                                                                              |
| P1-7 | Manual payment/deposit recording (§4.7) — **M**                                                        | Money handling                           | Decide whether to reuse `Payment`            | Record → appears in the drawer and persists; cannot exceed the outstanding amount; written as a `Decimal`                                                                |
| P1-8 | Times/buffer policy decision (F-06) — decision now, **L** to build                                     | Correct handover and turnaround          | Business input                               | A test matrix for adjacent, overlapping and buffer cases                                                                                                                 |

### P2 — Usability

- **Availability search** (dates + category → free cars with quote) on the Calendar or Fleet page, and dates-first filtering in the booking dialog (F-10) — M.
- **Calendar:** fix the span bug (F-09, S); draw overlapping pending/confirmed bars so both are visible; mark the vehicle status and expired registration in the row header (F-08, F-11).
- **Dashboard as a "Today" board** with linked lists: overdue returns, missed pickups, today's pickups/returns, pending, conflicts (F-12).
- **Pending cards show conflicts** before Confirm (F-08).
- **Reservations list:** search, date range, vehicle filter, sort (F-26).
- **Honest labels:** "Booked" vs "Revenue" (F-13); "Not rentable: registration expired" (F-11); warn before setting SERVICE/INACTIVE when bookings exist (F-11).
- **Accessibility and i18n:** label the dialog inputs (F-23); translate the banner and make it compact on mobile (F-24); a proper no-access page (F-25).
- **Policy:** whether employees should see financials (F-21); frame-ancestors only on public routes (F-20); limiter IP source (F-19).

### P3 — Future enhancements

Maintenance windows, pricing rules (seasonal, weekly, discounts, extras), email/SMS notifications, online payments activation, rental agreement PDF, CSV exports and per-car profitability, calendar virtualisation (needed once the fleet grows beyond about 100 cars).

---

## 6. Recommended admin structure

The shell, sidebar, drawers, command palette and status colours are good. **Keep them.** The proposal reorganises around the day's work:

| Section                        | Contents                                                                                                                                                     | Change                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **Today** (replaces Dashboard) | Overdue returns · Missed pickups · Pickups today · Returns today · Pending requests · Conflicts · compact KPIs                                               | Reorganised: the action lists come first, and revenue charts move to Reports |
| **Reservations**               | Search + filters, status tabs, a "New reservation" button (the same dialog as the calendar), the drawer with edit/reschedule/cancel/no-show/payments/history | Expanded                                                                     |
| **Calendar**                   | Timeline + availability search bar (dates, category, free-only), maintenance blocks later                                                                    | Expanded                                                                     |
| **Fleet**                      | Vehicles (with text search), registration and service due list, repairs                                                                                      | Keep; add search and a due-list tab                                          |
| **Customers**                  | Search, edit, duplicates/merge, history                                                                                                                      | Expanded                                                                     |
| **Reports** _(ADMIN)_          | Today's Analytics plus the revenue trend from the dashboard, exports later                                                                                   | Renamed and moved                                                            |
| **Settings** _(ADMIN)_         | Staff, roles, sessions; later pricing rules and business hours                                                                                               | **New**                                                                      |

A "New reservation" button on Reservations and on Today matters: today a phone booking can only be started from the Calendar.

---

## 7. Testing plan

**Automated: integration tests** (Postgres; follow the existing pattern of scoped ids and scoped cleanup)

- Availability: an overdue ACTIVE rental blocks today and onwards; COMPLETED/CANCELLED never block; PENDING never blocks; adjacent `[a,b)`/`[b,c)` is allowed; overlap is refused for create, confirm, extend and reschedule.
- Concurrency: two parallel confirms or reschedules for overlapping ranges → exactly one succeeds (extend the existing `reservation-concurrency` test).
- Manual booking: an existing customer is reused; a failure rolls back a new customer; a SERVICE/INACTIVE car is refused (once the policy is decided).
- Customer merge moves every reservation atomically; customer edit clears optional fields with `null`.
- Audit events: exactly one per mutation; none when the transaction rolls back.
- No-show excluded from revenue; status transition table exhaustively tested.
- RBAC: every `"use server"` export rejects an anonymous caller, and the ADMIN-only ones reject an EMPLOYEE (calling the functions directly).

**Automated: page level** (AGENTS.md: _verify through the page_)

- Route-handler tests for `/api/availability` and `/api/bookings` (validation errors, 404, 409 conflict, 429).
- Browser end-to-end for the critical flows: phone booking → confirm → pickup inspection → return inspection, and cancel with confirmation. No E2E runner is installed. Adding Playwright as a dev dependency is justified for these 4–5 flows only.

**Manual checklist before going live**

1. Create a phone booking for a new and for an existing customer; reload; check the customer's history.
2. Overlap, adjacent and pending-conflict cases from the calendar and from the pending queue.
3. Reschedule, extend, cancel (dialog), no-show; confirm each on the calendar after a refresh.
4. Pickup and return inspection with photos (needs Cloudinary keys) and a mileage-below-pickup error.
5. Overdue return: leave a rental ACTIVE past its date; confirm the car is unavailable everywhere and appears on Today.
6. EMPLOYEE account: no access to fleet edit, Settings or Reports (if gated); a clear no-access page.
7. Deactivate a staff member while they are signed in → their next click logs them out.
8. Phone (375 px) and tablet: Today, the reservation drawer, the booking dialog.
9. Albanian and English: no mixed strings in banners or errors.
10. Timezone: run with `TZ=UTC` and `TZ=Europe/Belgrade` and compare calendar placement for the same booking.

---

## 8. Final assessment

| Area                                       |   Score    | Justification                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------ | :--------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Functionality**                          | **5 / 10** | The full lifecycle works (request → confirm → inspected pickup → inspected return), fleet CRUD is solid, and registration rules are enforced. Missing: customer editing and search (F-14), reservation changes (F-03), real customer capture on phone bookings (F-02), no-shows (F-05), payment recording.                       |
| **Reservation & availability reliability** | **6 / 10** | Scheduled-date double-booking is impossible, at the DB level, under concurrency (verified). But overdue rentals don't block (F-01, confirmed with a live double promise), there are no times or buffers (F-06), stale bookings sit as CONFIRMED (F-05), and the calendar draws every bar one day too long (F-09).                |
| **Security**                               | **7 / 10** | Server-side guards on every action, per-request revocation checks, RLS, parameterised SQL, a validated redirect, an IP limiter (verified). Deductions: open next/zod advisories (F-17), no staff or session management (F-18), the header-trusting limiter (F-19), broad framing and a thin CSP (F-20).                          |
| **UX & visual design**                     | **6 / 10** | Coherent, polished, clear status colours, good empty states and toasts, no horizontal overflow on mobile, shareable drawer URLs. But irreversible one-click cancel (F-04), no availability search (F-10), a "needs attention" count without a list (F-12), no reservation search (F-26), and a banner that crowds mobile (F-24). |
| **Maintainability**                        | **8 / 10** | Strict TS, clean lint, services hold the business logic, reasoning documented, 48 integration tests against real constraints. Minor: the 662-line form and 627-line timeline, a seed string in the UI (F-27), a non-transactional status check (F-16), and a working-tree CSS regression (F-22).                                 |
| **Operational readiness**                  | **4 / 10** | A phone desk needs to capture a callback number, find and fix customers, move bookings, record payment and know who did what. None of that works today. A double-booked car from an overdue rental would only be discovered at the counter.                                                                                      |

---

## 9. Notes and side effects of this audit

- `.claude/launch.json` gained an `alfa-rent-3002` entry (`next dev -p 3002`, `AUTH_URL=http://localhost:3002`). The original entry is unchanged.
- Two local test accounts were added to the **local** database: `audit-admin@alfarent.test` and `audit-employee@alfarent.test`. Their generated passwords are stored only in the session scratchpad, not in the repo. Remove them with:
  `DELETE FROM users WHERE email LIKE 'audit-%@alfarent.test';`
- The test reservations and customers created during testing were deleted. Reservation and customer counts match the starting state (135 / 36). One `rate_limits` row from the limiter test was removed.
- No application code, schema or migration was modified.
