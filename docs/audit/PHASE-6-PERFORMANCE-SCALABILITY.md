# Alfa Rent — Performance & Scalability Audit (Phase 6)

**Audit date:** 27 August 2026
**Method:** read-only, but **measured rather than estimated**. I ran the production build and
computed per-route client JS from the real emitted chunks and client-reference manifests
(raw and gzip), hashed every chunk to test for duplication, identified chunk contents by
library signature, measured the i18n payload by executing the module, and counted queries per
page load from the actual service call graph.
**Status:** no code, config, schema or data was modified.

**Not measured:** runtime metrics (LCP, INP, TTFB, real query latency) and database
`EXPLAIN` plans. Those need a running app with data — no local Postgres and no `.env`
exist here. Docker is available, so this is doable on request.

---

## 1. Measured baseline

### Client JavaScript per route

Computed by resolving each route's `page_client-reference-manifest.js` to its chunks and
summing unique file sizes. **Gzip is the number that matters** — it approximates transfer.

| Route                       | Chunks | Raw KiB | **Gzip KiB** |
| --------------------------- | -----: | ------: | -----------: |
| `/admin/vehicles/[id]/edit` |     17 |   869.2 |    **250.4** |
| `/admin/vehicles/new`       |     17 |   864.3 |    **248.7** |
| `/admin/vehicles`           |     16 |   815.2 |    **232.6** |
| `/admin/calendar`           |     16 |   771.3 |    **217.1** |
| `/admin/reservations`       |     16 |   773.4 |    **216.9** |
| `/admin/dashboard`          |     16 |   771.3 |    **216.4** |
| `/admin/customers`          |     16 |   762.9 |    **214.1** |
| `/admin/analytics`          |     16 |   757.4 |    **212.5** |
| `/admin` (redirect)         |     15 |   756.0 |    **211.7** |
| `/booking`                  |     15 |   705.9 |    **198.1** |
| `/` (home)                  |     12 |   407.7 |    **131.8** |
| `/login`                    |     11 |   484.0 |    **128.1** |
| `/car/[slug]`               |     12 |   369.1 |    **117.8** |
| `/car`                      |     12 |   291.1 |     **96.2** |
| `/contact`                  |      9 |   149.9 |     **48.2** |
| `/_not-found`               |      5 |    78.4 |         23.0 |

Whole-app total: **2.67 MiB raw / 823 KiB gzip across 50 chunks.**

Two things fall straight out of this table:

- **`/contact` is the framework floor: 48 KiB gzip.** Every admin route sits at **211 KiB
  minimum**, and the spread across all nine admin routes is under 40 KiB. That flatness is
  the signature of the eager import graph — roughly **163 KiB gzip of app code loads on
  every admin route regardless of which one you asked for**.
- **`/login` ships 128 KiB gzip for an email and a password field.**

### Server queries per page render

Counted from the call graph. Every admin request pays the layout cost _plus_ the page cost.

| Route                 | Layout | Page | **Total** | Notes                                                               |
| --------------------- | -----: | ---: | --------: | ------------------------------------------------------------------- |
| `/admin/calendar`     |      3 |   16 |    **19** | calls `getDashboardData()` (13 queries) which it barely uses        |
| `/admin/analytics`    |      3 |   15 |    **18** | `getAnalytics` → 4 + `getFleetInsights` 4 + `getCustomerInsights` 6 |
| `/admin/dashboard`    |      3 |   14 |    **17** | `getDashboardData` is a 13-query `$transaction`                     |
| `/admin/customers`    |      3 |    9 |    **12** |                                                                     |
| `/admin/reservations` |      3 |    8 |    **11** |                                                                     |
| `/admin/vehicles`     |      3 |    8 |    **11** |                                                                     |

Layout = `requireUser()` + `getPendingCount()` + `getRegistrationAlerts()`.
**Every page then calls `requireUser()` again** — the same `User` row, twice per render.

**React `cache()` appears exactly once in the entire codebase**
([car/[slug]/page.tsx:42](<src/app/(website)/car/[slug]/page.tsx:42>)), where it correctly
dedupes a query between `generateMetadata` and the page body. The pattern is established and
simply not applied to the guard.

### RSC payload — the i18n dictionary

Measured by executing the module:

