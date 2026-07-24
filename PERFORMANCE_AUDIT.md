# Alfa Rent performance audit

**Audit date:** 2026-07-24

**Baseline:** `design-rehaul` before performance optimization OPT-001

**Stack:** Next.js 16.2.10, React 19.2.4, Prisma 6.19.3

## Executive summary

Alfa Rent is functionally sound and uses several good platform primitives:
Server Components are the default, images use `next/image`, fonts use
`next/font`, expensive calendar grid lines are CSS rather than thousands of
cells, and public database projections explicitly exclude private fields.

The main performance constraint is the request/data layer. Every data-backed
public route is forced dynamic, the production-like local sample spends
1.2–2.3 seconds waiting for those routes, and there are no public loading
boundaries to provide an immediate navigational response. The fleet page also
serializes every image for every result, producing a 252 KB HTML/RSC response.
The largest interactive routes ship substantial client graphs: approximately
800 KB of raw, uncompressed build output for vehicle editing and 651 KB for
booking.

The app is not in a performance emergency, but its current architecture will
become visibly slower as reservations, repairs, and analytics history grow.
The highest-return work is selective caching/invalidation, smaller query
shapes, streamed route boundaries, query aggregation/indexing, and lazy
loading of interaction-heavy admin modules.

## Scores

| Area                 |        Score | Assessment                                                                                       |
| -------------------- | -----------: | ------------------------------------------------------------------------------------------------ |
| Overall              | **5.8 / 10** | Good foundations; data latency and route weight prevent a production-grade result                |
| Navigation           | **4.5 / 10** | Dynamic public pages are not fully prefetched and have no public loading boundary                |
| Rendering            | **6.5 / 10** | Server-first architecture is good; large result sets and effects raise rendering cost            |
| Hydration            | **5.5 / 10** | Most content stays server-side, but global/public and admin client roots are broader than needed |
| Bundle efficiency    | **4.5 / 10** | Heavy form, date, DnD, and admin graphs are eagerly reachable on several routes                  |
| Data fetching        | **4.0 / 10** | Dynamic reads, duplicate detail lookup, query fan-out, and JS aggregation dominate latency       |
| Images and fonts     | **7.0 / 10** | Correct image component and sizing; list query/serialization fetches too many images             |
| UX performance       | **6.0 / 10** | Solid responsive states and reduced-motion support; public waits are not surfaced                |
| Production readiness | **5.0 / 10** | Build/tests exist, but real-user performance telemetry and performance budgets do not            |

These scores describe the audited baseline, not a Lighthouse score. A browser
lab run against the deployed production region is still required for formal
Core Web Vitals.

## Evidence and measurements

### Production-mode route sample

Measured against `next start` on localhost with the configured remote
database. Timings include database/network distance and should be treated as a
comparative baseline, not universal end-user latency.

| Route                             | First response | Warm responses | HTML/RSC bytes | Cache behavior         |
| --------------------------------- | -------------: | -------------: | -------------: | ---------------------- |
| `/contact`                        |       46–48 ms |           3 ms |         29,191 | prerendered, cache hit |
| `/`                               |       2,314 ms | 1,202–1,387 ms |         93,721 | private, no-store      |
| `/car`                            |       1,420 ms | 1,280–1,307 ms |        251,781 | private, no-store      |
| `/booking`                        |       1,326 ms | 1,202–1,278 ms |         42,660 | private, no-store      |
| `/login`                          |          33 ms |         3–4 ms |         17,200 | static                 |
| `/car/mercedes-benz-e-class-2025` |       2,048 ms |   935–1,066 ms |  44,338–45,570 | private, no-store      |

The static routes demonstrate that application/server overhead is low. The
large difference on data-backed routes points to query/network work and
forced-dynamic rendering.

### Approximate route client graphs

These figures sum unique raw JavaScript files referenced by Next.js client
reference manifests. They are uncompressed build-output estimates, not
network transfer sizes.

