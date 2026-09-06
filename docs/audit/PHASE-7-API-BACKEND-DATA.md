# Alfa Rent — API / Backend / Data Audit (Phase 7)

**Audit date:** 27 August 2026
**Method:** read-only. Contract surface enumerated from the route handlers and actions;
transaction coverage computed by scanning every service function for write calls and
enclosing `$transaction`; timeout posture established by reading every outbound call site and
the installed Prisma type declarations rather than from memory.
**Status:** no code, config, schema or data was modified.

This phase deliberately does not repeat earlier findings. Where a topic was settled in
Phases 1–6 it is cross-referenced in one line. The new ground here is **timeouts and
retries**, **transaction coverage as a whole**, **migration/schema drift**, and the
**distribution of responsibility across the four layers**.

---

## 1. The API contract

Five app-owned HTTP endpoints plus the Auth.js catch-all, and 16 server actions.

| Endpoint                      | Auth                                       | Rate limit                  | Input validation                             | Success                                                    | Failure              |
| ----------------------------- | ------------------------------------------ | --------------------------- | -------------------------------------------- | ---------------------------------------------------------- | -------------------- |
| `GET /api/vehicles`           | none                                       | **none**                    | `vehicleFilterSchema.parse` on search params | 200 `{success,data:{items,total,page,perPage,totalPages}}` | via `normalizeError` |
| `GET /api/availability`       | none                                       | **none**                    | `availabilitySchema.parse`                   | 200 `{success,data:{available,totalPrice}}`                | via `normalizeError` |
| `POST /api/bookings`          | none                                       | 8/hr/IP                     | `createBookingSchema.parse` on JSON body     | **201** `{id,status,totalPrice,paymentAccessToken}`        | via `normalizeError` |
| `POST /api/payments/checkout` | capability token                           | 5/hr per `reservationId`+IP | inline `checkoutSchema.parse`                | **201** `{paymentId,status,checkoutUrl,expiresAt}`         | via `normalizeError` |
| `POST /api/payments/webhook`  | delegated to the (absent) provider adapter | **none**                    | 256 KB body cap, then provider               | 200 `{received,paymentId}`                                 | via `normalizeError` |
| `GET                          | POST /api/auth/[...nextauth]`              | framework                   | login: 10 failures/15 min/IP                 | `loginSchema`                                              | framework            | framework |

**Status codes emitted:** 201 (×2), and from `normalizeError` — 400 (validation), 401, 403,
404, 409, 429 (+`Retry-After`), 503, 500. Everything else defaults to 200.

**The envelope is genuinely uniform.** All five endpoints go through `ok()` and
`withErrorHandling`; there is not one ad-hoc `NextResponse.json` error path. This is the most
consistent part of the codebase.

**Two contract observations:**

- **API-1 · No response carries a `Cache-Control` header.** Nowhere in `src/app/api` or
  `lib/api.ts`. Both public GETs return uncacheable responses, which compounds
  [Phase 6 PERF-10](docs/audit/PHASE-6-PERFORMANCE-SCALABILITY.md) (nothing is cached) and
  [Phase 4 SEC-3](docs/audit/PHASE-4-SECURITY.md) (neither is rate-limited). A
  `s-maxage`/`stale-while-revalidate` header on `/api/vehicles` is the cheapest single
  mitigation for both. **Severity: medium.**
- **API-2 · Validation errors report only the first problem.**
  [errors.ts:81-95](src/lib/errors.ts:81) takes `error.issues[0]`, so a request with four bad
  fields needs four round trips to discover them. Consistent, because it lives in the
  mapper — but it means the API cannot drive a form that shows all errors at once.
  **Severity: low.**

---

## 2. Timeouts and retries — the significant gap

**There is not a single timeout, abort signal, or retry anywhere in the application.** I
checked every outbound call site.

