# Alfa Rent — Bug & Reliability Audit (Phase 3)

**Audit date:** 27 August 2026
**Method:** read-only. Static reading plus **dynamic probing** — I executed the real
date, interval and pricing modules with `tsx` against boundary inputs rather than
reasoning about them, and I read the installed `react-hook-form`, `date-fns` and Next.js 16
sources to confirm runtime behaviour instead of assuming it.
**Status:** no code, config, schema or data was modified.

---

## Classification

|                        | Meaning                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| **Confirmed**          | I traced or executed the failing path. A reproduction is given.                                      |
| **Highly likely**      | The mechanism is certain; the trigger depends on timing or an external failure I cannot force here.  |
| **Latent**             | The bug is real but **cannot occur today** because the feature is switched off. Fix before enabling. |
| **Needs verification** | Requires a live database or the production environment.                                              |

**§6 lists things I checked and found correct.** That section matters as much as the
bug list — several are things a less careful pass would have reported as defects.

---

## 1. Confirmed bugs — high severity

### BUG-1 · A public booking that hits a network error vanishes with no feedback

- **File:** [booking-form.tsx:145-168](src/components/forms/booking-form.tsx:145) · `BookingForm.onSubmit`
- **Severity:** high · **Confidence:** confirmed

`onSubmit` calls `fetch("/api/bookings")` and `await response.json()` with **no
`try`/`catch`**. I read the installed `react-hook-form@7.81` source to establish exactly
what happens ([index.esm.mjs](node_modules/react-hook-form/dist/index.esm.mjs), `handleSubmit`):

```js
try { await onValid(fieldValues, e); }
catch (error) { onValidError = error; }
…
_subjects.state.next({ isSubmitted: true, isSubmitting: false, … });
if (onValidError) { throw onValidError; }
```

**How it fails:** the rejection is captured, `isSubmitting` is set back to `false`, and the
error is then re-thrown as an unhandled rejection — which React 19 does **not** route to an
error boundary from an event handler.

**What the customer sees:** they complete the form, tap _Send_, the button flickers from
"Sending…" back to "Send", and **nothing else changes**. No error, no confirmation. They
will assume it did not go through and retry. After eight attempts in an hour the rate
limiter finally answers with _"You have sent several booking requests recently"_ — the
opposite of their actual experience.

**Reproduction:** open `/booking?vehicle=…`, fill the form, switch the device offline,
submit. Also triggered by a proxy returning a non-JSON 502, which makes `response.json()`
throw on the same path.

This is the business's revenue path, and the prior audit flagged it as M10 on 24 July.

**Fix:** wrap the fetch in `try/catch`, `setServerError(t("availability.error"))` (or a
dedicated key) on failure. Three lines. Effort: trivial.

### BUG-2 · Clearing an optional vehicle field silently does nothing

- **File:** [vehicles/actions.ts:32-49](<src/app/(dashboard)/admin/vehicles/actions.ts:32>) · `parseVehicleFields`
- **Severity:** high · **Confidence:** confirmed
- **Affected fields:** `plate`, `registrationDate`, `lastServiceDate`, `nextServiceDate`, `serviceNotes`

Three behaviours combine:

1. `parseVehicleFields` maps every optional field through `formData.get(x) || undefined`,
   so an emptied field becomes `undefined` rather than `""`.
2. `updateVehicleSchema` is `createVehicleSchema.partial()`. I verified in Zod that
   `.partial().parse({plate: undefined})` returns `{ plate: undefined }` — the key survives.
3. Prisma treats `undefined` as **"leave this column unchanged"** (only `null` clears it).

All five fields are clearable in the UI: `plate` and `serviceNotes` are text inputs, and
`registrationDate` / `lastServiceDate` / `nextServiceDate` are `DateField`s whose
`clearable` prop **defaults to `true`** ([date-range-picker.tsx:137](src/components/forms/date-range-picker.tsx:137)),
so each renders an ✕.

**Reproduction:** open a vehicle with a "Next service due" date → click the ✕ → the field
empties and the form marks itself dirty → _Save_ → it redirects to the fleet successfully →
reopen the vehicle → **the date is still there.**

**Consequence:** a plate can never be removed; a service date that was entered by mistake
can only be overwritten, never cleared; and the operator is given no signal that the save
did not do what the screen showed. This is a data-integrity bug wearing a success message.

