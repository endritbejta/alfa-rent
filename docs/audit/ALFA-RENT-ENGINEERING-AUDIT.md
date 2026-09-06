# Alfa Rent — Engineering Audit

**Audit date:** 27 August 2026 · **Commit:** `7244622` on `main`, working tree clean
**Scope:** whole repository — 175 source files, 19,026 LOC, 12 migrations, 671 lines of CSS
**Method:** eleven sequential phases, read-only. **No application code, configuration, schema
or data was modified at any point.** Conclusions were reached by executing the code, measuring
the build output, and reading the installed dependency sources — not by recollection.
**Consolidates:** Phases 1–10, in `docs/audit/`.

---

## Executive summary

Alfa Rent is **a well-engineered application with a small number of serious, specific
defects** — not a troubled codebase needing rescue. The architecture is coherent and the
discipline is unusually high: zero `any`, zero `TODO`, zero lint suppressions, zero
commented-out code and zero circular imports across 19k lines, with comments that record _why_
each non-obvious decision was made and, frequently, the incident that motivated it.

The problems cluster in three places:

1. **Four defects on paths that handle money or availability**, all sharing one trait: _the
   code does something reasonable and then fails to tell anyone._ A booking lost to a network
   error shows the customer nothing. A save reports success and changes nothing. A limiter
   inverts its own documented failure mode. A returned car can vanish from the fleet silently.
2. **No observability.** `console.error` in four places. This is why the above survived two
   prior audits — nothing was watching.
3. **A test suite aimed at the wrong half of the system.** It is fast, passing, and covers a
   pure-function core that I independently verified as _correct_. **Zero of the twenty
   confirmed bugs would have been caught by it.**

Nothing here calls for a rewrite. The highest-value items are small: three of them are one to
three lines each and between them cover the customer's booking path, staff sign-in
availability, and a vehicle silently leaving the fleet.

### Scores

| Area                     |   Score    | Basis                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | :--------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture**         | **8** / 10 | All 18 data-write sites in `services/`; zero `services→app` or `lib→app` edges; database-as-authority with app checks labelled advisory; explicit public DTO allowlist. Deductions: `components/**` imports `app/**` at 6 sites; `Vehicle.status` has three writers; one `cookies()` call makes all 22 routes dynamic; `lib/` vs `utils/` has no rule.                                                                                                         |
| **Code Quality**         | **8** / 10 | Strict TS, clean lint, no escape hatches anywhere, rationale-rich comments. Deductions: four money formatters producing visibly different output on one screen; 14 enum-label sites in three type strategies, four of them not exhaustiveness-checked; four stale comments.                                                                                                                                                                                    |
| **Reliability**          | **5** / 10 | 20 confirmed bugs (6 high). Reservation-lifecycle writes are properly atomic with compare-and-swap guards — genuinely good. But three image paths are not atomic, **no timeout or retry exists anywhere in the application**, and there is no error reporting.                                                                                                                                                                                                 |
| **Security**             | **7** / 10 | No remote-exploitable vulnerability for an anonymous attacker except availability. Authorization is three layers deep with all 16 actions guarded and immediate revocation on every request; no XSS or SQL-injection surface; secrets never reach the client; CSRF covered by the framework; RLS deny-by-default. Deductions: a bypassable post-login redirect, no way to revoke a session or manage staff, two unrate-limited public endpoints.               |
| **Performance**          | **4** / 10 | Measured: **315 KiB gzip — 38% of all client JS — is duplicate copies of two libraries**; a 211 KiB gzip floor on every admin route; 22/22 routes dynamic with nothing cached; 11–19 queries per admin render with the auth query run twice; `connection_limit=1`. Strengths: accurate image `sizes` everywhere, `content-visibility`, no whole-library imports.                                                                                               |
| **UX**                   | **6** / 10 | Coherent design system, good empty/loading/error states, thoughtful flows (the extension ceiling is shown before staff can be refused; one calendar system serves both products). Deductions: **no admin mutation confirms it worked**; no notification infrastructure at all, so a customer who books hears nothing; server error messages are English in an Albanian-default UI.                                                                             |
| **Accessibility**        | **6** / 10 | Better than most: every image has alt text, 17 `role="alert"` regions, three of four overlays have full dialog semantics with focus trap _and_ restore, both `prefers-reduced-motion` and `prefers-reduced-transparency` honoured, light theme passes AA on all 20 pairs, touch targets meet WCAG 2.2 AA. Deductions: three computed dark-theme failures, **zero live regions**, one overlay with no semantics, interactive content nested in `role="button"`. |
| **Testing**              | **3** / 10 | 94 tests pass in 1.24 s and the core they cover is correct. But 0/20 confirmed bugs caught; 7 of 21 files assert source _text_; component tests are structurally impossible to run; zero coverage of auth, RBAC, actions or services; one integration test with no production guard.                                                                                                                                                                           |
| **Scalability**          | **4** / 10 | The first wall is **concurrency, not data volume** — it arrives with users, not rows. Then unindexable `ILIKE` search, analytics bucketed in application memory, and a calendar rendering ~18,700 DOM buttons today (~187,000 at 10× fleet). Reservation query shapes are well indexed.                                                                                                                                                                        |
| **Developer Experience** | **5** / 10 | Fast, clean, correctly-ordered CI that runs migrations against a real Postgres; typecheck on every commit; genuinely valuable rationale documentation. But **a fresh clone cannot run the application** — no compose file, no local database path — and the README instructs you to run the one Prisma command the project forbids.                                                                                                                            |
| **Overall**              | **6** / 10 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Production readiness** | **5** / 10 | It is deployed and it works. But there are known defects on the revenue path, a plausible chain that locks staff out, and no way to observe either.                                                                                                                                                                                                                                                                                                            |