| Locale         | Keys |      Raw |        Gzip | `admin.*` portion                 |
| -------------- | ---: | -------: | ----------: | --------------------------------- |
| `sq` (default) |  549 | 24.0 KiB | **8.2 KiB** | 335 keys / **14.6 KiB raw (61%)** |
| `en`           |  549 | 23.1 KiB |     7.6 KiB | 335 keys / 14.0 KiB raw           |

The full active dictionary is passed as a prop to a client component in the **root** layout,
so **61% of it — 335 admin-only keys — ships to every anonymous storefront visitor** on
every navigation.

---

## 2. Frontend performance

### PERF-1 · The same two libraries are emitted four and two times over

**Severity: high · Confirmed by measurement.**

I hashed all 50 chunks: **no byte-identical duplicates**, but five groups of
same-size-different-content chunks. Identifying them by library signature:

| Library                         | Copies | Each (raw / gzip) |  Total gzip | Which routes                                                                          |
| ------------------------------- | -----: | ----------------- | ----------: | ------------------------------------------------------------------------------------- |
| `react-day-picker` + `date-fns` |  **4** | 152.5 / 47.2 KiB  | **189 KiB** | one copy for all admin routes, one for `/booking`, one for `/`, one for `/car/[slug]` |
| `zod`                           |  **2** | 285.8 / 63.1 KiB  | **126 KiB** | one for admin + `/booking`, one for `/login`                                          |

**That is 315 KiB gzip — 38% of all client JS in the app — spent on repeat copies of two
libraries.**

Because the copies are per-route-island rather than shared, they are **not cache-shared
across navigations**. A customer who lands on the home page, opens a vehicle, then goes to
`/booking` downloads **three separate 47 KiB copies of the same calendar library** — 141 KiB
gzip for one dependency. A staff member moving between the fleet editor and the calendar
downloads the admin copy once (good), but zod again if they sign in fresh.