| Route                        | Approx. raw client JS |
| ---------------------------- | --------------------: |
| Admin vehicle edit           |                799 KB |
| Admin vehicle create         |                795 KB |
| Booking                      |                651 KB |
| Admin vehicle list           |                457 KB |
| Login                        |                442 KB |
| Admin calendar               |                401 KB |
| Admin dashboard/reservations |                399 KB |
| Admin customers/analytics    |            386–389 KB |
| Home                         |                369 KB |
| Vehicle detail               |                330 KB |
| Fleet                        |                165 KB |
| Contact                      |                108 KB |

The values are useful for comparison and budgeting. Confirm transfer,
parse/compile, and main-thread costs with a deployment bundle analyzer and
browser trace.

## Findings

### Critical

No correctness-threatening performance defect was observed. The high-severity
items below should be completed before expecting consistently fast production
navigation under real traffic and growing data.

### High severity

#### H1 — Public inventory routes are always dynamic

`/`, `/car`, `/booking`, and `/car/[slug]` all use
`dynamic = "force-dynamic"`. Responses are private/no-store, so repeated
anonymous inventory reads repeatedly cross the application/database boundary.
Because the dynamic public routes have no `loading.tsx`, Next.js cannot
prefetch a useful shell for them.

- **Impact:** observed 1.2–2.3 s production-mode response latency
- **Estimated gain:** 0.8–1.3 s on cache hits, plus more immediate navigation
- **Effort:** medium
- **Risk:** medium; availability and pricing require explicit invalidation
- **Recommendation:** cache stable vehicle catalog data with tagged
  invalidation after vehicle/reservation changes; stream availability-specific
  content separately

#### H2 — Vehicle detail is queried twice per request

`generateMetadata()` and the page both call `loadVehicle(slug)`. ORM calls are
not automatically memoized like `fetch`, so a detail request performs the same
Prisma lookup twice.

- **Impact:** one unnecessary database round trip and duplicate serialization
  on every detail request
- **Estimated gain:** remove 50% of detail lookup calls; save roughly one
  database RTT
- **Effort:** very low
- **Risk:** very low
- **Recommendation:** request-scope memoize the loader with React `cache()`
- **Selected first increment:** OPT-001

#### H3 — Fleet list over-fetches image collections

The public list projection includes every image for up to 24 vehicles, even
though a card needs one cover image. This contributes to the 251,781-byte
`/car` response and amplifies database, serialization, RSC, and browser parse
work.

- **Impact:** oversized list query and route payload
- **Estimated gain:** likely 40–70% reduction in vehicle image records and a
  meaningful HTML/RSC reduction, depending on gallery depth
- **Effort:** low
- **Risk:** low
- **Recommendation:** use a list-specific projection with `take: 1`; keep the
  full image projection only for detail/edit views

#### H4 — Admin layout blocks all admin pages on operational queries

The admin layout awaits authentication, then pending-count and registration
alert queries before rendering its shell. These reads run across the admin
surface, including pages that also issue several page-specific queries.

- **Impact:** shared navigation latency and repeated database work
- **Estimated gain:** earlier shell render and two fewer blocking reads on
  paths that do not need live alerts
- **Effort:** medium
- **Risk:** medium; alert freshness and layout behavior must remain correct
- **Recommendation:** stream alert UI behind a Suspense boundary and consider
  short-lived/tagged caching where the operational freshness policy allows

#### H5 — Dashboard, calendar, and analytics query fan-out will scale poorly

Dashboard data performs many aggregate/list queries. Calendar first obtains
bounds and then fetches calendar data plus dashboard data. Analytics loads
raw reservation rows and repeatedly filters/buckets them in JavaScript.

- **Impact:** high database RTT count, growing memory/CPU cost, and slow admin
  transitions as history grows
- **Estimated gain:** 30–70% server time on affected pages at meaningful data
  volume
- **Effort:** medium to high
- **Risk:** medium; aggregation semantics must be regression-tested
- **Recommendation:** aggregate in SQL, query only displayed fields/ranges,
  remove unrelated dashboard work from calendar, and run independent reads in
  parallel from the start