For comparison, the previous audit (24 July) scored Overall 5.5 and Production Readiness 4.
**The improvement is real and verifiable** — the public data leak, the customer-overwrite hole,
the slug collisions and the dead service are all genuinely fixed. Security moved most (3 → 7)
because `active` + `sessionVersion` + per-request revalidation now exist.

---

## What is good — preserve this

Fifty-odd specific items are listed in the "verified sound" sections of Phases 2–9. The ones
that matter most:

1. **The database is the authority, and the code says so.** A GiST exclusion constraint
   prevents double-booking; every application availability check is explicitly commented as
   _advisory_, existing only to produce a friendly message instead of a raw `23P01`. This is
   materially stronger than an application-only check and it is the single best decision in
   the codebase.
2. **Comments that explain _why_, with incident history.** `HANDOFF.md` §3 ("conventions that
   have bitten before") and §4 ("deliberate decisions — do not fix these") are the reason this
   audit moved as fast as it did. Do not let a cleanup pass strip them.
3. **All date and interval logic is correct.** I executed it against boundary inputs:
   half-open intervals hold, touching ranges are allowed, overlapping are refused, and
   `latestUnder` handles both the ceiling-on-a-pickup and ceiling-at-midnight cases. Client and
   server pricing agree across **both** Belgrade DST transitions.
4. **`businessCalendarStart`** looks like over-engineering and is not: it computes a
   Belgrade-local day boundary correctly across DST without a timezone library, is documented,
   and is tested in both seasons. **Do not replace it with `date-fns-tz`.**
5. **The public DTO allowlist**, with a test that fails if a sensitive field is added, and the
   incident that motivated it recorded in the comment.
6. **Direct-to-Cloudinary uploads** with the signature covering `folder` _and_
   `transformation`, the response signature re-derived server-side, and the stored URL
   **rebuilt from the verified id** — never taken from the client.
7. **The inspection transaction** — a legally significant record and two state changes, atomic,
   with `count !== 1` compare-and-swap guards throughout.
8. **`reservation.service.ts` at 614 lines is one domain, not several.** Splitting it would
   scatter one invariant across files.
9. **The IP-keyed login limiter**, with eight lines explaining why email-keying would let an
   attacker lock real staff out of their own accounts.
10. **A uniform API envelope** — all five endpoints through `ok()` + `withErrorHandling`, zero
    ad-hoc error paths, and 16 of 16 server actions named consistently.

---

## Critical findings

Only these four are genuinely critical. Each is either on the money path or takes the business
offline.

### C1 · A booking lost to a network error vanishes with no feedback

`booking-form.tsx:145-168` · **confirmed** · **effort: trivial**
The submitting `fetch` has no `try`/`catch`. I read `react-hook-form@7.81`'s source: the
rejection is captured, `isSubmitting` is reset to `false`, then re-thrown as an unhandled
rejection that React 19 does not route to an error boundary. The customer sees the button
flicker back to "Send" and **nothing else**. They retry; after eight attempts the rate limiter
tells them they have sent too many requests. **This is the revenue path**, and the previous
audit flagged it on 24 July.

### C2 · Anonymous traffic can lock every staff member out of the dashboard

`rate-limit.ts:28` + `api/availability` + `connection_limit=1` · **confirmed chain**
· **effort: trivial to break**
The limiter's `$queryRaw` is not wrapped, so a thrown query propagates out of `authorize()` and
Auth.js reports a failed sign-in — for everyone. Two unrate-limited public endpoints share the
single pooled connection that `rate_limits` is written through. The control designed to prevent
abuse is what converts load into a lockout. **Wrapping the query in `try`/`catch` and failing
open — which its own comment already says it intends — breaks the chain on its own.**

### C3 · A save can report success and change nothing

`vehicles/actions.ts:32-49` · **confirmed** · **effort: small**
`formData.get(x) || undefined` → Zod `.partial()` keeps the key → Prisma reads `undefined` as
"leave unchanged". Five clearable fields (`plate`, `registrationDate`, `lastServiceDate`,
`nextServiceDate`, `serviceNotes`) cannot actually be cleared. The form redirects successfully;
the old value is still there. It is critical because it is **silent data-integrity loss wearing
a success message**, and because the absence of any success feedback (U1) is why nobody noticed.

### C4 · A returned car can be silently and permanently removed from the fleet

`inspection.service.ts:159` + `vehicle.service.ts:220` · **confirmed** · **effort: trivial**
A car breaks down mid-rental; staff set it to `SERVICE`; the customer returns it; the RETURN
inspection succeeds; the release `updateMany({ where: { status: "RENTED" } })` matches zero
rows **and the count is not checked** (unlike the PICKUP branch 19 lines above). The vehicle is
stuck in `SERVICE` — off the storefront, unbookable, earning nothing. Nothing surfaces it:
there is no reconciliation check anywhere, and `getDashboardData()` computes the SERVICE count
and renders it **zero times**.

---

## High priority

| #   | Finding                                                                                                                                                                                                             | Where                                       | Effort                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- |
| H1  | **Post-login redirect guard is bypassable** → credential phishing on the genuine domain. `/\evil.com`, `/\/evil.com` and `/<TAB>/evil.com` all pass the prefix check and resolve off-origin (verified by execution) | `login/page.tsx:29`                         | trivial                           |
| H2  | **No way to create, deactivate or revoke a staff account.** No `session.maxAge` (Auth.js default: 30 days rolling); `sessionVersion` is read every request but **nothing ever writes it**; no staff UI at all       | `auth/config.ts:13`                         | medium                            |
| H3  | **No error reporting.** `console.error` only. Open since 17 July; blocks any claim of production readiness, and it is how you would have detected C1–C4                                                             | app-wide                                    | small                             |
| H4  | **The nested repairs form** — one structural fault causing a save-blocking bug, a duplicate-`id` label defect, and three undocumented workarounds                                                                   | `repairs.tsx` inside `vehicle-form.tsx:306` | small                             |
| H5  | **315 KiB gzip (38% of all client JS) is duplicate copies of two libraries** — `react-day-picker`+`date-fns` emitted 4×, `zod` 2×, one per route island, so not cache-shared                                        | bundler config                              | small config, medium verification |
| H6  | **Nothing is cached; all 22 routes dynamic** because of one `cookies()` call in the root layout. The public site hits the database for every anonymous visitor, on the same connection as staff sign-in             | `i18n/server.ts:7`                          | medium (architectural decision)   |
| H7  | **Four DB objects are invisible to Prisma** — the exclusion constraint, `btree_gist`, RLS on 10 tables, two CHECKs. Any schema-regenerating command drops them, **and both the test suite and CI would still pass** | `schema.prisma` vs migrations               | small (a CI test)                 |
| H8  | **`Vehicle.status` has three writers and no owner**; `updateVehicle` writes it blind                                                                                                                                | `vehicle.service.ts:220`                    | medium                            |
| H9  | **No admin mutation confirms it worked.** No toast mechanism exists; the one attempt (`?created=1`) is dead code. This is why C3 went unnoticed                                                                     | app-wide                                    | small                             |
| H10 | **Two unauthenticated database endpoints have no rate limit** and no `Cache-Control`                                                                                                                                | `api/vehicles`, `api/availability`          | trivial                           |

## Medium priority

Consolidated; full detail in the phase documents.

- **Reliability:** two lifetime-spend figures for one customer (20 vs 50 row caps, two formats);
  `?page=0` throws a crash screen on two lists while the fleet page degrades correctly;
  command-palette search has no cancellation so stale results overwrite fresh ones, and it
  converts **every** error into "nothing matches"; the revenue KPI and the chart beside it use
  different month boundaries; three image paths are not atomic (a failed photo save leaves a
  vehicle created, so a retry creates a duplicate; a failed delete destroys Cloudinary photos
  permanently).
- **Timeouts:** none anywhere. A stalled upload blocks the inspection form with no explanation;
  unbounded Cloudinary calls inside a loop under a bounded function is what makes the
  non-atomic gallery write fail in practice; Prisma's `maxWait: 2000` against
  `connection_limit=1` surfaces as a generic 500.
- **Security:** any employee can mint Cloudinary write credentials for an arbitrary id; the CSP
  has no `script-src` at all; employees can read per-vehicle net profit while only admins can
  edit vehicles.
- **Performance:** every admin route eagerly loads the whole detail-drawer graph (zero dynamic
  imports exist); the fleet page renders three copies of the same list into the payload;
  `requireUser()` runs twice per render, uncached; images are optimised twice; three N+1 loops
  producing up to 32 sequential round trips.
- **Accessibility:** three computed dark-theme contrast failures; zero live regions, so booking
  success is unannounced; the calendar's booking modal has no dialog semantics or focus trap;
  interactive content nested inside `role="button"` on the busiest staff screen; two unlabelled
  selects.
- **Data:** `returnDate > pickupDate` is enforced in Zod only; the friendly double-booking 409
  depends on an untested substring match against a Postgres message.

## Low priority

Four stale comments; nine unreferenced design tokens; `CardAction`/`CardFooter` unused;
`ui/card.tsx` has one consumer; `EXIT_MS = 192` contradicts a `160ms` token its own comment
says it must match; the pending banner flashes before hydration and its persisted state
diverges after eight dismissals; object URLs never revoked on unmount; one deprecated
`priority` prop; `VehicleImage.version` not stored; `publicId` uniqueness asymmetric between
the two image tables; sorting supported on one of four lists; eight unnamed page-size literals;
`T10:00:00Z` string-concatenated at three sites.

---

## Confirmed bugs

Twenty, each traced or executed. Full reproductions in
[Phase 3](docs/audit/PHASE-3-BUGS-RELIABILITY.md). Summary:

| #   | Bug                                                                         | File                              | Sev      |
| --- | --------------------------------------------------------------------------- | --------------------------------- | -------- |
| B1  | Booking `fetch` has no `catch` — submissions lost silently                  | `booking-form.tsx:147`            | **high** |
| B2  | Optional vehicle fields cannot be cleared (5 fields)                        | `vehicles/actions.ts:36`          | **high** |
| B3  | Rate limiter fails **closed**, contradicting its own comment                | `rate-limit.ts:28`                | **high** |
| B4  | Opening the repairs panel blocks saving the vehicle                         | `vehicle-form.tsx:126`            | **high** |
| B13 | RETURN branch does not verify the vehicle was released                      | `inspection.service.ts:159`       | **high** |
| B14 | `updateVehicle` can mark a rented car available                             | `vehicle.service.ts:220`          | **high** |
| B5  | Calendar bar-width guard is dead code (`min()` returns a clone)             | `calendar/page.tsx:99`            | med      |
| B6  | Two different "lifetime spend" figures for one customer                     | `reservation-detail.tsx:180`      | med      |
| B7  | `?page=abc` throws to the error boundary on two lists                       | `reservations/page.tsx:46`        | med      |
| B8  | Palette search has no cancellation — stale results win                      | `command-palette.tsx:123`         | med      |
| B9  | Palette reports every failure as "nothing matches"                          | `command-palette.tsx:133`         | med      |
| B10 | Revenue KPI and revenue chart use different month boundaries                | `analytics.service.ts:32`         | med      |
| B11 | Failed photo save → vehicle created; retry creates a duplicate              | `vehicles/actions.ts:93`          | med      |
| B12 | Delete destroys Cloudinary photos before a DB delete that can fail          | `vehicle.service.ts:250`          | med      |
| B15 | Inspection photos silently truncated past six                               | `inspection-photo-upload.tsx:107` | med      |
| B16 | Extension refusals matched by English string equality; 1 of 4 never matches | `extend-reservation.tsx:50`       | low      |
| B17 | Pending banner flashes before its dismissed state hydrates                  | `pending-banner.tsx:45`           | low      |
| B18 | Banner in-memory and persisted dismissal state diverge                      | `pending-banner.tsx:60`           | low      |
| B19 | Object URLs never revoked on unmount                                        | `inspection-photo-upload.tsx`     | low      |
| B20 | `EXIT_MS = 192` contradicts `--motion-panel-exit: 160ms`                    | `detail-drawer.tsx:9`             | low      |

## Potential bugs — clearly uncertain

**Highly likely** (mechanism certain, trigger timing-dependent):

- A mid-loop failure in `syncVehicleImages` leaves a gallery half-reconciled with no rollback.
  The _ordering_ is deliberate and documented; the absence of a rollback is not addressed.
- The friendly double-booking 409 depends on `error.message.includes("reservations_no_overlap")`
  — a substring of a Postgres message surfaced through Prisma, with no test. A Prisma upgrade
  that rewords the wrapper turns every double-booking into an opaque 500.

**Latent — real, but cannot fire while payments are off** (four independent gates):
two concurrent checkouts create two payments; concurrent duplicate webhooks both pass the
duplicate check; `failureCode`/`failureMessage` survive a later success (same `undefined`
mechanism as B2); nothing reaps expired checkouts; extending a rental changes `totalPrice` with
no reconciliation against a settled payment; internal faults are reported to the customer as a
bank outage; walk-in reservations can never be paid online. **All must be fixed before a bank
adapter is registered.**

**Needs environment access:** whether the exclusion-constraint message actually contains the
constraint name; whether the seed still succeeds once payment rows exist; whether the raw
limiter SQL behaves under Supabase's transaction pooler; whether Vercel replaces or appends
`x-forwarded-for`.

---

## Findings by category

Each has its own phase document with full evidence.

- **[Security](docs/audit/PHASE-4-SECURITY.md)** — 1 high, 5 medium, 5 low, 2 latent, 3 needing
  your environment. Eleven items verified sound, including no XSS surface, no SQL-injection
  surface, framework-covered CSRF, and correct capability-token comparison.
- **[Architecture](docs/audit/PHASE-2-CODE-QUALITY.md)** — 6 high-severity, plus twelve items
  explicitly protected from change.
- **[Performance](docs/audit/PHASE-6-PERFORMANCE-SCALABILITY.md)** — 11 findings, all measured
  from the real build, plus a 10× projection distinguishing the concurrency wall from the
  data-volume walls, and six things I recommend _against_ optimising.
- **[UX / Accessibility](docs/audit/PHASE-5-FRONTEND-UX-A11Y.md)** — 8 accessibility findings
  with a computed contrast table validated against known reference values, and a correction to
  the prior audit's touch-target claim.
- **[Testing gaps](docs/audit/PHASE-8-TESTING-DX.md)** — the 0/20 measurement, two structural
  blockers, and the four highest-value tests to write.
- **[Technical debt](docs/audit/PHASE-9-TECH-DEBT-CONSISTENCY.md)** — frozen dependencies, ten
  unmarked workarounds with verdicts, and twelve explicit do-not-over-engineer rulings.
- **[Cross-system](docs/audit/PHASE-10-CROSS-VERIFICATION.md)** — three findings visible only
  in combination, nine removals, five upgrades.

---

## Recommended reusable components and patterns

Only where genuinely justified. Each fixes something users or the compiler can see.

1. **A toast / success-feedback surface.** The only missing piece of UI infrastructure. Every
   mutation needs it, and its absence is why two data bugs survived.
2. **`formatEur(value, { precision })` and `getDateLocale(locale)`.** Not for DRY: the same
   price renders `45.00 EUR` in the fleet table and `45` in the fleet grid, one toggle apart,
   and 11 user-facing dates render in English on an Albanian-default UI.
3. **One exhaustive enum→label module** (`CATEGORY_KEYS`, `FUEL_KEYS`, `TRANSMISSION_KEYS`,
   `VEHICLE_STATUS_KEYS`, each `Record<Enum, TranslationKey>`). The payoff is that the compiler
   starts catching what it currently cannot — adding a seventh category today compiles in four
   files and ships a blank label.
4. **A client-safe `uploadToCloudinary(file, signature, onProgress?)`** plus one shared receipt
   schema. The uploader exists twice and has already drifted (inspection uploads have no
   progress bar and truncate silently).
5. **Route the calendar's booking modal through the existing `Dialog`.** This _removes_ a
   fourth implementation rather than adding an abstraction, and fixes a real a11y gap.
6. **One `ActionResult<T>` union.** Four shapes exist and the type is declared identically in
   two files.

## Things that should NOT be changed

1. **The exclusion constraint and the advisory-check convention.** The whole double-booking
   guarantee rests on it.
2. **`reservation.service.ts` as one 614-line module.** One aggregate, one invariant.
3. **`vehicle-form.tsx` as one 642-line file.** 442 lines are markup for one cohesive form.
4. **`businessCalendarStart`'s hand-rolled DST-safe offset computation.**
5. **`src/proxy.ts`** — the current Next 16 convention, verified against the installed docs.
6. **The IP-keyed login limiter and the generic "invalid credentials" message.**
7. **The dummy bcrypt compare** — a timing-attack control, not dead code.
8. **Postgres-backed rate limiting** — documented, correct at this scale.
9. **`Promise.all` instead of `$transaction` for grouped reads** — a real Prisma type
   limitation, documented.
10. **The five `setTimeout(…, 0)` sites.** A real lint rule; `requestAnimationFrame` was tried
    and silently broke two features. Fix the unnecessary _effects_, not the workaround.
11. **The rationale comments.** They are the codebase's best documentation.
12. **The booking/reservation vocabulary split** — principled, not drift. I checked both ways.

## Things we should NOT over-engineer

1. **No repository/DAL layer over Prisma.** `services/` already _is_ that layer and is the sole
   writer.
2. **No state-management library.** URL-as-state works, is shareable, survives refresh.
3. **No i18n framework, and do not extract the dictionary to JSON.** 549 keys at 97.6%
   utilisation with `keyof typeof en` giving compile-time key safety — a framework loses that.
4. **Do not replace `date-fns`.** Four copies in the bundle is a chunking problem.
5. **No Redis for rate limiting.** Add the missing `try`/`catch` instead.
6. **No generic `EmptyState` rollout.** Four different sizes for four layouts; unifying buys a
   props matrix.
7. **No `useActionError` hook.** The 12 error-display sites are already consistent and are the
   most reliable part of the UI.
8. **No design-token generator.** Hand-written tokens carrying their own rationale are better
   documentation.
9. **Do not abstract the 15 error-plumbing lines alone** — only worth it if it also settles the
   guard-placement rule.
10. **Do not memoise components.** React Compiler lint is on and there is no measured render
    problem.

---

## Final implementation roadmap

### Phase 0 — Critical (days)

1. **B1** — wrap the booking `fetch` in `try`/`catch` and surface the error. _3 lines._
2. **B3** — wrap `consumeRateLimit`'s query and fail open. _Breaks the C2 lockout chain._
3. **H1** — parse the `callbackUrl` instead of prefix-matching it.
4. **B13** — check the count on the RETURN branch, and render `kpis.maintenance` (already
   queried). _Closes C4 and makes it visible._
5. **Operator action** — confirm the `HANDOFF.md` §6.1 credential rotation is complete. **This
   outranks everything above if it is not.**
6. **Verify `connection_limit`** in the Vercel environment. Possibly a one-character fix for
   the binding performance constraint.

### Phase 1 — Reliability (1–2 weeks)

7. **H3 — wire error reporting.** Do this early: it is how you verify everything that follows.
8. **H4** — give the repairs panel its own `<form>`. _Removes a bug, an a11y defect and three
   workarounds._
9. **C3 / B2** — map cleared fields to `null`, not `undefined`.
10. **H8 / B14** — make the lifecycle the only writer of `Vehicle.status`.
11. **B6, B7, B8, B9, B10** — the medium reliability set.
12. **B11, B12** — move the vehicle+gallery unit of work into one transactional service
    function; do the DB delete before destroying Cloudinary assets.
13. **API-3/4/5** — set XHR, Cloudinary SDK and Prisma `transactionOptions` timeouts; map
    Prisma transaction error codes to a comprehensible message.

### Phase 2 — Architecture (2–3 weeks)

14. Split the drawer context from the drawer bodies; back the drawer with a search param (fixes
    UX-2 and enables lazy-loading).
15. Reverse the `components/** → app/**` edges.
16. Consolidate the Decimal boundary behind one conversion and one formatter.
17. State the `lib/` vs `utils/` rule in `AGENTS.md` and move the two or three files that break
    it.
18. Replace English-string error matching with error codes (unblocks translating server errors).

### Phase 3 — Performance / Scalability (2–3 weeks)

19. **H5** — shared vendor chunk. Measure with `next experimental-analyze` before and after.
20. **H6** — decide the caching architecture. **Close the `revalidatePath` gaps in the same
    change** (see Dependencies).
21. Wrap `requireUser` in React `cache()`. _One line._
22. `pg_trgm` GIN indexes + `lower(brand)`. Migration only.
23. Narrow the calendar's reader; make the view switcher a search param; Cloudinary image
    loader; batch and parallelise the image N+1s.
24. Replace the calendar's per-day buttons with one row-level handler (only when fleet size
    justifies it).