**Recommendation.** This is a bundler-configuration problem, not a code problem. Configure a
shared vendor chunk (or verify Turbopack's chunking settings for cross-entry sharing) so
`react-day-picker`, `date-fns` and `zod` resolve to one cached chunk each. Measure before and
after with `next experimental-analyze`. Effort: small config change, medium verification.
**This is the single highest-leverage performance item in the audit.**

### PERF-2 · Every admin route eagerly loads the whole detail-drawer graph

**Severity: high · Confirmed.** The 211 KiB gzip floor and the sub-40 KiB spread across nine
admin routes are the evidence. `AdminShell` imports `ReservationDetailProvider`, which pulls
in the reservation, customer, vehicle, inspection, extension, image and drawer modules
([Phase 2 §2.2](docs/audit/PHASE-2-CODE-QUALITY.md)).

**There are zero dynamic imports in the entire application** — I checked; the only
`await import()` is in a test file.

**Recommendation.** Split the lightweight context/dispatcher from the drawer bodies (the
Phase 2 §2.2 structural fix), then `next/dynamic` the bodies. Do the split first as a
no-behaviour-change commit, measure, then lazy-load.

### PERF-3 · The fleet page renders three copies of the same list into the payload

**Severity: medium · Confirmed.**
[vehicles/page.tsx:211-237](<src/app/(dashboard)/admin/vehicles/page.tsx:211>) passes `grid`,
`list` and `compact` to `ViewSwitcher` as three fully-rendered element trees; the client
mounts one ([view-switcher.tsx:54-56](src/components/dashboard/view-switcher.tsx:54)). Two of
the three are the same component with a `dense` flag. At `perPage: 24` that is three
renderings of 24 vehicles in every RSC payload.

**Recommendation.** Move the view choice into a search param — which is what every other
admin list control already does — so the server renders only the requested view. This applies
an existing convention rather than adding one, and makes the choice shareable as a side
effect.

### PERF-4 · Images are optimised twice

**Severity: medium (cost) · Confirmed.** Cloudinary already normalises every upload to
1920×1080 via a signed `c_limit,h_1080,w_1920` transformation
([cloudinary/index.ts:16](src/lib/cloudinary/index.ts:16)). `next.config.ts` sets no custom
loader and no `unoptimized`, so **Vercel's image optimizer then processes every Cloudinary
image again**, billing optimisation units for work Cloudinary performs for free through URL
transforms.

**Recommendation.** Use a Cloudinary loader (`images.loader`) so `next/image` emits Cloudinary
transform URLs directly. Keeps `next/image`'s API and `sizes` behaviour, removes a whole
processing hop and its cost.

### PERF-5 · Two unnecessary client boundaries

`table.tsx` and `label.tsx` declare `"use client"` but contain no hooks, handlers or browser
APIs — pure markup. `AreaChart` became a client component solely to call `useI18n`, despite
its own comment describing it as server-rendered. Small, but each one pulls its subtree into
the client graph. _(Carried from Phase 2; unexecuted plan item.)_

---

## 3. Backend and query performance

### PERF-6 · `requireUser()` runs twice per admin render, uncached

**Severity: medium · Confirmed.** 25 guard call sites; the layout and the page each call it,
and it performs a real `User` lookup every time (deliberately — that is what makes
deactivation immediate). Not wrapped in React `cache()`.

**Recommendation.** `export const requireUser = cache(async () => { … })`. One line; removes
one query from every admin render and preserves the immediate-revocation property, since
`cache()` scopes to a single request.

### PERF-7 · `getDashboardData()` — 13 queries — is called by two different pages

**Severity: medium · Confirmed.** [calendar/page.tsx:55](<src/app/(dashboard)/admin/calendar/page.tsx:55>)
calls it alongside `getCalendarReservations` and `getReservationDateBounds`, making the
calendar the heaviest page in the app at **19 queries**, for panels that need a small subset
of what those 13 queries return.

It is also a 13-element `$transaction` **destructured positionally** — a maintenance hazard
independent of performance.

**Recommendation.** Extract the two or three figures the calendar's side panels actually need
into a narrow reader. Then split `getDashboardData` into named groups rather than one
positional array.

### PERF-8 · Three genuine N+1 loops, all in the image service

**Severity: medium · Confirmed.** I scanned for awaits inside loops and verified each hit by
reading it.

| Site                                                          | Pattern                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [image.service.ts:70-74](src/services/image.service.ts:70)    | per removed photo: `await deleteImage()` (Cloudinary HTTP) **then** `await prisma.vehicleImage.delete()` |
| [image.service.ts:76-101](src/services/image.service.ts:76)   | per photo: `await update()` or `await moveIntoVehicleFolder()` (Cloudinary HTTP) + `await create()`      |
| [image.service.ts:107-109](src/services/image.service.ts:107) | `deleteAllVehicleImages` — sequential Cloudinary deletes                                                 |

Replacing all 8 photos on a vehicle is therefore **up to 32 strictly sequential round
trips**, alternating between Cloudinary and Postgres, none parallelised.

**Dismissed as false positives** (my scanner flagged them; reading them clears them):
`analytics.service.ts:255` and `:304` are `.map()` calls that build an id array for a
**single** batched `findMany({ where: { id: { in: … } } })` — the correct pattern.
`inspection.service.ts:106` and `:131` sit _after_ a validation loop, and `:120` is a nested
Prisma `create` that inserts all photos in one statement.

**Recommendation.** `Promise.all` the independent Cloudinary calls and batch the DB writes
(`deleteMany`, `createMany`, and a single `updateMany`-per-order pass). Combine with the
Phase 3 HL-1 atomicity fix.

### PERF-9 · Three search queries cannot use an index, by construction

**Severity: medium now, high at scale · Confirmed.**

| Query                                                             | Shape                                                                                                                                                    | Indexable?                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [search.service.ts:31](src/services/search.service.ts:31)         | `contains` + `insensitive` → `ILIKE '%q%'` across vehicle(brand, model, plate), customer(firstName, lastName, email), **and reservation joined to both** | **No** — leading wildcard defeats btree                                                    |
| [vehicle.service.ts:118-119](src/services/vehicle.service.ts:118) | public fleet `?q=` on brand + model                                                                                                                      | **No**                                                                                     |
| [vehicle.service.ts:114](src/services/vehicle.service.ts:114)     | admin `brand: { equals, mode: "insensitive" }` → `lower(brand) = lower($1)`                                                                              | **No** — needs a functional index; none exists, and there is no plain `brand` index either |
| `getVehicleBrands()`                                              | `distinct: ["brand"]`                                                                                                                                    | full scan                                                                                  |

Every ⌘K keystroke past two characters triggers all three of the first query's variants,
debounced at 180 ms, against a pooler with one connection.

**Recommendation.** A `pg_trgm` GIN index on the searched columns turns `ILIKE '%q%'` into an
index scan, and `CREATE INDEX ON vehicles (lower(brand))` fixes the brand filter. Both are
migration-only changes with no application code impact.

---

## 4. Database and caching

### PERF-10 · Nothing in the application is cached, and one line is the reason

**Severity: high · Confirmed by the build output.** All **22 of 22 routes render dynamically**
— including `/contact`, which has no `force-dynamic` of its own. The cause is
`getI18n()` reading `cookies()` in the **root** layout
([i18n/server.ts:7](src/lib/i18n/server.ts:7)), which opts the entire tree out of static
rendering.

So the marketing home page, the fleet list and every vehicle detail page are rendered from
scratch, with database queries, for every anonymous visitor — and they share the single
pooled connection with staff sign-in.

**Recommendation.** This is an architectural decision, not a tweak, and it deserves an
explicit one. The options, in increasing order of work:

1. Accept it and add caching at the data layer instead (`unstable_cache`/`"use cache"` around
   `getPublicVehicles` and `getPublicVehicleBySlug`, revalidated by tag from the vehicle
   actions). Cheapest, keeps cookie-based locale.
2. Move the locale into the URL (`/sq/...`, `/en/...`), which is the conventional Next
   solution and makes the public site fully static/ISR-able. Larger change, best outcome.
3. Read the cookie lower in the tree so only the components that need it are dynamic.

Note the interaction with Phase 3 §6.4: because everything is dynamic and
`staleTimes.dynamic` defaults to 0, the uneven `revalidatePath` coverage is currently
harmless. **Any move toward caching makes that coverage load-bearing** — fix the
revalidation gaps in the same change.

### PERF-11 · Index coverage is otherwise good — with two dead indexes

Reservation query shapes are well served: `(vehicleId, pickupDate, returnDate)` supports both
the overlap checks and the public availability `NOT EXISTS` subquery; `(status, pickupDate)`
and `(status, returnDate)` serve the dashboard's upcoming lists; `createdAt` serves analytics.

Two indexes have no reader: `payments_status_idx` (the only payments query filters
`reservationId + provider + status` together, which the composite prefix already serves) and
the `reservations_status_idx` single-column index, shadowed by the two composites.
`rate_limits_expiresAt_idx` exists to support a cleanup sweep **that does not exist**.

---

## 5. What breaks first at 10×

The important distinction: **this application's first wall is concurrency, not data volume.**
It arrives with more _users_, not more rows.

### First — the connection pool (breaks with traffic, not data)

`DATABASE_URL` is documented as the pooled Supabase URL with **`connection_limit=1`**. Every
admin page render issues 11–19 queries, nothing is cached, and two public endpoints
(`/api/vehicles`, `/api/availability`) are unauthenticated and **unrate-limited**
([Phase 4 SEC-3](docs/audit/PHASE-4-SECURITY.md)).

At 10× concurrent usage the queue in front of that single connection is the bottleneck for
everything — including sign-in, which needs the same pool. **This is already the binding
constraint today**; more rows will not change it, and more staff will.

_Fixes, in order of value:_ raise `connection_limit` (the cheapest and most likely
misconfiguration — 1 is appropriate for a single serverless function, not for a pooled
deployment), cache the public reads (PERF-10), remove the duplicate guard query (PERF-6),
narrow the calendar's reader (PERF-7), and rate-limit the two open endpoints.

### Second — free-text search (breaks with rows)

Three `ILIKE '%q%'` sequential scans per ⌘K query, one of them joining reservations to both
vehicles and customers. Invisible at a few hundred rows; at 10× reservations it becomes the
slowest thing staff touch, and it runs on every debounced keystroke. _Fix: `pg_trgm` (PERF-9)._

### Third — analytics computed in application memory (breaks with rows)

`monthlySeries` and `dailySeries` `findMany` **six months of reservation rows** and bucket
them with a JS `filter`+`reduce` per bucket — O(rows × buckets). `getCustomerInsights`
`groupBy`s the whole reservations table by `customerId`. Correct at today's size; at 10× this
moves work that belongs in SQL into a serverless function's memory and onto the single
connection. _Fix: `date_trunc` + `GROUP BY` in SQL, or a materialised summary._

### Fourth — the calendar's DOM (breaks with fleet size)

The timeline renders **one `<button>` per vehicle per day**, each with a `t()`-computed
`aria-label`. `MAX_MONTHS = 14`, so the strip can span ~426 days:

| Fleet                           |   6-month span |       14-month span |
| ------------------------------- | -------------: | ------------------: |
| 44 vehicles (today's catalogue) | ~8,000 buttons | **~18,700 buttons** |
| 440 vehicles (10×)              |        ~80,000 |        **~187,000** |

Worth noting precisely: the file **already optimised the visual layer** — day dividers are a
single `repeating-linear-gradient` specifically "to avoid a node per cell", with the reasoning
in a comment. The interaction layer then reintroduces exactly that. _Fix: one click handler on
the row container using `offsetX / dayW` to derive the day index, replacing N buttons with
one — and keep a keyboard-accessible alternative._

### Fifth — `getVehicleBrands()`'s `distinct` scan

Trivial today, a full table scan forever. _Fix: it is a filter dropdown; cache it._

---

## 6. Current vs future vs premature

| Current problems (measurable today)                | Likely future problems         | **Premature — do not optimise**                                                                                      |
| -------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| PERF-1 duplicate library chunks (315 KiB gzip)     | Search ILIKE scans             | Splitting `vehicle-form.tsx` for size                                                                                |
| PERF-2 211 KiB gzip admin floor                    | Analytics in-memory bucketing  | Rewriting the login form to shed bundle weight                                                                       |
| PERF-10 zero caching, 22/22 dynamic                | Calendar DOM at 10× fleet      | Memoising components — React Compiler lint is on and there is no measured render problem                             |
| PERF-6 duplicate guard query                       | `getVehicleBrands` scan        | Replacing `date-fns` with a smaller library _(fix the duplication first — 4 copies is the problem, not the library)_ |
| PERF-8 32 sequential round trips on a gallery save | `rate_limits` unbounded growth | Adding Redis for rate limiting — the Postgres choice is documented and sound at this scale                           |
| PERF-3 triple fleet rendering                      |                                | Removing the two dead indexes — the write cost is negligible                                                         |
| PERF-4 double image optimisation                   |                                |                                                                                                                      |

---

## 7. Verified sound — do not change

1. **Image sizing is genuinely well done.** Every `fill` image carries an accurate `sizes`
   descriptor (`vehicle-card`, `vehicle-grid`, `car/[slug]`, `booking-form`, the drawers), the
   vehicle detail hero has `priority` for LCP, and fixed-size thumbnails use explicit
   `width`/`height`. This is better than most production apps.
2. **No whole-library imports.** Named imports throughout for lucide, date-fns, dnd-kit and
   Base UI; nothing defeats tree-shaking.
3. **`content-visibility: auto` with `contain-intrinsic-size`** on fleet cards, so off-screen
   cards skip layout without scroll jumps.
4. **The availability `NOT EXISTS` subquery is properly indexed** by
   `(vehicleId, pickupDate, returnDate)`.
5. **`Decimal` → `Number` in analytics is precision-safe** — I verified in Phase 3 that the
   float path agrees with `Decimal` to two decimal places even at 365 × 33.33. A previous
   pass flagged this; it is not a problem.
6. **The one `React.cache()` usage is correct** and is the model for PERF-6.
7. **The 180 ms search debounce and the 250 ms availability debounce** are sensibly chosen,
   and the availability widget correctly cancels stale responses.
8. **Postgres-backed rate limiting is the right call at this scale** — the reasoning is
   documented, and it is one atomic upsert. Do not add a cache vendor for it.
9. **Server-side date computation for the calendar** — the client receives pre-computed day
   labels, dates and month markers rather than doing date maths per cell.

---

## 8. Priority

1. **Raise `connection_limit`** — likely a one-character configuration fix for the binding
   constraint. Verify the current value first.
2. **PERF-1** — shared vendor chunk. 315 KiB gzip of pure duplication; config-level fix.
3. **PERF-10** — decide the caching architecture. The public site currently hits the database
   for every anonymous visitor.
4. **PERF-6** — wrap `requireUser` in `cache()`. One line, one query saved per admin render.
5. **PERF-9** — `pg_trgm` GIN + `lower(brand)` index. Migration only.
6. **PERF-7**, **PERF-3**, **PERF-8**, **PERF-4**.
7. **PERF-2** — the structural split, then lazy-load. Highest effort; do it after measuring
   the gain from PERF-1.

---

_End of Phase 6. No code was modified. Phase 7 (API / Backend / Data) has not begun._
