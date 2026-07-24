# Alfa Rent a Car — Production Readiness Audit

Audit date: 24 July 2026

Scope: current working tree, including the five pre-existing uncommitted UI changes

Method: source/config/schema review, Next.js 16 local documentation, lint, TypeScript,
unit tests, production build, and browser checks at 1440×900, 1280×720, 375×667,
and 320×568.

The original audit was read-only. Remediation began afterward; the status below
records changes in the current working tree. No production data or external
provider configuration was modified.

## Remediation Status — Batch 1

Updated: 24 July 2026

| Finding / backlog item                      | Status                               | Remediation                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 / SEC-002 — bootstrap credentials        | **Code fixed; operator action open** | Removed documented/default passwords. Destructive seed now requires an exact wipe acknowledgement and two distinct 16+ character passwords before any deletion. Existing staff credentials must still be reset/revoked and MFA remains open. |
| H1 / SEC-003 — public vehicle data boundary | **Fixed in code**                    | All website vehicle reads now use explicit public list/detail DTOs; public cards no longer render registration plates. Architecture tests prevent privileged readers and plate rendering from returning to public pages.                     |
| H7 / DATA-003 — bookable vehicle states     | **Fixed in code**                    | One shared public-status policy permits `AVAILABLE` and date-checked `RENTED` vehicles while excluding `SERVICE` and `INACTIVE` from list, detail, availability, and booking creation paths.                                                 |
| L1 / NEXT-001 — deprecated middleware       | **Fixed in code**                    | Migrated `src/middleware.ts` to the installed Next.js 16 `src/proxy.ts` convention.                                                                                                                                                          |
| SEC-006 — baseline security headers         | **Partially fixed**                  | Added anti-framing, MIME-sniffing, referrer, permissions, cross-origin opener, partial CSP, and production HSTS headers. A strict nonce/hash CSP should follow only with the required dynamic-rendering and third-party-resource review.     |

Batch 1 verification: Prettier pass, ESLint pass, TypeScript pass, 7 test files
and 40 tests pass, optimized Next.js production build pass.

## Executive Summary

| Area                  |      Score |
| --------------------- | ---------: |
| Overall project score | **5.5/10** |
| Production readiness  |   **4/10** |
| Security              |   **3/10** |
| Architecture          |   **7/10** |
| Performance           |   **5/10** |
| Maintainability       | **6.5/10** |
| UX                    |   **7/10** |
| Accessibility         | **5.5/10** |
| Code quality          | **6.5/10** |

The project is substantially better than a prototype. It has a coherent service
layer, strict TypeScript, thin route handlers, server-side authorization checks on
mutations, Zod validation, safe Prisma parameterization, a database-enforced
double-booking constraint, a public response allowlist, consistent API envelopes,
rate limiting, error boundaries, responsive layouts, and a clean automated
baseline. Lint and type checking pass, all 40 tests pass, and the optimized build
succeeds.

It is **not ready for enterprise production**. At audit time, a
repository-documented bootstrap administrator credential successfully
authenticated against the database configured for this build. The repository
default/documentation and unsafe seed behavior are now fixed, but the existing
account must still be reset or disabled and its sessions revoked by an authorized
operator. The handoff also records prior disclosure of production database and
signing secrets; until rotation is independently verified, they must be treated as
compromised. The public DTO, plate-exposure, and bookable-state findings are fixed
in the current working tree.

The next tier of risk is operational and transactional: long-lived JWTs have no
revocation path, state transitions can race, database and Cloudinary mutations are
not atomic or reconciled, there is no durable audit trail, there is no production
error/trace reporting, and the test suite does not exercise auth, APIs, Server
Actions, migrations, browser flows, or concurrency.

### Release decision

**NO-GO for a real customer/staff launch.** Complete Phase 1 below, add minimum
integration/E2E coverage, and prove backup/restore and observability before launch.

### Verification summary

- `npm run lint`: pass
- `npm run typecheck`: pass
- `npm test`: pass — 7 files, 40 tests
- `npm run build`: pass when Google Fonts is reachable
- Next.js 16 request boundary: migrated to `proxy.ts`; no deprecation warning
- Dependency CVE audit: **not verified**. Running `npm audit` would disclose this
  private project's complete dependency inventory to the public npm registry and
  was not authorized.
- Browser console: no warnings/errors on the inspected dashboard state
- Horizontal overflow: none on representative public pages; admin calendar leaks
  whole-page horizontal overflow at 320px (367px document width)

## What Is Good — and Why

1. **The database is the final authority for double-booking.** The GiST exclusion
   constraint in `20260715060451_reservation_no_overlap/migration.sql` prevents two
   `CONFIRMED`/`ACTIVE` reservations from overlapping even under concurrency.
   This is materially stronger than an application-only availability check.

2. **Mutation boundaries authenticate and authorize.** Vehicle actions require
   `ADMIN`; reservation/calendar actions require `EMPLOYEE` (with `ADMIN` allowed
   to pass). The admin layout also gates rendering. This follows the Next.js 16
   rule that every Server Action is a directly reachable endpoint.

3. **Public API serialization is explicit.** `publicVehicleSelect` is an allowlist
   and the test guards sensitive additions. The flaw is that public pages bypass
   this path, not that the API design itself is careless.

4. **Input validation and error responses are consistent.** Zod schemas sit at
   route/action boundaries; API responses use one success/failure envelope; raw
   Prisma and unexpected error details are not returned to callers.

5. **SQL injection and ordinary XSS exposure are low.** Prisma is used throughout,
   the one raw query is parameterized with Prisma's tagged template, React escapes
   rendered customer content, and there is no `dangerouslySetInnerHTML`.

6. **Password verification is thoughtful.** Passwords are bcrypt hashes; unknown
   users still trigger a dummy compare; login errors are generic; rate limiting is
   shared through PostgreSQL rather than process memory.

7. **UI foundations are coherent.** Route groups separate the website and admin
   products; Server Components are the default; interactive boundaries are
   reasonably scoped; shared primitives, status tokens, reduced-motion support,
   reduced-transparency fallbacks, loading states, empty states, error boundaries,
   confirmation dialogs, and a consistent visual system are present.

8. **Forms have several good details.** Labels and autocomplete exist, submit
   buttons expose pending states, booking focuses the first invalid field, dates
   use one reusable calendar implementation, server validation repeats client
   validation, and the upload UI validates format/size and reports per-file errors.