**Fix:** map to `null` rather than `undefined` for nullable columns, and make the schema
accept `null`. Effort: small.

### BUG-3 · The rate limiter fails **closed**, contradicting its own documented design

- **File:** [rate-limit.ts:28-49](src/lib/rate-limit.ts:28) · `consumeRateLimit`
- **Severity:** high · **Confidence:** confirmed
- **Callers affected:** [auth/index.ts:33](src/lib/auth/index.ts:33) (sign-in), [api/bookings/route.ts:18](src/app/api/bookings/route.ts:18), [api/payments/checkout/route.ts:20](src/app/api/payments/checkout/route.ts:20), both upload-signature actions

The function's comment states the intent explicitly:

> _"Never fail closed on a limiter fault — losing the counter must not take the booking
> form down with it."_

But that fail-open branch only covers the **empty result set** (`if (!row)`). The
`await prisma.$queryRaw` itself is **not wrapped in `try`/`catch`**. Any thrown
error — pool exhaustion, a pooler hiccup, a statement timeout, a lock on `rate_limits` —
propagates out.

**Consequence:**

- In `authorize()` the throw escapes the credentials provider, so Auth.js reports a failed
  sign-in. **A transient database blip locks every staff member out of the dashboard**,
  and because login errors are deliberately generic they get "invalid credentials" — they
  will assume their password is wrong.
- In the booking route it becomes a 500 for a customer trying to book.

**Why this is more than theoretical:** the production pooler is documented as running with
`connection_limit=1`, and _every_ sign-in attempt, booking, checkout and upload signature
performs a write to `rate_limits`. This is the single most contended table in the app.

**Fix:** wrap the query in `try/catch` and return the same fail-open result the `!row`
branch already returns. Effort: trivial.

### BUG-4 · Opening the repairs panel prevents saving the vehicle

- **File:** [repairs.tsx:150-190](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:150>) rendered inside the `<form>` at [vehicle-form.tsx:126](src/components/forms/vehicle-form.tsx:126)
- **Severity:** high · **Confidence:** confirmed

`RepairsPanel` has no `<form>` of its own; its inputs are children of the vehicle form.
The vehicle `<form>` carries **no `noValidate`**, so native browser constraint validation
runs across every field it contains — including the repair panel's `required` `cost` and
`description` inputs, which render whenever the panel is expanded.

**Reproduction:** open a vehicle → click _Add repair_ (do not fill it in) → change any
vehicle field → click _Save vehicle_. The browser refuses to submit and focuses the empty
repair **cost** field, which the operator was not editing. The vehicle cannot be saved
until they either complete a repair they did not want to add, or collapse the panel.

**Related, same root cause:** `name="description"` and `id="description"` exist **twice**
in one form — the vehicle's textarea at `vehicle-form.tsx:295` and the repair's input at
`repairs.tsx:181`. `formData.get("description")` returns the first in DOM order, so the
vehicle's value wins **only because the textarea happens to be rendered first**. Reordering
would silently save the repair text as the vehicle description. The duplicate `id` also
means the repairs panel's `<label htmlFor="description">` points at the vehicle's textarea.

**Fix:** give `RepairsPanel` its own `<form>` — it already builds its own `FormData` and
calls its own action, so nothing else changes — and rename its fields `repair-*`. Effort: small.

---

## 2. Confirmed bugs — medium severity

### BUG-5 · Every reservation bar on the fleet calendar is one day too wide

- **File:** [calendar/page.tsx:90-99](<src/app/(dashboard)/admin/calendar/page.tsx:90>)
- **Confidence:** confirmed — verified by executing `date-fns`

```js
const to = min([r.returnDate, rangeEnd]);
span: Math.max(
  1,
  differenceInCalendarDays(to, from) + (to === r.returnDate ? 0 : 1)
);
```

The `+1` is meant to apply only when the bar is **clipped** at the window edge. But
`date-fns` `min()` returns a **new `Date`**, never the argument reference — I confirmed
this directly:

```
min returns same object reference as argument? false
min value equals a?                            true
```

So `to === r.returnDate` is **always false** and the `+1` always applies.