#### H6 — Heavy client modules are present in initial route graphs

Vehicle forms include image upload/DnD and date-picker code. Booking includes
React Hook Form, Zod, date-picker/calendar code, and Base UI. The admin shell
eagerly includes command palette and reservation-detail infrastructure.

- **Impact:** more transfer, parse/compile, hydration, and memory, especially
  on mobile/admin hardware
- **Estimated gain:** 100–300 KB raw JS from targeted route graphs; exact
  transfer savings need analyzer verification
- **Effort:** medium
- **Risk:** medium; loading/focus behavior must remain accessible
- **Recommendation:** lazy load MediaGrid, command palette results/modal,
  reservation detail drawer, and non-visible date-picker internals at the
  interaction boundary

### Medium severity

#### M1 — Public routes lack streaming/loading states

Only the admin tree has `loading.tsx`. Slow public database reads hold the
previous page or blank transition without route-specific feedback.

- **Gain:** major perceived-performance improvement; no guaranteed server-time
  reduction
- **Effort/risk:** low / low

#### M2 — Persistent ambient effects add GPU and paint pressure

Two fixed 200vw × 200vh pseudo-elements use `blur(90px)`, `will-change:
transform`, and infinite 34/44-second animations. Glass surfaces add
18–40-pixel backdrop filters. Reduced-motion and reduced-transparency
fallbacks are present, which is good, but normal mode remains costly on
integrated GPUs.

- **Gain:** smoother scrolling and lower power usage on affected devices
- **Effort/risk:** low / low to medium (visual change)

#### M3 — Query indexes do not cover several common compound filters/sorts

Useful single/compound indexes exist for status, category, registration
expiry, repair date, and vehicle reservation ranges. Common status-plus-date
and created-at sort patterns are not covered, while case-insensitive
`contains` search cannot use ordinary B-tree indexes effectively.

- **Gain:** workload-dependent; potentially large once tables grow
- **Effort/risk:** medium / medium (migration and database-specific design)
- **Recommendation:** verify with production `EXPLAIN ANALYZE`, then add only
  proven composite/GIN-trigram indexes

#### M4 — Some service reads load unbounded history

Fleet profile loads all repairs and reduces them in JavaScript. Some dashboard
and analytics paths load raw records instead of database aggregates.

- **Gain:** lower server memory and bounded latency as history grows
- **Effort/risk:** medium / low to medium

#### M5 — Public header hydrates globally

The entire public header is a Client Component for pathname highlighting and
mobile-menu state. This is modest individually but appears on every public
route and pulls shared button/UI code into the client graph.

- **Gain:** small-to-medium reduction in global hydration
- **Effort/risk:** medium / low
- **Recommendation:** keep desktop navigation/server chrome static and isolate
  the mobile toggle/active marker into the smallest client island

#### M6 — No runtime performance telemetry or automated budgets

The repository has tests, lint, typecheck, and a production build, but no RUM
Core Web Vitals capture, server query timing, bundle budget, or route latency
gate.

- **Gain:** prevents silent regressions and makes prioritization evidence-based
- **Effort/risk:** medium / low

### Low severity

#### L1 — Unused production dependencies

No source usage was found for `@tanstack/react-query` or `framer-motion`.
`next-themes` and `sonner` appear reachable only through an unused toaster
wrapper. Tree shaking should keep these out of active routes, so this is mainly
install size, audit surface, and maintenance noise.

#### L2 — Font scope can be reviewed

Two variable Geist families are globally configured. Font output is relatively
small, but mono is used selectively and may not need global preload/scope.
Measure before changing; this is not a current bottleneck.

#### L3 — Image thumbnails use a coarse `15vw` size hint

The hint is acceptable on desktop but can over-request on some viewport/grid
combinations. A more exact responsive `sizes` expression is a minor follow-up.

## Positive observations