### Phase 4 — UX / Accessibility (2 weeks)

25. **H9** — toast, wired to every action's success path; delete the dead `?created=1`.
26. Four dark-theme token values (contrast).
27. Live regions, and move focus to the confirmation heading on booking success.
28. Route the booking modal through `Dialog`; un-nest interactive content from `role="button"`;
    label the two selects.
29. Translate service error messages (depends on step 18).
30. **Notification infrastructure** — a booking confirmation email. This is a business
    decision, not a bug fix, but a customer currently books and hears nothing.

### Phase 5 — Testing / DX (2 weeks)

31. `docker-compose.yml` + a `db:setup` script. _Unblocks local development, integration tests
    and browser verification._
32. **H7** — a migration-integrity test against the CI Postgres.
33. The four highest-value tests: a rejecting limiter query; a double-booking integration test
    that asserts the 409; `parseVehicleFields` round-trip; the RETURN-branch guard.
34. Add `*.test.tsx` + a DOM environment. Guard the integration test against a non-local
    `DATABASE_URL`.
35. Reconcile README with HANDOFF; move incident rules into `AGENTS.md`; raise `jsx-a11y` to
    `error`; pin one Node version.

### Phase 6 — Cleanup (ongoing)

36. Money / date-locale / enum-label standardisation (§ Recommended patterns 2 and 3).
37. Dependency updates as paired commits (`next`+`eslint-config-next`, `react`+`react-dom`);
    re-run `npm outdated` first.