| Call                                                                                                                                                                                                     | Timeout                                        | Retry | Consequence of a hang                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fetch("/api/bookings")` — [booking-form.tsx:147](src/components/forms/booking-form.tsx:147)                                                                                                             | **none**                                       | none  | Request stalls until the browser gives up. Combined with [Phase 3 BUG-1](docs/audit/PHASE-3-BUGS-RELIABILITY.md) (no `catch`), the customer sees nothing either way. |
| `fetch("/api/availability")` — [availability-widget.tsx:77](src/components/forms/availability-widget.tsx:77)                                                                                             | **none**                                       | none  | The `cancelled` flag protects _state_, but the request is never aborted, so `loading` stays true and the spinner never resolves.                                     |
| `XMLHttpRequest` → Cloudinary — [media-grid.tsx:184](src/components/forms/media-grid.tsx:184), [inspection-photo-upload.tsx:64](<src/app/(dashboard)/admin/reservations/inspection-photo-upload.tsx:64>) | **none** (`xhr.timeout` defaults to 0 = never) | none  | See API-3 below.                                                                                                                                                     |
| Cloudinary Node SDK (`destroy`, `rename`) — [cloudinary/index.ts:3](src/lib/cloudinary/index.ts:3)                                                                                                       | **not configured** (SDK default ~60 s)         | none  | See API-4 below.                                                                                                                                                     |
| Prisma queries and `$transaction`                                                                                                                                                                        | **not configured**                             | none  | See API-5 below.                                                                                                                                                     |

### API-3 · A stalled photo upload blocks the inspection form with no explanation

**Severity: medium · Confidence: confirmed.**

`xhr.timeout` is never set, so a stalled upload leaves its item at `status: "uploading"`
indefinitely. The parent derives `uploading = items.some(i => i.status === "uploading")` and
gates submission on it:

```jsx
disabled={pending || uploading || uploadErrors}   // inspection-action.tsx:268
```

So the operator cannot record the inspection, and **nothing tells them why** — the Save
button is simply disabled with a spinner on one tile.

**It is recoverable**, and I checked this rather than assuming: the tile's remove `✕` is
rendered unconditionally and paints above the loading overlay, so clicking it clears the item
and re-enables Save. But that requires the operator to work out that a spinning tile is
blocking an unrelated button.

**Recommendation.** Set `xhr.timeout` (30–60 s), handle `ontimeout` by marking the item
`error` with a retry affordance, and surface a reason on the disabled button. Effort: small.

### API-4 · Unbounded Cloudinary calls inside a loop, under a bounded function

**Severity: medium · Confidence: confirmed mechanism.**

`cloudinary.config()` sets no `timeout`, and there is **no `vercel.json` and no
`maxDuration` export** anywhere, so Vercel's default function limit applies.

`syncVehicleImages` issues **up to 32 strictly sequential round trips** for an 8-photo
gallery ([Phase 6 PERF-8](docs/audit/PHASE-6-PERFORMANCE-SCALABILITY.md)), each Cloudinary
call able to hang for the SDK's default before failing.

**These two facts multiply.** The function is killed by the platform mid-loop, and because
`syncVehicleImages` has **no transaction** (§3), the gallery is left half-reconciled —
exactly the state [Phase 3 HL-1](docs/audit/PHASE-3-BUGS-RELIABILITY.md) describes. The
missing timeout is what turns that from a theoretical race into a predictable outcome under a
slow Cloudinary.

**Recommendation.** Set an explicit SDK timeout, `Promise.all` the independent calls, batch
the DB writes, and set `maxDuration` deliberately on the vehicle actions.

### API-5 · Prisma transaction defaults are unset, and two transactions are large

**Severity: medium · Confidence: confirmed.**

I read the generated client's type declarations: `maxWait`, `timeout` and `isolationLevel` are
all optional on `$transaction`, and **none is configured anywhere** — so Prisma's defaults
apply (`maxWait` 2 s to acquire a connection, `timeout` 5 s to complete).

Two transactions run close to that budget:

- `getDashboardData()` — a **13-query** `$transaction`, executed on both `/admin/dashboard`
  and `/admin/calendar`.
- `recordRentalInspection()` — an interactive transaction containing a read with three
  nested includes, per-photo signature verification, a create with nested photo creates, and
  two conditional `updateMany`s.

Against a pooler documented at **`connection_limit=1`**, `maxWait: 2000` is the number that
matters: under concurrent staff activity, a request that cannot acquire the single connection
within two seconds fails with `P2028`/`P2024`, which `normalizeError` maps to a **generic
500**.

**Recommendation.** Set `transactionOptions` explicitly rather than inheriting defaults, and
raise `connection_limit` (see Phase 6 §8 — the most likely misconfiguration in the
deployment). Also add an explicit mapping for Prisma's transaction error codes so the operator
sees "the system is busy, retry" instead of "an unexpected error occurred".

### API-6 · There is no retry anywhere, and one place genuinely needs one

Nothing retries. For most paths that is the right call — a failed booking should not be
silently resubmitted. But **the rate limiter's single `$queryRaw`** is a transient-failure
path that currently fails _closed_ for sign-in
([Phase 3 BUG-3](docs/audit/PHASE-3-BUGS-RELIABILITY.md)); catching and failing open there is
the fix, not a retry. Worth stating explicitly so "add retries everywhere" is not the
conclusion drawn from this section.

---

## 3. Transactions — complete inventory

Computed by scanning every service function for write calls and its enclosing `$transaction`.

| Service function                                                                             | Writes | Transaction                                                                  |
| -------------------------------------------------------------------------------------------- | -----: | ---------------------------------------------------------------------------- |
| `recordRentalInspection`                                                                     |      5 | ✅ interactive                                                               |
| `createManualReservation`                                                                    |      2 | ✅ interactive                                                               |
| `applyPaymentEvent`                                                                          |      2 | ✅ interactive                                                               |
| `createReservation`                                                                          |      1 | ✅ interactive _(but the customer write happens **outside** it — Phase 2/3)_ |
| `updateReservationStatus`                                                                    |      1 | ✅ interactive                                                               |
| `extendReservation`                                                                          |      1 | ✅ interactive                                                               |
| **`syncVehicleImages`**                                                                      |  **5** | ❌ **none**                                                                  |
| **`deleteVehicle`**                                                                          |  **2** | ❌ **none**                                                                  |
| **`deleteAllVehicleImages`**                                                                 |  **2** | ❌ **none**                                                                  |
| **`createPaymentCheckout`**                                                                  |  **3** | ❌ none — _defensible: it spans an outbound HTTP call_                       |
| `createVehicle`, `updateVehicle`, `addRepair`, `deleteRepair`, `findOrCreateCustomerByEmail` | 1 each | n/a (atomic by definition)                                                   |

**The pattern is clean and worth stating plainly: every reservation-lifecycle write is
properly atomic; every Cloudinary-adjacent write is not.** The three genuine gaps are all in
image handling, and all three are already covered as bugs (Phase 3 BUG-11, BUG-12, HL-1).
`createPaymentCheckout` cannot be atomic and says so; its real gap is the orphaned `PENDING`
row if the process dies between create and update.

---

## 4. Data consistency

### Invariants: where each one actually lives

| Invariant                                                                                          | Enforced by                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No two CONFIRMED/ACTIVE reservations overlap per vehicle                                           | **Database** — GiST `EXCLUDE`                                                                                                                                                                 |
| One PICKUP and one RETURN per reservation                                                          | **Database** — `@@unique([reservationId, type])`                                                                                                                                              |
| Webhook event applied once                                                                         | **Database** — `providerEventId @unique`                                                                                                                                                      |
| Email uniqueness (users, customers)                                                                | **Database** — unique index, but **case-sensitive**; normalised only in application code                                                                                                      |
| `fuelLevel` 0–100, `mileage` ≥ 0                                                                   | **Database** — two CHECK constraints, mirrored in Zod                                                                                                                                         |
| **`returnDate > pickupDate`**                                                                      | **Zod only.** No CHECK constraint. The exclusion constraint's `WHERE` clause excludes PENDING/COMPLETED/CANCELLED, so nothing at the database level prevents an inverted range on those rows. |
| Reservation status machine                                                                         | **Application only** — `ALLOWED_TRANSITIONS`                                                                                                                                                  |
| `Vehicle.status` consistency with reservations                                                     | **Nothing** — three writers, one unguarded ([Phase 3 BUG-14](docs/audit/PHASE-3-BUGS-RELIABILITY.md))                                                                                         |
| Documented immutability of `RentalInspection`, `InspectionPhoto`, `PaymentEvent`, `Payment.amount` | **Convention only** — no trigger, no revoked privilege                                                                                                                                        |

**API-7 · The most valuable addition here is a CHECK constraint on `returnDate > pickupDate`.**
It is a one-line migration, it holds for every status rather than two, and it closes the one
invariant that the database is _asked_ to guarantee elsewhere but does not guarantee at all.
**Severity: low-medium.**

### Nullability

Nullable columns are handled carefully, and I checked the risky ones rather than assuming:

- **`Vehicle.plate String? @unique`** — Postgres permits multiple NULLs, which is the intent
  (vehicles awaiting registration). `vehicleLabel()`/`vehicleIdentifier()` both fall back to
  the production year, with the reasoning documented
  ([utils/vehicle.ts:8-12](src/utils/vehicle.ts:8)). **Correct.**
- **`registrationExpiry`** — every consumer treats `null` as "no limit"
  (`registrationCovers` returns `true`). **Correct.**
- **RETURN inspection mileage floor** — guarded with `if (pickup && …)`, so a missing PICKUP
  record skips the check rather than throwing. **Correct**, though it means the seed's
  inspection-less ACTIVE rentals silently bypass it.
- **`paymentAccessTokenHash String?`** — nullable, and checkout hard-requires it, which is why
  staff-created reservations can never be paid online (Phase 3 L-7). Undocumented either way.

### Duplicate and derived data

| Data                                                                         | Assessment                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Reservation.totalPrice`                                                     | Stored, not derived. **Correct** — it is the agreed price, and `extendReservation` deliberately keeps original days at the agreed rate.                                                                                                                                                                                                                       |
| `Payment.amount`                                                             | Immutable per-attempt copy. **Correct by design**, documented.                                                                                                                                                                                                                                                                                                |
| **`Vehicle.status`**                                                         | Stored and derivable. **The one genuine dual source of truth** (Phase 2 §1.2, Phase 3 BUG-14).                                                                                                                                                                                                                                                                |
| **`VehicleImage.url` + `publicId`**                                          | Both stored, where `url = buildImageUrl(publicId, version)`. **`version` is not a column** — it survives only as a substring of the stored URL. So a Cloudinary account migration or URL-format change breaks every stored URL and it cannot be regenerated without re-querying Cloudinary for versions. **Severity: low**, but worth a `version Int` column. |
| `InspectionPhoto.publicId @unique` vs `VehicleImage.publicId` **not unique** | Asymmetric. The same Cloudinary asset can be attached to two vehicles. `syncVehicleImages` dedupes within one request, but not across them. **Severity: low.**                                                                                                                                                                                                |