9. **Developer baseline is healthy.** Strict TypeScript, ESLint Core Web Vitals,
   Prettier/lint-staged, Husky, deterministic lockfile, CI, migrations, an
   environment template, and substantive architectural documentation all exist.

## Critical Issues

### C1 — Bootstrap administrator credentials remain valid

- **Remediation status:** Repository/default-password safeguards implemented;
  existing account reset, revocation, and MFA remain operator actions.
- **Severity:** Critical
- **Why it matters:** Anyone with repository/chat access can obtain administrator
  access to customer PII, reservations, fleet records, costs, and destructive
  actions. This is broken authentication and immediately exploitable.
- **Where:** `HANDOFF.md:20-23`, `prisma/seed.ts:565`; verified through the login UI
  against the database configured in the current environment.
- **How to fix:** Immediately change every seeded staff password; disable/delete
  demo accounts in production; remove credentials from documentation and history;
  require an out-of-band first-login reset; add MFA for administrators; add a
  production seed guard that refuses destructive/demo seeding; review auth logs
  for access using the known credential.
- **Difficulty:** Medium
- **Impact:** Very high — closes a direct administrative takeover path.

### C2 — Production secrets are recorded as previously disclosed

- **Severity:** Critical until rotation is proven
- **Why it matters:** A leaked database password, service-role credential, JWT
  signing secret, or Auth secret can enable data theft, database mutation, or
  session forgery. Removing text later does not invalidate a copied secret.
- **Where:** `HANDOFF.md:99-118` records the disclosure and says the local
  environment points to production.
- **How to fix:** Rotate Supabase database credentials, service-role key, JWT
  secret, Auth.js secret, Cloudinary secret, and any derived tokens; revoke old
  sessions; inspect provider audit logs; record rotation evidence in a private
  incident ticket, not the repository; enable secret scanning and push protection.
- **Difficulty:** Medium
- **Impact:** Very high — restores trust in every security boundary that depends
  on these secrets.

## High Priority Issues

### H1 — Public pages bypass the safe DTO and expose plates/internal vehicle state

- **Remediation status:** Fixed in the current working tree.
- **Severity:** High
- **Why it matters:** The code explicitly classifies plates, registration dates,
  and running costs as internal, yet the public homepage and fleet render plates.
  The broad read also makes future sensitive-field leakage easier and allows known
  slugs for retired vehicles to resolve.
- **Where:** `src/app/(website)/page.tsx:11,94`,
  `src/app/(website)/car/page.tsx:3,24`,
  `src/app/(website)/booking/page.tsx:2,20`,
  `src/app/(website)/car/[slug]/page.tsx:12,19-22`,
  `src/components/shared/vehicle-card.tsx:67-70`,
  `src/services/vehicle.service.ts:22-55,128-172`.
- **How to fix:** Create public-only list/detail DTO functions and make every
  website page use them; exclude `INACTIVE` and policy-defined off-road states;
  remove plates from public cards; add page/RSC integration tests, not only a
  service allowlist test.
- **Difficulty:** Medium
- **Impact:** High — closes real information exposure and prevents future
  accidental leaks.

### H2 — JWT sessions cannot be promptly revoked and roles become stale

- **Severity:** High
- **Why it matters:** Auth.js uses stateless JWT sessions and stores the role in
  the token only at sign-in. Deleting a user, demoting an admin, or responding to a
  compromised account does not invalidate an already-issued token until expiry.
  The `User` model has no active/disabled flag, session version, or last-password-
  change marker.
- **Where:** `src/lib/auth/config.ts:13-32`, `src/lib/auth/guards.ts:11-23`,
  `prisma/schema.prisma:52-62`.
- **How to fix:** Use short-lived sessions plus server-side session records, or
  validate `user.id`, `active`, `role`, and `sessionVersion` in a cached DAL on
  sensitive requests; increment the version on password/role changes; expose an
  admin session-revocation workflow; add MFA.
- **Difficulty:** High
- **Impact:** High — makes offboarding and incident response effective.

### H3 — Reservation state transitions have a read/update race

- **Severity:** High
- **Why it matters:** Two staff actions can read the same old status, both pass the
  transition table, then apply conflicting transitions; the last write wins. The
  overlap constraint protects vehicle dates, not workflow history.
- **Where:** `src/services/reservation.service.ts:210-227`.
- **How to fix:** Use a conditional `updateMany` with both `id` and expected
  current status, or lock the row inside a transaction; reject when the affected
  row count is zero; record actor, prior state, new state, timestamp, and reason in
  an immutable audit event.
- **Difficulty:** Medium
- **Impact:** High — prevents lost updates and untraceable booking decisions.

### H4 — Vehicle/gallery operations claim atomic intent but can partially commit

- **Severity:** High
- **Why it matters:** Vehicle creation/update and image synchronization are
  separate operations. A Cloudinary or later database failure can leave a created
  vehicle without its intended images, partially reordered/deleted galleries,
  missing remote assets referenced by rows, or orphaned uploads. Retrying create
  can then hit a slug conflict.
- **Where:** `src/app/(dashboard)/admin/vehicles/actions.ts:85-117`,
  `src/services/image.service.ts:27-110`,
  `src/services/vehicle.service.ts:200-227`.
- **How to fix:** Model media changes as a durable workflow: commit intended DB
  state transactionally, enqueue outbox jobs for Cloudinary move/delete, make jobs
  idempotent, retain old assets until commit, and add reconciliation/sweeper jobs.
  At minimum, wrap all DB-only image changes in one transaction and compensate a
  newly created vehicle if synchronization fails.
- **Difficulty:** High
- **Impact:** High — protects fleet/catalog integrity during ordinary failures.

### H5 — No durable security or operational audit log

- **Severity:** High
- **Why it matters:** The application handles staff authentication, PII, booking
  approval, prices, repairs, and destructive fleet operations. There is no answer
  to “who changed what, when, from where?” after fraud, error, or compromise.
- **Where:** schema and all Server Actions; only generic `console.error` exists at
  `src/lib/errors.ts:119`.
- **How to fix:** Add append-only audit events with actor/session, action, entity,
  before/after or structured diff, request/correlation ID, IP provenance, and
  timestamp; protect retention and access; log sign-in success/failure/rate-limit
  events without passwords or sensitive payloads.
- **Difficulty:** High
- **Impact:** High — enables accountability, incident response, and compliance.

### H6 — No production observability