38. Nine dead tokens; `CardAction`/`CardFooter`; the deprecated `priority` prop; `EXIT_MS`; the
    four stale comments; retire the five CSS-substring tests.

---

## Priority matrix

Impact and Effort are 1–5. Priority = the order I would actually do them in.

| #      | Finding                                    | Category             | Sev  | Conf          | Impact | Effort | Risk     |  Pri   |
| ------ | ------------------------------------------ | -------------------- | ---- | ------------- | :----: | :----: | -------- | :----: |
| B3     | Limiter fails closed → staff lockout chain | reliability/security | high | confirmed     |   5    |   1    | low      | **1**  |
| B1     | Booking lost silently on network error     | reliability          | high | confirmed     |   5    |   1    | low      | **2**  |
| —      | Credential rotation complete?              | security             | —    | unknown       |   5    |   1    | none     | **3**  |
| B13    | RETURN branch unchecked → car leaves fleet | reliability          | high | confirmed     |   4    |   1    | low      | **4**  |
| H1     | Open-redirect guard bypassable             | security             | high | confirmed     |   4    |   1    | low      | **5**  |
| —      | Verify `connection_limit`                  | performance          | high | unknown       |   5    |   1    | low      | **6**  |
| H3     | No error reporting                         | observability        | high | confirmed     |   5    |   2    | low      | **7**  |
| H4     | Nested repairs form (4 symptoms)           | reliability/a11y     | high | confirmed     |   4    |   2    | low      | **8**  |
| B2     | Cleared fields silently not saved          | reliability          | high | confirmed     |   4    |   2    | low      | **9**  |
| H10    | Two public endpoints unlimited, uncached   | security/perf        | med  | confirmed     |   4    |   1    | low      | **10** |
| H8     | `Vehicle.status` has no owner              | architecture         | high | confirmed     |   4    |   3    | med      | **11** |
| H9     | No success feedback for any mutation       | UX                   | high | confirmed     |   4    |   2    | low      | **12** |
| H5     | 315 KiB gzip duplicate libraries           | performance          | high | measured      |   4    |   2    | med      | **13** |
| H7     | 4 DB objects invisible to Prisma           | data/ops             | high | confirmed     |   5    |   2    | low      | **14** |
| A1     | Dark-theme contrast (3 failures)           | a11y                 | med  | computed      |   3    |   1    | low      | **15** |
| B6     | Two lifetime-spend figures                 | reliability          | med  | confirmed     |   3    |   2    | low      | **16** |
| B7     | `?page=0` crash screen                     | reliability/UX       | med  | confirmed     |   2    |   1    | low      | **17** |
| B9     | Palette hides every error                  | reliability/UX       | med  | confirmed     |   3    |   1    | low      | **18** |
| B10    | KPI and chart disagree on months           | reliability          | med  | confirmed     |   3    |   2    | low      | **19** |
| API-5  | No timeouts anywhere                       | reliability          | med  | confirmed     |   3    |   2    | low      | **20** |
| B11/12 | Non-atomic image paths                     | data                 | med  | confirmed     |   3    |   3    | med      | **21** |
| H2     | No staff lifecycle / session revocation    | security             | med  | confirmed     |   4    |   4    | med      | **22** |
| A2     | Zero live regions                          | a11y                 | med  | confirmed     |   3    |   2    | low      | **23** |
| H6     | Nothing cached; 22/22 dynamic              | performance          | high | measured      |   4    |   4    | **high** | **24** |
| —      | `docker-compose` + `db:setup`              | DX                   | med  | confirmed     |   4    |   2    | low      | **25** |
| —      | The four highest-value tests               | testing              | high | confirmed     |   4    |   2    | low      | **26** |
| PERF-2 | Eager admin detail graph                   | performance          | med  | measured      |   3    |   4    | med      | **27** |
| —      | Notification infrastructure (email)        | UX/business          | —    | confirmed gap |   5    |   5    | med      | **28** |