**Consequence:** every reservation on the fleet calendar renders one day longer than it is.
A car that returns on the 5th appears occupied through the 6th, so staff reading the
calendar will not offer a booking that is actually available. Silent revenue loss.

**Fix:** compare values, not references — `to.getTime() === r.returnDate.getTime()`.
Effort: trivial.

### BUG-6 · One customer, two different "lifetime spend" figures

- **Files:** [reservation-detail.tsx:180,411](<src/app/(dashboard)/admin/reservation-detail.tsx:180>) · [customer-detail-body.tsx:22,31](<src/app/(dashboard)/admin/customer-detail-body.tsx:22>)
- **Confidence:** confirmed

|             | Reservation drawer                                                                 | Customer drawer                                                            |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rows summed | `take: 20` ([reservation.service.ts:535](src/services/reservation.service.ts:535)) | `take: 50` ([customer.service.ts:75](src/services/customer.service.ts:75)) |
| Format      | `toFixed(2)` → `1234.00 EUR`                                                       | `Math.round` → `1234 EUR`                                                  |
| Label       | _(none)_                                                                           | "Lifetime" / "Gjithsej"                                                    |

Both sum `totalPrice` over `ACTIVE`/`COMPLETED` reservations **from a truncated `include`**.

**Consequence:** for any customer with more than 20 rentals the two drawers show different
numbers for the same thing, and the one labelled "Lifetime" is itself wrong past 50. Staff
use this to judge whether a customer is worth keeping.

**Fix:** one service function using a database `_sum` aggregate. Effort: small.

### BUG-7 · A malformed `?page` throws the operator to the error screen

- **Files:** [reservations/page.tsx:46](<src/app/(dashboard)/admin/reservations/page.tsx:46>) · [customers/page.tsx:26](<src/app/(dashboard)/admin/customers/page.tsx:26>)
- **Confidence:** confirmed — verified by executing the schema

Both call `paginationSchema.parse(...)`, which throws. I ran every plausible bad value:

```
"abc" -> THROWS   "0" -> THROWS   "-3" -> THROWS
"1.5" -> THROWS   ""  -> THROWS   "99999999999999999999" -> THROWS
```

A `ZodError` thrown in a server component is caught by
[admin/error.tsx](<src/app/(dashboard)/admin/error.tsx>) and rendered as the generic
"something went wrong" card.

**Consequence:** `/admin/reservations?page=0` — a hand-edited URL or a stale link — shows a
crash screen instead of page 1. Meanwhile the fleet page handles this correctly and by
design: `adminVehicleFilterSchema` gives every field its own `.catch()`, with the stated
reason _"one unreadable param drops just that filter"_. **The fleet page is right; these two
are the outliers.**

**Fix:** apply the same `.catch(1)` treatment. Effort: trivial.

### BUG-8 · Command palette results can be overwritten by a stale response

- **File:** [command-palette.tsx:123-138](<src/app/(dashboard)/admin/command-palette.tsx:123>)
- **Confidence:** confirmed

The debounce cleanup is `return () => clearTimeout(timer)` — it cancels a _pending_ timer
but cannot cancel an **in-flight** `searchAdminAction`. There is no `cancelled` flag.

**Consequence:** type a broad query (slow — three unindexed `ILIKE '%q%'` scans across
vehicles, customers and reservations), then refine it. The refined results render, then the
original slow response lands and **replaces them with results for a query the operator has
already moved past**. `setActive(0)` also fires late, resetting their keyboard selection.

The [availability widget](src/components/forms/availability-widget.tsx:70) — written by the
same hand, seven files away — does this correctly with `let cancelled = false`. So the
correct pattern already exists in the codebase.

**Fix:** copy the `cancelled` flag pattern. Effort: trivial.

### BUG-9 · The command palette reports every failure as "nothing matches"

- **File:** [command-palette.tsx:133](<src/app/(dashboard)/admin/command-palette.tsx:133>) · **Confidence:** confirmed

```js
setHits("error" in result ? [] : result.hits);
```

This is the **only place in the codebase that discards an error** — every other failure
path surfaces a message. A revoked session, a `ForbiddenError`, or a database fault all
render as an empty result list, so an operator whose session has expired is told their
search found nothing rather than being sent to sign in.

**Fix:** keep the error in state and render it, as the other twelve client components do.
Effort: trivial.