- **Severity:** High
- **Why it matters:** Production failures are written to ephemeral console output.
  There are no structured logs, error aggregation, traces, latency/error-rate
  metrics, alert thresholds, or correlation from UI error digests to backend
  requests.
- **Where:** `src/lib/errors.ts:119`, route error boundaries, deployment docs.
- **How to fix:** Add structured JSON logging with request IDs; integrate error
  reporting and OpenTelemetry; track auth failures, 4xx/5xx, booking conversion,
  DB latency/pool saturation, Cloudinary failures, and job backlog; define alerts
  and an on-call/runbook.
- **Difficulty:** Medium
- **Impact:** High — makes production failures detectable and diagnosable.

### H7 — Public availability includes states that the code calls “off-road”

- **Remediation status:** Fixed in the current working tree.
- **Severity:** High (business correctness)
- **Why it matters:** Public listing and availability reject only `INACTIVE`.
  `SERVICE` vehicles can be shown and requested; `RENTED` handling relies only on
  reservations being perfectly synchronized. This can create promises the
  business cannot fulfill.
- **Where:** `src/services/vehicle.service.ts:92-125,230-257`,
  `src/services/reservation.service.ts:39-59,91-115`.
- **How to fix:** Define one explicit `PUBLIC_BOOKABLE_STATUSES` policy and enforce
  it in list, detail, availability, quote, and create paths; decide whether service
  has a date range rather than a single status; enforce state invariants in tests.
- **Difficulty:** Medium
- **Impact:** High — prevents bookings for unavailable vehicles.

### H8 — Core security and business paths have no integration/E2E coverage

- **Severity:** High
- **Why it matters:** Five test files cover pure date/price logic, validation, rate
  limiting, and a public field allowlist, but not authentication, RBAC, APIs,
  Server Actions, Cloudinary reconciliation, migrations, status races, or the real
  booking flow. A green CI run therefore does not prove release safety.
- **Where:** `vitest.config.ts:4-10`; now 40 tests across 7 files, including new
  seed-safety and static public-boundary coverage, but still no database-backed or
  browser integration coverage for the listed paths.
- **How to fix:** Add PostgreSQL-backed integration tests for migrations,
  constraints, auth/RBAC, route handlers, and concurrency; Playwright E2E for
  anonymous booking and staff workflows; axe accessibility checks; failure-path
  tests for DB/network/Cloudinary; coverage thresholds focused on risk.
- **Difficulty:** High
- **Impact:** High — prevents regressions in the paths that matter.

### H9 — Contact and confirmation promises are not production-real

- **Severity:** High (release/UX)
- **Why it matters:** The UI says customers will be confirmed by email, but no
  email service or notification job exists. Contact phone/email are placeholders.
  Customers can submit PII and receive only an on-screen reference that staff must
  manually discover.
- **Where:** `src/components/forms/booking-form.tsx:104-129`,
  `src/app/(website)/contact/page.tsx:10-30`,
  `src/components/shared/site-footer.tsx`.
- **How to fix:** Replace placeholder business data; implement transactional
  customer/staff notifications through a durable job/outbox; include retry,
  delivery status, templates, and non-email fallback; change copy until the
  mechanism is operational.
- **Difficulty:** Medium
- **Impact:** High — prevents broken customer expectations and lost bookings.

## Medium Priority Issues

### M1 — Rate-limit identity and failure behavior are not robust

- **Severity:** Medium
- **Why it matters:** The left-most `x-forwarded-for` value is trusted without an
  explicit trusted-proxy contract; in non-Vercel deployments it may be spoofable.
  Missing headers collapse all callers into `unknown`. Comments say limiter faults
  fail open, but database exceptions are not caught and will fail booking/login.
  PostgreSQL also receives a write for every attempt, competing with core traffic.
- **Where:** `src/lib/rate-limit.ts:23-84`, `src/lib/auth/index.ts:28-49`,
  `src/app/api/bookings/route.ts:17-30`.
- **How to fix:** Derive IP only from platform-authenticated headers; configure
  proxy trust; use layered IP+account/device limits; decide and implement explicit
  fail-open/fail-closed policy; isolate counters in Redis/KV at scale; sweep via a
  scheduled job and monitor it.
- **Difficulty:** Medium
- **Impact:** Medium-high — improves abuse resistance and availability.

### M2 — Query fan-out, missing caching, and single-connection guidance limit scale

- **Severity:** Medium
- **Why it matters:** The dashboard issues 12 queries in one transaction and the
  layout adds more on every navigation. Analytics runs additional groupings and
  reads. Nearly every data page is forced dynamic; documentation recommends a
  pool connection limit of one. Latency and pool contention will rise well before
  10,000 active users.
- **Where:** `src/services/analytics.service.ts:49-169,366-410`,
  `src/app/(dashboard)/admin/layout.tsx:19-23`, force-dynamic page exports,
  `README.md:108-125`.
- **How to fix:** Measure first with query tracing; remove redundant layout/page
  reads; cache stable public fleet/detail DTOs with tag invalidation; pre-aggregate
  analytics; cap pending queues; tune pool size with Supabase/Vercel guidance;
  load slow panels independently with Suspense.
- **Difficulty:** High
- **Impact:** High at growth; moderate today.

### M3 — Analytics reads and buckets raw rows in application memory

- **Severity:** Medium
- **Why it matters:** Time-series queries load every matching reservation and
  repeatedly filter arrays per bucket. Annual/multi-year growth makes memory and
  response time proportional to history.
- **Where:** `src/services/analytics.service.ts:19-47,349-410`.
- **How to fix:** Aggregate with PostgreSQL `date_trunc`/generated reporting views,
  return only buckets, add matching date/status indexes, and cache reporting
  results for a short interval.
- **Difficulty:** Medium
- **Impact:** High at large datasets.

### M4 — Database indexes do not match important query shapes

- **Severity:** Medium
- **Why it matters:** `createdAt` is used throughout dashboard/analytics but is not
  indexed. Status plus pickup/return windows, brand filtering, and pending queue
  ordering also lack composite support.
- **Where:** `prisma/schema.prisma:102-105,171-174`; analytics/dashboard,
  registration, and reservation queries.
- **How to fix:** Confirm with `EXPLAIN (ANALYZE, BUFFERS)` on production-shaped
  data, then add targeted indexes such as reservation `createdAt`, partial/open
  status + date indexes, pending status + createdAt, and normalized brand. Avoid
  speculative indexes without measurements.
- **Difficulty:** Medium
- **Impact:** High at 100k+ reservations.

### M5 — Important database invariants exist only in Zod