`H6` sits at 24 despite high severity because it is an architectural decision with high
regression risk and a hard prerequisite (see below). `H2` and the email work are large but
genuinely important — they are late in the order, not low in value.

## Dependencies

Where order matters:

```
Verify connection_limit ──► H6 (caching architecture) ──► MUST include the revalidatePath gaps
                                                          (dormant today; live bugs once cached)

H3 (error reporting) ──► everything after it
    (you cannot verify a fix you cannot observe)

H4 (repairs form) ──► B4 fixed · A11Y-5 fixed · 3 workarounds deleted   [one fix, four outcomes]

H8 (status ownership) ──► B13 (return check) ──► C4 closed
                      └─► render kpis.maintenance ──► the state becomes visible

docker-compose ──► integration tests runnable ──► H7 (migration-integrity test)
                                              └─► HL-2 (exclusion-constraint 409) verifiable
                                              └─► browser verification of the UX/a11y items

step 18 (error codes) ──► step 29 (translate server errors)
    B16's English-string matching must go first

H5 (shared vendor chunk) ──► measure ──► PERF-2 (split + lazy-load the drawer graph)
    Do not do the harder one first
```

## Do not rewrite

Nothing in this audit justifies a rewrite, and several things argue strongly against one: the
service layer's write discipline, the database-as-authority posture, the date logic (verified
correct), and the rationale documentation. Every recommendation above is **incremental,
independently testable, and reversible**. The three highest-value items are one to three lines
each.

The single biggest risk to this codebase is not its defects — it is a well-intentioned cleanup
pass that strips the comments, splits the cohesive files, and abstracts the patterns that are
already consistent. §"Things that should NOT be changed" exists for that reason.

---

_Audit complete. No application code, configuration, schema or data was modified.
Handoff for continuation: `ALFA_RENT_AUDIT_HANDOFF.md`._