### BUG-10 · The dashboard's revenue KPI and its revenue chart use different month boundaries

- **File:** [analytics.service.ts](src/services/analytics.service.ts) · **Confidence:** confirmed

The same service mixes two definitions of a calendar period:

| Uses branch-local (Belgrade) boundaries | Uses raw `date-fns` (= **UTC** on Vercel) |
| --------------------------------------- | ----------------------------------------- |
| `businessDayStart` :42, :56, :190       | `startOfMonth` :32, :33, :331, :332, :365 |
| `businessWeekStart` :57                 | `startOfWeek` :358                        |
| `businessMonthStart` :58, :282          | `startOfYear` :372                        |

The `business*` helpers exist precisely because a Vercel UTC deployment would otherwise
shift when a period begins — that reasoning is documented in
[reservation-lifecycle.ts:24-28](src/lib/reservation-lifecycle.ts:24). The raw `date-fns`
calls bypass it.

**Consequence:** a reservation created between 22:00 and 00:00 UTC on the last day of a
month (00:00–02:00 Belgrade on the 1st) is counted in the **new** month by the
"revenue this month" KPI and in the **old** month by the revenue chart beside it. Two
numbers on one screen that permanently disagree, with no way for staff to tell which is
right. The same applies to the week KPI and the year bucket.

**Fix:** use `businessMonthStart` / `businessWeekStart` / a business year-start throughout
`monthlySeries`, `dailySeries` and the `getAnalytics` period config. Effort: small.

### BUG-11 · A failed photo save leaves a vehicle created, and a retry creates a second one

- **File:** [vehicles/actions.ts:85-101](<src/app/(dashboard)/admin/vehicles/actions.ts:85>) · **Confidence:** confirmed

```js
const vehicle = await createVehicle(input); // committed
vehicleId = vehicle.id;
await syncVehicleImages(vehicle.id, images); // separate, can throw
```

**Reproduction:** create a vehicle **without a plate**, attach photos, with Cloudinary
unreachable (or any photo failing signature verification). `syncVehicleImages` throws, the
catch returns `{ error }`, and the operator stays on the _new vehicle_ form — but the
vehicle row already exists. They click _Save_ again → **a second vehicle appears in the
fleet**, because `createVehicle` has no idempotency and a plateless vehicle's slug gets a
random identity suffix, so no unique constraint stops it.