- **Severity:** Medium
- **Why it matters:** Direct SQL, migrations, scripts, or future services can
  write negative money, invalid seats/years, reverse date ranges, invalid
  registration/service chronology, or negative counters. Enterprise data must
  defend itself.
- **Where:** `prisma/schema.prisma`; only overlap and relational constraints are
  enforced in SQL.
- **How to fix:** Add check constraints for positive money/counts, return after
  pickup, registration expiry after registration date, and sane vehicle fields;
  add a uniqueness policy for image `publicId`; use a migration with validation
  against existing data.
- **Difficulty:** Medium
- **Impact:** High for long-term data quality.

### M6 — Timezone semantics are ambiguous and hard-coded

- **Severity:** Medium
- **Why it matters:** Forms append `T10:00:00Z` while the database stores
  timestamp-without-time-zone. Kosovo local time changes with DST, so the same
  literal does not consistently mean 10:00 local. Availability and billing depend
  on exact half-open boundaries.
- **Where:** `src/components/forms/booking-form.tsx:85-86`,
  `src/components/forms/availability-widget.tsx:54-56`,
  `src/components/dashboard/calendar-timeline.tsx:421-426`,
  `prisma/schema.prisma:160-161`.
- **How to fix:** Decide whether the domain stores date-only rentals or instants.
  For instants, store `timestamptz` and an IANA zone (`Europe/Belgrade` or the
  business-approved Kosovo zone) and convert at boundaries. For date-only, use
  PostgreSQL `date` plus separate pickup/return local-time fields.
- **Difficulty:** High
- **Impact:** High — prevents off-by-hours/day and overlap errors.

### M7 — Slugs collide and edits break public URLs

- **Severity:** Medium
- **Why it matters:** Slug = brand/model/year, so legitimate duplicate vehicles
  collide. Editing those fields changes the URL without redirect history, breaking
  shared links and indexing.
- **Where:** `src/services/vehicle.service.ts:57-62,175-197`.
- **How to fix:** Use a stable public ID or collision-safe slug suffix; preserve
  slug on ordinary edits; add a slug-history/redirect table if human-readable URLs
  must change; return a field-specific conflict message.
- **Difficulty:** Medium
- **Impact:** Medium-high.

### M8 — Customer creation and reservation creation are not one transaction

- **Severity:** Medium
- **Why it matters:** Public booking creates/fetches the customer before entering
  the reservation transaction. A later vehicle/booking failure can leave an
  orphan customer; the manual path correctly avoids this.
- **Where:** `src/services/reservation.service.ts:81-117`,
  `src/services/customer.service.ts:25-45`.
- **How to fix:** Pass the transaction client into a transaction-aware
  find-or-create helper and create both records atomically; retain race handling.
- **Difficulty:** Medium
- **Impact:** Medium — improves PII cleanliness and retry behavior.

### M9 — Form accessibility metadata is incomplete

- **Severity:** Medium
- **Why it matters:** Booking validation focuses the first invalid field, but
  fields do not get `aria-invalid`, errors have no IDs/`aria-describedby`, and
  inline errors are not announced. Screen-reader users may not know what failed.
- **Where:** `src/components/forms/booking-form.tsx:134-258`,
  `src/components/forms/login-form.tsx:33-63`; verified in browser.
- **How to fix:** Generate stable error IDs, connect them with
  `aria-describedby`, set `aria-invalid`, announce a validation summary, and test
  with axe plus keyboard/screen-reader smoke checks.
- **Difficulty:** Low-medium
- **Impact:** Medium-high for accessibility.

### M10 — Booking network failures are not handled

- **Severity:** Medium
- **Why it matters:** `fetch()` and `res.json()` are outside a `try/catch`. Offline,
  timeout, proxy HTML, or transient 5xx responses can produce an unhandled promise
  and no actionable user feedback. There is no timeout or safe retry guidance.
- **Where:** `src/components/forms/booking-form.tsx:78-102`.
- **How to fix:** Catch network/parse failures, preserve entered values, provide a
  retryable error and phone fallback, use an abort timeout, and make submissions
  idempotent to prevent duplicates after uncertain responses.
- **Difficulty:** Low
- **Impact:** Medium-high for conversion and duplicate prevention.

### M11 — Admin booking modal is not an accessible modal

- **Severity:** Medium
- **Why it matters:** It lacks `role="dialog"`, `aria-modal`, an accessible title
  relationship, focus trapping/restoration, and background inerting. Keyboard and
  assistive-technology users can escape into the page underneath.
- **Where:** `src/components/dashboard/calendar-timeline.tsx:394-570`.
- **How to fix:** Reuse the existing dialog primitive or the shared focus-trap
  pattern; label the dialog, trap/restore focus, close on Escape, make background
  inert, and prevent body scroll.
- **Difficulty:** Medium
- **Impact:** Medium-high.

### M12 — Small-phone calendar leaks page-level horizontal overflow

- **Severity:** Medium
- **Why it matters:** The calendar should scroll inside its own viewport, but at
  320px the document becomes 367px wide. This causes page wobble and can hide
  controls. Its timeline interaction also depends heavily on pointer click and
  double-click.
- **Where:** `src/components/dashboard/calendar-timeline.tsx:149-381`; verified at
  320×568.
- **How to fix:** Add `min-w-0`/bounded width to the toolbar and containing grid,
  ensure only the timeline scroller owns overflow, reduce or stack the zoom/month
  controls, and give rental bars a keyboard-accessible “open details” action.
- **Difficulty:** Medium
- **Impact:** Medium.

### M13 — Touch targets are frequently smaller than 44×44 CSS pixels

- **Severity:** Medium-low
- **Why it matters:** The mobile menu control rendered at 24×24; dashboard menu,
  dismiss, footer links, card detail links, and several icon buttons are also
  smaller than the recommended touch target. This increases input errors.
- **Where:** `src/components/shared/site-header.tsx:62-70` and multiple compact
  admin controls; verified in browser.
- **How to fix:** Preserve visual icon size while expanding clickable padding/min
  dimensions; test at 320/375px with coarse pointer.
- **Difficulty:** Low
- **Impact:** Medium.

### M14 — Environment validation and deployment safety are incomplete

- **Severity:** Medium
- **Why it matters:** Required secrets use non-null assertions and are not checked
  at startup. The build depends on live Google Fonts. Every Vercel build executes
  database migrations, coupling schema mutation to preview/retry/concurrent builds.