---

## 5. Migrations

### API-8 · Four classes of database object exist only in SQL and are invisible to Prisma

**Severity: high (operational) · Confidence: confirmed.**

| Object                                        | Where it lives   | In `schema.prisma`? |
| --------------------------------------------- | ---------------- | ------------------- |
| `reservations_no_overlap` EXCLUDE constraint  | `20260715060451` | **no**              |
| `btree_gist` extension (required by it)       | `20260715060451` | **no**              |
| Row-level security on all 10 tables           | `20260729134500` | **no**              |
| Two CHECK constraints on `rental_inspections` | `20260725100000` | **no**              |

`schema.prisma` is Prisma's source of truth for schema generation. Anything it does not model
is drift, and **any command that regenerates the schema — `migrate dev`, `migrate reset`,
`db push` — will report drift against these or silently drop them.** That includes the
system's single most important invariant and its entire RLS posture.

The team clearly knows: `HANDOFF.md` states that `migrate dev` cannot run here and that every
migration was hand-written for that reason. But **the convention is documented in a markdown
file, not enforced anywhere**, and the RLS test only greps the migration _files_ — it never
asserts the objects exist in a live database.

**Recommendation.** (a) Add a migration-integrity test that runs against the CI Postgres and
asserts, via `pg_constraint` / `pg_class.relrowsecurity`, that all four object classes are
present — CI already spins up `postgres:16` and runs `migrate deploy`, so this is nearly free.
(b) Put the "never run `migrate dev`" rule in `AGENTS.md`, where agents and tooling will see
it, not only in `HANDOFF.md`.