- Server Components are used by default; client boundaries are explicit.
- `next/image` is used with `fill`/`sizes`, and the main detail image is
  correctly prioritized.
- `next/font` avoids third-party font requests and layout-shift-prone loading.
- Public vehicle data uses an explicit allowlist rather than exposing the
  complete Prisma model.
- Independent reads are already parallelized in several page/service paths.
- Calendar day separators use one repeating gradient instead of an
  O(vehicles × days) background-cell DOM.
- Motion/transparency accessibility fallbacks are present.
- Contact/login/static behavior demonstrates that Next.js prerendering and
  caching work when routes permit it.

## Prioritized roadmap

| Order | Work item                                                 | Expected gain                      | Effort | Risk     |
| ----: | --------------------------------------------------------- | ---------------------------------- | ------ | -------- |
|     1 | OPT-001 request-dedupe vehicle detail loader              | One fewer DB lookup/detail request | XS     | Very low |
|     2 | Add list-specific vehicle projection (`images.take = 1`)  | Smaller query and `/car` payload   | S      | Low      |
|     3 | Add public loading/streaming boundaries                   | Faster perceived navigation        | S      | Low      |
|     4 | Design tagged catalog cache + mutation invalidation       | Sub-second cache-hit public TTFB   | M      | Medium   |
|     5 | Stream/defer admin alerts from shared layout              | Earlier admin shell                | M      | Medium   |
|     6 | Lazy load heavy admin/form interaction islands            | Lower JS/hydration cost            | M      | Medium   |
|     7 | Replace analytics/dashboard raw scans with SQL aggregates | Bounded server work                | M–L    | Medium   |
|     8 | Profile and add proven database indexes                   | Lower query latency at scale       | M      | Medium   |
|     9 | Reduce ambient blur/animation cost                        | Better scroll smoothness/power     | S      | Low      |
|    10 | Add Web Vitals, query timing, and bundle/latency budgets  | Regression prevention              | M      | Low      |

## OPT-001 acceptance criteria

This audit intentionally selects only one implementation increment:

1. The vehicle detail loader is memoized only for the current server request.
2. Metadata and page rendering receive the same vehicle object for the same
   slug without changing cache freshness across requests.
3. UI, routing, not-found behavior, and business rules are unchanged.
4. Lint, typecheck, tests, and production build pass.
5. The production-mode detail route is remeasured after the build.

## OPT-001 implementation result

The route-local vehicle loader now uses React `cache()`. This is
request-scoped memoization: metadata generation and page rendering can reuse
the same resolved lookup for an identical slug, while a later request still
reads current database state.

- **Scope:** one import and one loader wrapper; no UI or business-rule changes
- **Expected database effect:** duplicate same-request detail reads collapse
  to one resolved lookup
- **Pre-change sample:** 2,048 ms first response; 935, 1,024, and 1,066 ms
  subsequent responses (1,024 ms warm median)
- **Post-change sample:** 2,282 ms first response; 999, 1,043, and 1,049 ms
  subsequent responses (1,043 ms warm median)
- **Observed latency result:** no statistically meaningful TTFB improvement
  in this small remote-database sample; the approximately 2% median difference
  is ordinary run-to-run variance
- **Verification:** ESLint passed, TypeScript passed, 40/40 tests passed, and
  the Next.js production build passed

The change is retained because it removes redundant request work with very
low complexity and no freshness tradeoff. It must not be described as a
measured latency win. Add Prisma/query telemetry before using query-count or
TTFB savings as a production KPI.

## Measurement limitations

- Timings were collected locally against the configured remote database, not
  from the deployment region or a throttled field device.
- Raw route JavaScript figures are comparative estimates, not gzip/Brotli
  transfer or executed-code measurements.
- No production database query plan or production traffic distribution was
  available; index gains are therefore hypotheses requiring `EXPLAIN ANALYZE`.
- Formal LCP, INP, CLS, long-task, memory, and energy measurements should be
  captured from a deployed build and real devices after the first roadmap
  steps.