- **Where:** `src/lib/cloudinary/index.ts:63-98`, `src/app/layout.tsx:1-25`,
  `package.json` `vercel-build`, `README.md:123-126`.
- **How to fix:** Parse environment through a server-only Zod module; vendor fonts
  with `next/font/local`; run migrations once in a controlled release job against
  production only; use backward-compatible expand/migrate/contract changes and
  deployment locks.
- **Difficulty:** Medium
- **Impact:** Medium-high.

### M15 — No privacy/retention workflow for customer PII

- **Severity:** Medium (legal impact may be high)
- **Why it matters:** Names, email, phone, notes, booking history, and staff search
  are retained indefinitely. There is no privacy notice/consent link, retention
  schedule, export/deletion/anonymization workflow, or documented access policy.
- **Where:** booking UI, `Customer`/`Reservation` schema, admin search/detail.
- **How to fix:** Obtain jurisdiction-specific legal review; publish a privacy
  notice; minimize fields; define retention; add subject export/anonymization;
  redact logs; restrict and audit PII access; test backups and replicas against the
  same policy.
- **Difficulty:** High
- **Impact:** High for compliance and trust.

### M16 — No health checks, recovery proof, or operational runbooks

- **Severity:** Medium
- **Why it matters:** Deployment docs cover setup but not readiness/liveness,
  backup schedules, point-in-time recovery, restore tests, RPO/RTO, rollback,
  migration failure, provider outage, or credential compromise.
- **Where:** `README.md:103-139`; no health endpoint or operations directory.
- **How to fix:** Add shallow liveness and authenticated/dependency readiness,
  define runbooks, enable PITR, perform recurring restore drills, document RPO/RTO,
  and test rollback for code plus schema.
- **Difficulty:** Medium
- **Impact:** High during incidents.

### M17 — Service functions are not a self-enforcing DAL

- **Severity:** Medium
- **Why it matters:** Authorization is in pages/actions, not in the data/service
  layer. A future route can call an internal service directly and expose full
  records. Next.js 16 recommends a server-only DAL that authorizes and returns
  minimal DTOs.
- **Where:** `src/services/*`, particularly full vehicle/customer detail reads.
- **How to fix:** Mark server modules with `server-only`; split public DTO reads
  from authorized admin DAL functions; put authorization close to sensitive reads;
  return minimal transport types rather than Prisma models.
- **Difficulty:** High
- **Impact:** Medium-high — reduces future access-control mistakes.

## Low Priority Issues

### L1 — Deprecated Next.js 16 middleware convention

- **Remediation status:** Fixed in the current working tree.
- **Why it matters:** It already emits a build warning and will become a migration
  burden.
- **Where:** `src/middleware.ts`.
- **How to fix:** Rename/migrate to root `proxy.ts` following the installed
  Next.js 16 proxy guide and add a proxy test.
- **Difficulty:** Low
- **Impact:** Low now, medium later.

### L2 — Dead code, dependencies, and duplicated formatters

- **Why it matters:** Unused packages enlarge maintenance/CVE surface; stale code
  misleads maintainers; duplicated money formatting drifts by locale/precision.
- **Where:** unused `@tanstack/react-query`, `framer-motion`, and likely Sonner/
  theme path; dead `src/services/dashboard.service.ts`; unused
  `getFleetCostSummary`, `cancelReservation`, `sweepRateLimits`; four `eur`
  implementations.
- **How to fix:** Confirm with dependency/import analysis, remove unused code and
  packages, or wire intentionally; centralize `Intl.NumberFormat`.
- **Difficulty:** Low
- **Impact:** Low-medium.

### L3 — Several components/services are too large

- **Why it matters:** Large files mix orchestration, rendering, state, and domain
  calculations, increasing review and regression cost.
- **Where:** `calendar-timeline.tsx` (571 lines), `media-grid.tsx` (511),
  `reservation.service.ts` (490), `vehicle-form.tsx` (483),
  `analytics.service.ts` (411), `reservation-detail.tsx` (305).
- **How to fix:** Split by cohesive responsibility: timeline/toolbar/modal,
  upload transport/tile/gallery state, reservation command/query modules,
  vehicle form sections, analytics query/aggregation, drawer provider/bodies.
- **Difficulty:** Medium
- **Impact:** Medium for maintainability; low immediate runtime impact.

### L4 — Documentation is useful but stale and contains unsafe material

- **Why it matters:** `HANDOFF.md` still calls focus trapping a known gap although
  it is implemented, reports old test counts, exposes bootstrap credentials, and
  embeds operational secrets history in the repository.
- **Where:** `HANDOFF.md:20-23,146-161`.
- **How to fix:** Remove credentials, move incident details to private tracking,
  update counts/status automatically where possible, and assign an owner/review
  date to operational docs.
- **Difficulty:** Low
- **Impact:** Medium.

### L5 — API capabilities are consistent but narrow

- **Why it matters:** Pagination is bounded and response shapes are consistent,
  but there is no API versioning/documentation, explicit cache policy/ETag,
  request ID, standard problem details, or sorting contract. Availability performs
  two reads and anonymous reads have no abuse budget.
- **Where:** `src/app/api/*`, `src/lib/api.ts`.
- **How to fix:** Document contracts with OpenAPI if external use is intended; add
  request IDs and cache policy; combine availability/quote reads; add bounded
  anonymous protection based on observed abuse.
- **Difficulty:** Medium
- **Impact:** Low today, medium if API consumers grow.

### L6 — SEO and business trust artifacts are incomplete

- **Why it matters:** There is useful page metadata, dynamic vehicle OpenGraph
  content, and a 404, but no sitemap, robots file, structured data, canonical URL,
  manifest, legal pages, or proof that hard-coded reviews are authorized.
- **Where:** `src/app`, homepage review constants.
- **How to fix:** Add `sitemap.ts`, `robots.ts`, canonical metadata, LocalBusiness/
  Product JSON-LD, privacy/terms pages, and approved review provenance.
- **Difficulty:** Low-medium
- **Impact:** Medium for discovery/trust, low for application safety.

### L7 — Contact information is text rather than actionable links

- **Why it matters:** Phone/email are not `tel:`/`mailto:` links, adding friction on
  mobile and for assistive technology.
- **Where:** contact page and footer.
- **How to fix:** Render semantic links with clear accessible names.
- **Difficulty:** Low
- **Impact:** Low-medium.

## Category Review

### 1. Architecture — 7/10