### API-9 · Forward-only, with no rollback path

**Zero down migrations.** Combined with `vercel-build` = `prisma migrate deploy && next build`
(Phase 1: the schema advances even when the build that needs it fails), a bad deploy leaves
the database ahead of the code with no scripted way back. One migration (`20260724161500`) is
additionally irreversible — it nulls matching `reservations.notes`.

For a two-person business this is a reasonable posture, but it should be a _decision_: the
mitigation is a verified restore procedure, which `HANDOFF.md` lists as still outstanding.

---

## 6. Pagination, filtering, sorting

|                        | State                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pagination**         | One `Paginated<T>` envelope, `page`/`perPage`/`total`/`totalPages`, applied by all four list readers. **But `getReservations` has no return-type annotation** — it builds the shape structurally, so a drift in it would not be caught. 3 of 4 are typed.                                                                                              |
| **Page sizes**         | Eight unnamed literals across the app; `paginationSchema`'s default of 12 is never used (Phase 2 §3.6).                                                                                                                                                                                                                                                |
| **Out-of-range pages** | The fleet page degrades gracefully via per-field `.catch()`; reservations and customers **throw to the error boundary** (Phase 3 BUG-7).                                                                                                                                                                                                               |
| **Filtering**          | Rich and well built on vehicles — `buildVehicleWhere` is shared by the admin and public reads _"so their filtering cannot drift"_, with admin-only filters segregated into a separate schema so a visitor cannot craft a URL that surfaces retired vehicles. **This is the strongest part of the data API.**                                           |
| **Sorting**            | Supported on **one** of four lists (`newest`/`price-asc`/`price-desc` on vehicles). Reservations are hard-coded `pickupDate desc`, customers `createdAt desc` — and the admin reservations table renders column headers that are not sortable. Confirms the prior audit's "consistent but narrow". **Severity: low** — a capability gap, not a defect. |