_(With a plate, the retry fails on the unique plate index with "A record with this value
already exists" — confusing, but not duplicating.)_

**Fix:** move both steps into one service function inside a transaction, or make the action
recover by updating the vehicle it already created. Effort: medium.

### BUG-12 · Deleting a vehicle can destroy its photos permanently while keeping the vehicle

- **File:** [vehicle.service.ts:227-255](src/services/vehicle.service.ts:227) · `deleteVehicle` · **Confidence:** confirmed mechanism, race-dependent trigger

The hard-delete path is three non-atomic steps: count open reservations → count all
reservations → `deleteAllVehicleImages()` (destroys every Cloudinary asset **and** its DB
rows) → `prisma.vehicle.delete()`.

`Reservation.vehicleId` is `onDelete: Restrict`. If a public booking lands between the
count and the delete — a genuine TOCTOU window, and the booking endpoint is anonymous and
unauthenticated — the final delete raises a foreign-key violation, surfaced as
_"Operation violates a data relationship"_.

**Consequence:** the vehicle survives, the reservation survives, and **the entire photo
gallery has already been irreversibly destroyed in Cloudinary**. The operator sees an error
and has no indication that anything was lost.

**Fix:** do the DB delete first inside a transaction, and only destroy the Cloudinary
assets after it commits. Stranding an unreferenced asset is recoverable; deleting a
customer-facing photo is not. _(This inverts the ordering comment at `:250`, which weighed
the two the other way — the trade-off is worth re-stating explicitly in the code.)_

### BUG-13 · The return handover does not verify that the vehicle was released

- **File:** [inspection.service.ts:159-162](src/services/inspection.service.ts:159) · **Confidence:** confirmed

The PICKUP branch guards its vehicle update:

```js
const rented = await tx.vehicle.updateMany({ where: { id, status: "AVAILABLE" }, … });
if (rented.count !== 1) throw new ConflictError(…);
```

The RETURN branch, 19 lines later, performs the mirror-image update **with no check at
all**. Its three sibling `updateMany` calls in the same function all assert `count === 1`.

**Consequence:** if the vehicle is not `RENTED` at return time — which BUG-14 makes
reachable — the reservation is marked `COMPLETED` and the vehicle is left in whatever
state it was in. A car that has physically come back is never returned to `AVAILABLE`, and
nothing reports it.

**Fix:** either assert the count like its sibling, or add a comment stating that leniency
is deliberate. Right now the asymmetry reads as an oversight. Effort: trivial.

### BUG-14 · `updateVehicle` can mark a rented car as available

- **File:** [vehicle.service.ts:216-222](src/services/vehicle.service.ts:216) · **Confidence:** confirmed

`updateVehicle` is a bare `prisma.vehicle.update({ where: { id }, data: input })`, and
`input` includes `status`, with **no invariant check**. The vehicle form exposes a status
dropdown.

**Consequence:** an admin editing a car that is out on rental can set it to `AVAILABLE`.
The double-booking constraint still protects the calendar, but the fleet then reports a
rented car as free, and the eventual return update (BUG-13) silently matches nothing.
`Vehicle.status` has three writers with three different rules and no owner.

**Fix:** reject a status change that contradicts an open reservation, or remove `status`
from the general update path and give it its own guarded transition. Effort: medium.

### BUG-15 · Inspection photos are silently discarded past the limit

- **File:** [inspection-photo-upload.tsx:107-133](<src/app/(dashboard)/admin/reservations/inspection-photo-upload.tsx:107>) · **Confidence:** confirmed

`choose()` computes `room = MAX_INSPECTION_PHOTOS - items.length` and does
`.slice(0, room)` with **no message**. If the panel is already full, `room <= 0` produces
an empty list and the function returns having done **nothing visible at all**.

Separately, the format/size `.filter()` writes into a single shared `error` string, so with
a mixed batch only the last rejection reason survives and no file is named.

**Consequence:** an inspector documenting damage selects eight photos, six upload, and two
are dropped without a word. The inspection is the legally significant condition record for
that rental. The vehicle media grid, by contrast, reports `admin.photoLimit` and tracks
rejections per file.

**Fix:** report the truncation, and track rejections as a list. Effort: small.

---

## 3. Confirmed bugs — low severity

| #      | Bug                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Evidence |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| BUG-16 | **Extension refusal reasons are matched by English string equality.** [extend-reservation.tsx:50-62](<src/app/(dashboard)/admin/reservations/extend-reservation.tsx:50>) compares `extension.reason` against three exact English literals from [reservation.service.ts:421](src/services/reservation.service.ts:421) to pick a translation. The fourth reason — `` `A ${status} reservation cannot be extended.` `` — matches none of them and **always** falls through to the generic message. Any wording change to the service silently degrades three more. |
| BUG-17 | **The pending banner flashes before it knows it was dismissed.** [pending-banner.tsx:45-56](src/components/dashboard/pending-banner.tsx:45) reads `localStorage` in a `useEffect`, so the banner renders visible on first paint and then disappears. The sidebar solves exactly this problem with a cookie and [documents why](<src/app/(dashboard)/admin/sidebar-state.ts:1>) — _"localStorage cannot be read while the server renders … a visible flinch"_.                                                                                                   |
| BUG-18 | **Banner dismissal state diverges from what is persisted.** Same file: `setDismissed(next)` stores the full list in memory but writes `next.slice(-8)` to `localStorage`, so after eight dismissals the two disagree.                                                                                                                                                                                                                                                                                                                                           |
| BUG-19 | **Object URLs are never revoked on unmount.** `URL.createObjectURL` is revoked in `remove()` but not when the inspection panel closes or after a successful upload — a small leak per inspection session.                                                                                                                                                                                                                                                                                                                                                       |
| BUG-20 | **`EXIT_MS = 192` contradicts its own comment.** [detail-drawer.tsx:9](src/components/dashboard/detail-drawer.tsx:9) says _"Must match `--motion-panel-exit` in globals.css"_; that token is `160ms` ([globals.css:200](src/app/globals.css:200)). The drawer stays mounted 32 ms past its animation.                                                                                                                                                                                                                                                           |

---

## 4. Highly likely

### HL-1 · A mid-loop failure leaves a vehicle gallery half-reconciled

[image.service.ts:70-101](src/services/image.service.ts:70) performs N Cloudinary deletes
and N+M database writes **with no transaction**. The _ordering_ is deliberate and
documented (_"Cloudinary first: if it fails the DB row survives and the operation can be
retried; the reverse order would strand an unreferenced asset"_) and that trade-off is
defensible. What is not addressed is a failure **partway through**: some photos deleted,
some `sortOrder` values rewritten, some new rows created, and no rollback. The gallery is
then in a state no single save produced.

### HL-2 · The friendly double-booking message depends on an untested string match

[errors.ts:116-123](src/lib/errors.ts:116) turns the exclusion-constraint violation into a
clean 409 by testing `error.message.includes("reservations_no_overlap")`. This is the
single most load-bearing invariant in the system, and its user-facing behaviour rests on a
substring of a Postgres message surfaced through Prisma — not on SQLSTATE `23P01`. No test
covers it, and the only integration test does not route through `normalizeError`. A Prisma
upgrade that rewords the wrapper turns every double-booking into an opaque 500.

---

## 5. Latent — real, but cannot occur until payments are switched on

Payments are inert four ways (no adapter registered, flag off, provider unset, no UI
caller), so **none of these can fire today**. All must be fixed before a bank adapter is
registered.

| #   | Issue                                                                                                                                                                                                                                                    | File                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| L-1 | **Two concurrent checkouts create two payments.** Reuse is a best-effort `findFirst` with no lock, no transaction and no unique constraint on `(reservationId, status)`.                                                                                 | [payment.service.ts:89-108](src/services/payment.service.ts:89)       |
| L-2 | **Concurrent duplicate webhooks both pass the duplicate check.** The check is a plain `findUnique` inside a read-committed transaction; the `providerEventId` unique index then raises a raw error rather than an idempotent response.                   | [payment.service.ts:161-183](src/services/payment.service.ts:161)     |
| L-3 | **`failureCode` / `failureMessage` survive a later success.** They are passed as possibly-`undefined`, and Prisma treats `undefined` as "leave unchanged" — the same mechanism as BUG-2. A `FAILED → SUCCEEDED` transition keeps the stale failure text. | [payment.service.ts:191-199](src/services/payment.service.ts:191)     |
| L-4 | **Nothing ever reaps an expired checkout.** `EXPIRED` exists in the enum and `isTerminalPaymentStatus` has no caller; no scheduled job exists.                                                                                                           | [payment.service.ts:36-49](src/services/payment.service.ts:36)        |
| L-5 | **Extending a rental changes `totalPrice` with no reconciliation against a settled payment.** A customer who paid in full and then extends is under-collected, silently.                                                                                 | [reservation.service.ts:490](src/services/reservation.service.ts:490) |
| L-6 | **Internal faults are reported to the customer as a bank outage.** `amountToMinorUnits` throws inside the same `try` as the provider call, so a non-payable total is reported as _"The bank checkout is temporarily unavailable"_.                       | [payment.service.ts:110-152](src/services/payment.service.ts:110)     |
| L-7 | **Walk-in reservations can never be paid online** — `createManualReservation` mints no `paymentAccessTokenHash`, which checkout hard-requires. Plausibly intentional; undocumented either way.                                                           | [reservation.service.ts:236](src/services/reservation.service.ts:236) |

---

## 6. Checked and found correct — do not "fix" these

Each was actively suspected and cleared. Several would be easy to report as bugs.

1. **All date and interval logic is correct at its boundaries.** I executed the real
   modules against edge inputs. Half-open intervals behave consistently: a rental
   _touching_ a blocked range is allowed, an overlapping one is refused, and
   `latestUnder` handles both the ceiling-on-a-pickup and ceiling-at-midnight cases:

   ```
   2026-08-28..2026-09-01 (ends where a block starts) -> available: true
   2026-09-05..2026-09-08 (starts where a block ends) -> available: true
   2026-08-30..2026-09-02 (overlaps)                  -> available: false
   latestUnder(return 10:00Z, ceiling next pickup 10:00Z) -> 2026-08-25T10:00Z
   latestUnder(return 10:00Z, ceiling midnight)           -> 2026-08-24T10:00Z
   ```

2. **Client and server pricing agree — including across both Belgrade DST transitions.**
   I ran the server's `rentalDays` against both client re-implementations over the
   spring-forward and fall-back nights; all agree. _(They agree **because** every date is
   pinned to `T10:00:00Z`. That magic string is therefore load-bearing — see Phase 2 §3.6.)_

3. **Float money in analytics is not a real precision bug.** `Decimal` and the `Number()`
   path agree to two decimal places even at 365 × 33.33 (`12165.45` vs
   `12165.449999999999`). A previous pass flagged this; **dismissing it.**

4. **The uneven `revalidatePath` coverage is not a staleness bug.** Some actions revalidate
   four paths, some two, some one, and `/admin/analytics` and `/admin/customers` are never
   revalidated at all. I checked the installed Next 16 docs: `staleTimes.dynamic` has
   defaulted to **0 s since v15**, this project does not override it, and every admin route
   is `force-dynamic` — so those pages re-render on every navigation regardless.
   **Latent only:** if `force-dynamic` is ever removed or `staleTimes` set, the uneven
   coverage becomes real bugs.

5. **Null handling on optional relations is careful.** Every `images[0]` access across the
   eight sites is guarded with `?.` or a ternary. There are only six non-null assertions in
   the entire source, each locally justified.

6. **Double-submit is guarded** on both the booking form (`isSubmitting`) and the vehicle
   form (`pending`).

7. **`rentalDays` throwing a raw `RangeError` is unreachable** — all four call sites are
   behind Zod refinements that guarantee `returnDate > pickupDate`.

8. **The delete dialog's copy is accurate.** It explicitly explains that vehicles with
   history are retired rather than deleted, in both languages.

9. **The `useCallback`-memoised `onStateChange` in the inspection flow does not loop.** I
   checked for the classic effect-feedback cycle; the parent memoises with `[]`.

10. **`react-hooks` lint is at full strength and passing**, which rules out the whole class
    of stale-closure and missing-dependency bugs by construction.

---

## 7. Needs verification — requires a live database or production access

| #    | Question                                                                                                                                                                                                      | Why it matters                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| NV-1 | Does a Postgres exclusion-constraint violation raised inside a Prisma interactive transaction actually surface with `reservations_no_overlap` in `error.message`?                                             | Decides whether HL-2 is a latent 500 or already fine.         |
| NV-2 | Does `prisma db seed` still succeed once `payments` rows exist? `seed.ts:564` calls `reservation.deleteMany()` while `payments.reservationId` is `onDelete: Restrict`, and payments are not in the wipe list. | The seed would fail on any database that has taken a payment. |
| NV-3 | Do the raw-SQL rate-limit semantics hold under Supabase's **transaction** pooler? The unit tests mock `$queryRaw` entirely, so that SQL has never actually executed in CI.                                    | Underpins BUG-3 and all abuse control.                        |
| NV-4 | Does Vercel replace or append to a client-supplied `x-forwarded-for`?                                                                                                                                         | Decides whether both limiters are trivially bypassable.       |

**Process risk, no live DB needed:** `npm run test:integration` unconditionally inserts a
User, Customer, Vehicle and Reservation into **whatever `DATABASE_URL` names**, with no
production guard — unlike the seed, which requires an explicit destructive
acknowledgement. Pointing it at production would write real rows and could trip the
exclusion constraint against a real booking.

---

## 8. Summary

**20 confirmed bugs** (4 high, 11 medium, 5 low), **2 highly likely**, **7 latent** behind
the payments flag, **4 needing environment access**, and **10 suspicions actively cleared**.

The four high-severity bugs share a theme worth naming: _the code does something
reasonable and then fails to tell anyone_. A booking disappears silently; a cleared field
silently doesn't clear; the limiter silently inverts its own documented failure mode; the
save button silently refuses. None of them corrupts data loudly — which is exactly why
they have survived two prior audits.

The cheapest three fixes — BUG-1, BUG-3 and BUG-5 — are each one to three lines and
between them cover the customer's booking path, staff sign-in availability, and the
accuracy of the fleet calendar.

---

_End of Phase 3. No code was modified. Phase 4 (Security) has not begun._