The route groups, service layer, validation modules, shared components, thin API
handlers, and Prisma singleton are sensible and scalable for a small team. Data
flow is easy to follow: page/action/route → validation/guard → service → Prisma.

Weaknesses are boundary enforcement rather than folder naming: public and internal
reads are mixed, services are not `server-only`, authorization is not intrinsic to
sensitive reads, commands and queries share very large service files, and external
asset workflows lack an outbox/reconciliation architecture.

### 2. Code Quality — 6.5/10

Naming, typing, comments, error normalization, and formatting are generally strong.
There is little `any`, no obvious mutation-heavy state, and complex decisions are
often documented. However, comments sometimes overstate guarantees (gallery
atomicity, limiter failure behavior), several 400–570 line files need cohesive
splits, dead code/dependencies exist, money formatting is duplicated, and project
documentation has drifted.

### 3. React Best Practices — 7/10

Server Components are used by default; client components are limited to
interaction; hooks have appropriate dependency arrays; reusable overlays now trap
focus; route-level loading/error boundaries exist. There is no evidence that broad
`React.memo`/`useMemo` use would improve the app, so adding it indiscriminately is
not recommended.

Main concerns: the detail context value is recreated on provider renders; large
calendar/media/form components rerender wide subtrees; on-demand detail loads lack
abort/stale-response protection; the hand-built booking modal is incomplete; no
component profiler measurements or browser performance tests exist.

### 4. JavaScript/TypeScript — 7/10

Strict TypeScript passes, modern syntax and async/await are consistent, errors are
normalized, and null handling is mostly explicit. Weaknesses are missing network
error handling in booking, no idempotency for uncertain submissions, non-atomic
async workflows, hard-coded timestamp composition, and repeated formatting.

### 5. Security — 3/10

Strong code-level foundations include bcrypt, generic auth errors, server-side
RBAC, Zod, parameterized DB access, React escaping, no raw HTML, safe relative
login redirects, private environment files, narrow public API DTOs, rate limiting,
and hidden internal errors.

The valid bootstrap admin credential and unverified leaked secrets dominate the
score. Further gaps: revocation-less JWTs, public plate exposure, absent audit log,
unverified dependency CVEs, no MFA, incomplete security headers/CSP configuration,
no startup env validation, ambiguous trusted-proxy handling, no explicit data
retention/privacy controls, and no incident monitoring.

No evidence of classic SQL injection, stored/reflected XSS, open redirect, unsafe
password storage, or client-side token storage was found.

### 6. Backend — 6.5/10

Routes/actions are thin; services carry domain logic; validation and error mapping
are consistent; pagination is bounded; Prisma selects are often explicit. The
overlap constraint is excellent.

Weaknesses: business state races, partial multi-system commits, services without
intrinsic authorization, no idempotency keys, no audit trail, raw-row analytics,
no background job system, no email notifications, no request tracing, and a
database-backed limiter on the same critical store.

### 7. Database — 6/10

Relations, foreign keys, delete behavior, decimals, unique user/customer email,
status/category indexes, repair history, and the overlap exclusion constraint are
good. Restricting reservation deletion dependencies preserves history.

Missing pieces: check constraints, query-aligned indexes, audit/event tables,
session revocation state, service-date ranges, case-insensitive email at the DB
level, PII lifecycle, public slug history, image public-ID uniqueness, and
production restore proof.

### 8. API Design — 7/10

Endpoints follow clear resource names, return correct 201/4xx/5xx classes through a
consistent envelope, validate inputs, cap page size, and protect sensitive vehicle
API fields. Pagination metadata is coherent.

Gaps: no version/documentation, sorting contract, request/correlation ID, cache/
ETag policy, idempotent booking token, availability rate budget, or consolidated
availability+quote query. The website bypasses the safe public API/DAL.

### 9. Performance — 5/10

Next Image, responsive `sizes`, Server Components, route code splitting, bounded
lists, URL-driven filters, and gradient-based calendar grid lines are good.

Risks: all data pages are dynamic, dashboard query fan-out, raw-row analytics,
missing indexes, no caching, public reads using broad internal models, 2.7 MB of
uncompressed emitted client chunks across the application, large interactive
admin components, and a perpetual 200vw×200vh blurred animated ambient layer with
`will-change`. Reduced-motion/transparency fallbacks are a genuine positive.

### 10. Accessibility — 5.5/10

Landmarks/headings, labels, autocomplete, semantic links, alt text, visible focus
styles, status text, reduced motion, dialog semantics in shared overlays, and
keyboard sortable support are present. Charts expose useful image labels.

Gaps: error associations, custom booking modal semantics/focus, small targets,
calendar double-click/pointer dependence, icon-only control sizing, no skip link,
mobile-nav focus containment/inerting, and no automated/manual WCAG test evidence.

### 11. Responsive Design

Representative public pages did not overflow at 320, 375, 1280, or 1440 widths.
Public cards, filters, booking fields, contact cards, admin dashboard, and tables
generally adapt cleanly. The concrete exception is the admin calendar at 320px,
where its toolbar/timeline escapes the intended scroller and widens the document.
Large monitor layouts are sensibly capped.

### 12. UX — 7/10

Navigation and visual hierarchy are clear; booking is short; prices are prominent;
empty/loading/error/confirmation states exist; admin actions are close to context;
drawer details preserve the operator's place; destructive actions confirm; status
language is consistent.

Release-damaging gaps are placeholder contacts and an email-confirmation promise
with no email system. Other gaps: no customer booking lookup/cancellation, no
offline recovery, no submit idempotency, no admin bulk actions, no persisted
server-side notification dismissal, and calendar interaction is dense on phones.

### 13. UI

The token system, typography, status palette, elevation, cards, button variants,
and dark surfaces are coherent. Reduced-transparency support is unusually good.
The root forces dark mode and there is no tested theme switch despite theme-related
dependencies. The animated glass/ambient treatment should be GPU-profiled on low-
end mobile before keeping it globally.

### 14. Forms

Client and server validation, labels, autocomplete, pending buttons, required
attributes, image constraints, and confirmation states are good. Missing pieces:
ARIA error wiring, network recovery, timeout/idempotency, international phone
validation, consent/privacy link, focus to server errors, accessible manual-booking
modal, and server validation details that identify all invalid fields rather than
only the first issue.

### 15. Error Handling

API errors are consistently shaped and internal details are hidden. 404, route
error, global error, and loading states exist. Missing: structured reporting,
request IDs, database/provider timeout classification, retry policy, offline
booking UX, Cloudinary reconciliation, and explicit stale Server Action recovery
across deployments.