---

## 7. Are responsibilities in the right layer?

This is the question the phase exists to answer. **Roughly 85% right, with four specific
leaks** — each already documented, gathered here as one picture.

| Layer                        | Owns (correctly)                                                                                                              | Leaks                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Database**                 | The double-booking invariant, uniqueness, referential integrity with deliberate `Restrict`/`Cascade` choices, RLS, two CHECKs | Does **not** own `returnDate > pickupDate` (API-7), the status machine, or the immutability it documents                                                                                                                                                |
| **Backend — `services/`**    | **All 18 write sites.** The status machine, pricing, availability advice, the public DTO allowlist                            | Produces **display strings**: four chart-axis label builders and the `day()` helper used inside user-facing error messages (Phase 2 §3.2)                                                                                                               |
| **API — handlers & actions** | Correctly thin: parse → guard → call one service → format. One uniform envelope                                               | Owns one unit of work it should not: "save a vehicle **with its gallery**" is composed in the action, so the service layer cannot enforce its atomicity (Phase 2 §2.4 / Phase 3 BUG-11)                                                                 |
| **Frontend**                 | Presentation, optimistic UX, URL-as-state for list controls                                                                   | Re-implements **four** business rules the services own — the transition table, the pickup/return rule, rental-day pricing (twice), and extension pricing — plus a second booking schema whose **rule set differs** from the server's (Phase 2 §1.5, §7) |

**The single most consequential leak is the last one**, because the client's booking schema
omits the three date rules the server enforces. That is not duplication that might drift — it
is duplication that is _already_ inconsistent, and the user-visible result is an English
server error on an Albanian page (Phase 5 UX-4).

---

## 8. Verified sound

1. **The response envelope is uniform across all five endpoints** — `ok()` +
   `withErrorHandling`, zero ad-hoc error paths, a seven-class `AppError` taxonomy mapping
   cleanly onto HTTP status.
2. **Route handlers are genuinely thin** — 13 to 41 lines, each doing nothing but parse, call
   one service, and serialise.
3. **Every reservation-lifecycle write is atomic**, and state transitions use conditional
   `updateMany` + `count !== 1` as a compare-and-swap rather than read-then-write.
4. **`findOrCreateCustomerByEmail` handles its own race correctly** — it catches `P2002` and
   re-reads the winner's row, with the reasoning documented.
5. **Nullable columns are handled at every consumer I checked**, with documented fallbacks.
6. **The shared filter builder** with segregated admin-only filters, and the explicit public
   DTO allowlist guarded by a test.
7. **Migration history is linear and append-only** — 12 directories, no file modified after
   being added.
8. **Decimal is used for all money**, never float, and converted at exactly one boundary per
   payload.
9. **The 429 responses carry `Retry-After`**, with a comment explaining why a 429 without it
   is useless.

---

## 9. Priority

1. **API-8** — a migration-integrity test in CI. The exclusion constraint and RLS are the two
   things this system most depends on, and nothing currently proves they exist in a live
   database.
2. **API-5** — set `transactionOptions` explicitly and verify `connection_limit`; map Prisma's
   transaction error codes to a comprehensible message.
3. **API-3** and **API-4** — XHR and Cloudinary SDK timeouts. Both small, and API-4 is what
   makes a known partial-write bug likely rather than theoretical.
4. **API-1** — `Cache-Control` on the two public GETs. One header, mitigates a performance
   and an availability finding at once.
5. **API-7** — the `returnDate > pickupDate` CHECK constraint. One line.
6. **§7's frontend leak** — reconcile the client booking schema with the server's rules.
7. **API-9**, **API-2**, and the low-severity data items.

---

_End of Phase 7. No code was modified. Phase 8 (Testing & Developer Experience) has not begun._