### 16. Logging

Current state is insufficient: console-only unexpected errors, no structured
context, no audit log, no sign-in telemetry, no PII redaction policy, no retention,
and no alerts.

### 17. Maintainability — 6.5/10

A new developer can understand the layout and conventions quickly. Strong comments
explain non-obvious constraints. Long mixed-responsibility files, stale handoff
content, dead code/dependencies, missing DAL enforcement, and low coverage will
cause technical debt to accelerate as features grow.

### 18. Scalability

- **100 users:** Should operate acceptably after credential rotation and correctness
  fixes. Existing PostgreSQL and Vercel architecture is adequate.
- **1,000 users:** Likely acceptable at modest concurrency, but dashboard query
  fan-out, DB-backed limits, connection pool, no cache, and no observability make
  capacity uncertain.
- **10,000 users:** Public dynamic reads, availability queries, analytics scans,
  and a connection limit of one become material bottlenecks. Email/manual staff
  workflow also becomes an operational bottleneck.
- **100,000 users:** Current design does not survive reliably. First failures will
  be DB pool saturation/latency, analytics memory/scans, rate-limit write load,
  manual booking operations, and inability to observe/recover incidents.

Scaling path: public read cache/CDN → indexed/aggregated queries → isolated
rate-limit/cache store → durable job/outbox system → tuned pooled DB/read replicas
where justified → horizontally safe session/action keys → measured autoscaling and
SLOs. Do not introduce microservices before these measured boundaries require it.

### 19. Testing Readiness — 4/10

Pure logic is testable and existing tests are fast, but most risk sits behind
Prisma, Auth.js, Server Actions, browser components, and external APIs with no
test harness. Add a disposable PostgreSQL integration environment, factories,
Cloudinary/email adapters, E2E browser tests, accessibility scans, concurrency
tests, and coverage reporting.

### 20. Production Readiness — 4/10

CI, lockfile, build, migrations, Vercel/Supabase instructions, error pages, and
environment templates exist. Missing release requirements are credential/secrets
remediation, dependency audit, controlled migrations, observability, audit
logging, backup/restore proof, health/readiness, notifications, legal/privacy
content, security headers, incident runbooks, and meaningful integration/E2E tests.

## Actionable Roadmap

### Phase 1 — Critical Security (block launch)

1. Rotate every disclosed secret and revoke existing sessions.
2. Disable/delete demo users; force all staff password resets; enable admin MFA.
3. Remove credentials from repository documentation/history and add secret
   scanning/push protection.
4. Replace all website vehicle reads with public DTOs; remove public plates.
5. Add session revocation/active-user checks.
6. Add minimum CSP/security headers and trusted-proxy configuration.
7. Add immutable auth/admin audit events.
8. Commission a dependency vulnerability scan through an approved private/SBOM
   process.

### Phase 2 — Architecture and Correctness

1. Build server-only public/admin DAL modules with authorization and DTOs.
2. Make reservation transitions conditional/transactional and concurrency-tested.
3. Introduce outbox/jobs and reconciliation for images and notifications.
4. Make public customer+reservation creation atomic and idempotent.
5. Define bookable vehicle-state and timezone invariants.
6. Stabilize public IDs/slugs and redirect history.
7. Add database check constraints and measured indexes.
8. Split the largest files along command/query and UI responsibility boundaries.

### Phase 3 — Performance and Scale

1. Add tracing/query metrics and establish latency baselines.
2. Cache public list/detail DTOs with tag invalidation.
3. Aggregate analytics in SQL and cap all operational queues.
4. Tune pooling from load-test evidence; isolate rate limiting when needed.
5. Stream independent admin panels with Suspense.
6. Profile client bundles and GPU cost; remove unused packages and reduce the
   ambient blur layer if low-end devices miss targets.
7. Run staged load tests for 100, 1k, 10k concurrent-user scenarios.

### Phase 4 — UX

1. Replace placeholder contacts and implement real booking notifications.
2. Add resilient submit/retry/idempotency and preserve form state.
3. Provide a customer reference lookup/status/cancellation channel or explicitly
   define the supported manual alternative.
4. Improve small-screen calendar controls and touch targets.
5. Add actionable `tel:`/`mailto:` contacts and trustworthy legal/review content.

### Phase 5 — Accessibility

1. Wire all form errors with `aria-invalid`/`aria-describedby` and summaries.
2. Replace the manual booking overlay with the accessible dialog primitive.
3. Make calendar detail/create workflows keyboard-operable without double-click.
4. Add a skip link and verify mobile navigation focus/order.
5. Run axe in CI and manual WCAG 2.2 AA tests with keyboard, VoiceOver/NVDA, zoom,
   contrast, reduced motion, and coarse pointer.

### Phase 6 — Testing

1. Add PostgreSQL migration/constraint integration tests.
2. Add auth, role, session revocation, and public data-boundary tests.
3. Add concurrent transition/overlap/idempotency tests.
4. Add route and Server Action failure-path tests.
5. Add Playwright booking/admin smoke suites at desktop and mobile widths.
6. Add accessibility, performance-budget, and restore/migration rehearsal tests.

### Phase 7 — Production Readiness

1. Add structured logging, error reporting, traces, dashboards, SLOs, and alerts.
2. Separate migrations from application builds and document rollback.
3. Add environment validation, health/readiness, and stable Server Action keys for
   multi-instance deployment.
4. Prove PITR/backup restoration and publish RPO/RTO/runbooks.
5. Vendor fonts, add sitemap/robots/structured data/legal pages.
6. Complete security review, threat model, privacy review, load test, and go-live
   checklist; obtain named sign-off from engineering, security, operations, and
   the business owner.

## Technical Debt Backlog

| ID       | Priority | Backlog item                                              | Difficulty | Impact        |
| -------- | -------- | --------------------------------------------------------- | ---------- | ------------- |
| SEC-001  | P0       | Rotate disclosed production secrets and revoke sessions   | M          | Very high     |
| SEC-002  | P0       | Remove/disable bootstrap accounts and require reset/MFA   | M          | Very high     |
| SEC-003  | P0       | Remove public plates and enforce public DTOs everywhere   | M          | High          |
| SEC-004  | P0       | Add revocable sessions/active user checks                 | H          | High          |
| SEC-005  | P0       | Add immutable security/admin audit events                 | H          | High          |
| DATA-001 | P0       | Make reservation transitions concurrency-safe             | M          | High          |
| DATA-002 | P0       | Reconcile Cloudinary via outbox/idempotent jobs           | H          | High          |
| TEST-001 | P0       | Add auth/RBAC/API/concurrency integration tests           | H          | High          |
| OPS-001  | P0       | Add error reporting, structured logs, traces, alerts      | M          | High          |
| UX-001   | P0       | Implement real booking notifications/contact details      | M          | High          |
| SEC-006  | P1       | Add CSP and complete security-header policy               | M          | High          |
| SEC-007  | P1       | Harden trusted proxy/rate-limit identity and telemetry    | M          | M-high        |
| DATA-003 | P1       | Define/enforce bookable vehicle states                    | M          | High          |
| DATA-004 | P1       | Resolve timezone/date domain model                        | H          | High          |
| DATA-005 | P1       | Add DB checks and measured composite indexes              | M          | High          |
| DATA-006 | P1       | Make customer+reservation atomic and idempotent           | M          | M-high        |
| ARCH-001 | P1       | Create server-only authorized DAL/public DTO modules      | H          | M-high        |
| PERF-001 | P1       | Aggregate analytics in SQL and add caching                | H          | High          |
| OPS-002  | P1       | Separate migration release step from app build            | M          | M-high        |
| OPS-003  | P1       | Add backup restore drills, RPO/RTO, incident runbooks     | M          | High          |
| PRIV-001 | P1       | Implement privacy notice, retention, export/anonymization | H          | High          |
| A11Y-001 | P1       | Associate validation errors programmatically              | L-M        | M-high        |
| A11Y-002 | P1       | Replace/fix manual reservation modal                      | M          | M-high        |
| RESP-001 | P1       | Contain calendar overflow at 320px                        | M          | Medium        |
| TEST-002 | P1       | Add Playwright booking/admin/mobile/axe suite             | H          | High          |
| PERF-002 | P2       | Measure/tune DB pool and isolate limiter storage          | H          | High at scale |
| PERF-003 | P2       | Profile/reduce client bundles and ambient GPU cost        | M          | Medium        |
| UX-002   | P2       | Add booking status/self-service or explicit support path  | H          | Medium        |
| A11Y-003 | P2       | Expand touch targets and keyboard calendar actions        | M          | Medium        |
| CODE-001 | P2       | Split largest files by responsibility                     | M          | Medium        |
| CODE-002 | P2       | Remove dead dependencies/code; centralize EUR formatting  | L          | Low-medium    |
| NEXT-001 | P2       | Migrate `middleware.ts` to Next.js 16 `proxy.ts`          | L          | Low-medium    |
| OPS-004  | P2       | Add startup environment validation and local fonts        | M          | Medium        |
| SEO-001  | P3       | Add sitemap, robots, canonical, JSON-LD, legal pages      | L-M        | Medium        |
| DOC-001  | P3       | Sanitize/update handoff and assign review ownership       | L          | Medium        |

## Enterprise Readiness Checklist

### Security

- [ ] All previously disclosed secrets rotated; evidence recorded privately
- [ ] Old sessions and tokens revoked
- [ ] Bootstrap/demo users removed from production
- [ ] Staff passwords reset; administrator MFA required
- [ ] Repository history/documentation contains no credentials
- [ ] Secret scanning and push protection enabled
- [ ] Approved dependency/SBOM vulnerability scan is clean or exceptions accepted
- [ ] Public pages use public DTOs only; no plates/internal costs/retired records
- [ ] Sessions are revocable and user/role/active state is revalidated
- [ ] CSP, frame, MIME, referrer, permissions, transport policies verified
- [ ] Trusted proxy/IP derivation documented and tested
- [ ] Security and administrative audit events retained and access-controlled
- [ ] Threat model and external penetration test completed

### Data and backend

- [ ] Conditional/locked reservation state transitions implemented
- [ ] Concurrent overlap/status tests pass
- [ ] Customer and reservation creation is atomic and idempotent
- [ ] Vehicle bookable-state policy enforced in every public path
- [ ] Timezone/date model approved and migrated
- [ ] Database check constraints added and existing data validated
- [ ] Query plans measured; required indexes deployed
- [ ] Cloudinary operations use durable outbox/reconciliation
- [ ] Draft assets are swept; deletion is idempotent
- [ ] Slugs/public IDs are collision-safe and URL changes redirect
- [ ] PII retention/export/anonymization processes implemented

### UX and accessibility

- [ ] Real phone/email/address replaces placeholders
- [ ] Customer and staff booking notifications are durable and monitored
- [ ] Booking handles offline/timeout/retry without duplicates
- [ ] Every form error is associated and announced
- [ ] All modals trap/restore focus and expose proper semantics
- [ ] Calendar is fully keyboard-operable
- [ ] No page-level overflow at 320/375/tablet/desktop/large-monitor widths
- [ ] Touch targets meet WCAG 2.2 target-size expectations
- [ ] Keyboard, screen-reader, 200% zoom, contrast, reduced-motion checks pass
- [ ] Privacy/terms and approved marketing/review content are published

### Testing and delivery

- [ ] Lint, strict typecheck, unit, integration, E2E, axe, and build pass in CI
- [ ] PostgreSQL migrations/constraints are tested on a disposable database
- [ ] Auth/RBAC/session revocation tests pass
- [ ] APIs and Server Actions have success/failure/abuse tests
- [ ] Booking and core admin journeys pass at desktop and mobile widths
- [ ] Load tests meet agreed 100/1k/10k targets and error budgets
- [ ] Performance budgets cover server latency, bundle, image, and GPU cost
- [ ] Migrations run once in a controlled release step
- [ ] Expand/contract deployment and rollback are rehearsed
- [ ] Environment validation fails fast without exposing values
- [ ] Fonts/builds do not depend on an uncontrolled external fetch

### Operations

- [ ] Structured logs include correlation IDs and redact PII/secrets
- [ ] Error reporting and distributed tracing are live
- [ ] SLO dashboards and actionable alerts are live
- [ ] Liveness/readiness checks are integrated with deployment
- [ ] Database pool saturation, query latency, rate limiting, jobs, and email are monitored
- [ ] PITR/backups enabled and a restore drill has succeeded
- [ ] RPO/RTO, incident, credential compromise, provider outage, and rollback runbooks exist
- [ ] On-call ownership and escalation are assigned
- [ ] Final security, engineering, operations, privacy, and business sign-off recorded
