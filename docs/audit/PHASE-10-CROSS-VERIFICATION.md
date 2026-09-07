# Alfa Rent — Cross-Audit Verification (Phase 10)

**Audit date:** 27 August 2026
**Purpose:** audit the audit. Re-test my own assumptions, hunt defects that exist only in the
_interaction_ between subsystems, remove findings that do not survive scrutiny, and upgrade
those that new evidence strengthens.
**Status:** no code, config, schema or data was modified.

---

## 1. Three new cross-system findings

These are the phase's main output. Each is real, each was verified, and **none of them appears
in Phases 1–9** — because each requires two or three subsystems to be considered together.

### X-1 · Anonymous public traffic can lock every staff member out of the dashboard

**Severity: high · Confidence: chain confirmed structurally**

Four separately-reported findings compose into one failure:

| Link                                                                                                                         | Established in  |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `/api/availability` and `/api/vehicles` are unauthenticated and **unrate-limited**, each doing 2–3 database queries per call | Phase 4 SEC-3   |
| Nothing in the app is cached — all 22 routes are dynamic                                                                     | Phase 6 PERF-10 |
| Production runs through a pooler documented at **`connection_limit=1`**                                                      | Phase 6 §5      |
| `consumeRateLimit`'s `$queryRaw` is **not wrapped in `try`/`catch`**, so a thrown query propagates                           | Phase 3 BUG-3   |

**The chain:** sustained requests to the unlimited endpoint saturate the single pooled
connection → writes to `rate_limits` begin failing or timing out → `consumeRateLimit` **throws**
→ the exception propagates out of `authorize()` → Auth.js reports a failed sign-in → **staff
receive "invalid credentials"** and, because the message is deliberately generic, will conclude
their password is wrong.

I verified each link: `/api/availability/route.ts` has no `consumeRateLimit` call;
`authorize()` has no `try`/`catch` around it; and `rate_limits` is written by **every** login
attempt, booking, checkout and upload signature — making it the most contended table in the
system.

**Why this matters more than its parts.** Read separately, SEC-3 is "add a rate limit",
BUG-3 is "wrap a query", and the pooler setting is a tuning note. Read together, they mean
**the availability of staff sign-in depends on an anonymous endpoint having no protection —
and the component designed to provide that protection is the one that converts load into a
lockout.** A fleet business that cannot sign in cannot hand over a car.

**Recommendation, in dependency order:** (1) wrap the limiter query and fail open, as its own
comment already intends — this alone breaks the chain; (2) verify and raise
`connection_limit`; (3) rate-limit and add `Cache-Control` to both public endpoints.

### X-2 · A vehicle can be silently and permanently removed from the storefront

**Severity: high · Confidence: confirmed**

| Link                                                                                                                                                                                   | Established in |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `updateVehicle` writes `Vehicle.status` with **no invariant check**, and the edit form exposes a status dropdown                                                                       | Phase 3 BUG-14 |
| The RETURN branch of the handover releases the vehicle with `updateMany({ where: { status: "RENTED" } })` and — unlike the PICKUP branch 19 lines above — **does not check the count** | Phase 3 BUG-13 |
| `isPublicBookableVehicleStatus` admits only `AVAILABLE` and `RENTED`; `SERVICE` is excluded from the storefront, availability and booking                                              | Phase 1        |

**The sequence — entirely plausible operationally:**

1. A car is out on rental (`Vehicle.status = RENTED`, reservation `ACTIVE`).
2. It breaks down mid-rental. Staff record that by setting the vehicle to `SERVICE` in the
   edit form. Nothing objects.
3. The customer returns it. Staff record the RETURN inspection. **It succeeds** — the
   reservation becomes `COMPLETED`.
4. The release `updateMany` matches **zero rows** (status is `SERVICE`, not `RENTED`), and the
   count is not checked, so nothing throws.
5. The vehicle is stuck in `SERVICE` — invisible on the public site, unbookable, and earning
   nothing.

**And nothing surfaces it.** I checked:

- The pending banner alerts on pending requests and registration expiry only.
- **No reconciliation check of any kind exists** — I grepped for one.
- `getDashboardData()` **does** count `SERVICE` vehicles (`analytics.service.ts:80`) and
  returns it as `kpis.maintenance`… and the dashboard renders it **zero times**. Every other
  KPI is used. So the one query that would reveal this state is computed, transported, and
  discarded.

**Recommendation.** Check the count on the RETURN branch (one line — BUG-13), and render
`kpis.maintenance`, which is already being paid for. Both are trivial and together they close
the hole and make it visible.

### X-3 · Fixing the caching problem activates a dormant class of bug — sequence matters

**Severity: medium (as a sequencing risk) · Confidence: confirmed**

In Phase 3 §6.4 I **dismissed** the uneven `revalidatePath` coverage as a non-bug, because
`staleTimes.dynamic` has defaulted to 0 since Next 15 and every route is `force-dynamic`, so
pages re-render on every navigation regardless. That dismissal is correct **today**.

But Phase 6 PERF-10's recommendation is to introduce caching. The moment that happens, the
gaps become live staleness bugs:

- `createManualReservationAction` revalidates `/admin/calendar` and `/admin/dashboard` but
  **not** `/admin/reservations`.
- **No action ever revalidates** `/admin/analytics` or `/admin/customers`.
- `POST /api/bookings` — which creates the PENDING reservation staff work from — revalidates
  nothing at all.

**This is a dependency, not a defect:** the revalidation gaps must be closed **in the same
change** that introduces caching, or the caching work ships a set of stale-data bugs. It
belongs in the roadmap as an ordering constraint, and Phase 11 will carry it as one.

---

## 2. Root-cause consolidation

Several separately-reported findings share one cause. Fixing the cause is cheaper than fixing
the symptoms.

### The nested repairs form — one structural fault, four symptoms

Fixing [repairs.tsx](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx>) so it owns its
own `<form>` (effort: small) resolves, at once:

- **Phase 3 BUG-4** — opening the panel blocks saving the vehicle (native validation)
- **Phase 5 A11Y-5** — duplicate `id="description"` sends a label to the wrong control
- **Phase 9 DEBT** — three undocumented workarounds (`stopPropagation`, the scoped
  `querySelectorAll`, the hand-rolled `required` check) exist solely to cope with it
- **Phase 2 §3.6** — the `name="description"` collision that currently works only by DOM order

**This is the highest fix-value-per-unit-of-effort item in the entire audit.**

### `undefined` as "no change" — bounded to exactly two sites

I enumerated every `.update()`/`.updateMany()` in the service layer (12 sites) and checked
whether its `data` can contain `undefined`:

| Site                                                                                  | Verdict                                                                                                        |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `vehicle.service.ts:220` — `data: input` from a `.partial()` schema                   | **Bug** — Phase 3 BUG-2, five fields cannot be cleared                                                         |
| `payment.service.ts:191` — `paidAt`/`failureCode`/`failureMessage` passed as optional | **Bug** — Phase 3 L-3, stale failure text survives a success                                                   |
| `payment.service.ts:140`                                                              | **Not a bug** — my scanner flagged it on field names, but the values are string **literals**. Corrected below. |
| The other 9                                                                           | Fine — all pass explicit literals                                                                              |

**The useful conclusion is the bound:** this class of defect has exactly **two** instances, both
already reported, and **the create paths are unaffected** because `undefined` on create means
`NULL`. So the rule to write down is narrow and checkable: _never spread an optional-typed
object straight into a Prisma `update`._

---

## 3. Findings I am removing or downgrading

Self-correction, with reasons.

| Finding                                                                                              | Action                                          | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment.service.ts:140` as an `undefined`-risk site                                                 | **Removed**                                     | The values are literals. Detector false positive on field names.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| _"Shortening `registrationExpiry` creates an unrecoverable state"_ — a chain I pursued in this phase | **Removed before publishing**                   | I traced it: shortening the expiry does block the pickup inspection, and BUG-2 means the field cannot be _cleared_. But the edit form has a dedicated **renewal** flow (`clearable={false}`, `minDate` enforced), and the error message — _"Renew the vehicle registration before starting this rental"_ — names exactly that action. **The state is recoverable and the guidance is correct.** Not a finding.                                                                                                |
| **Phase 3 BUG-5** — "every calendar bar is one day too wide"                                         | **Downgraded in scope, kept as confirmed**      | The `to === r.returnDate` guard being permanently false is certain — I proved `date-fns` `min()` returns a clone. But whether the resulting width is _visibly_ wrong depends on the intended occupancy convention, which the code does not state. The defensible claim is narrower: **the author wrote two branches and only one is reachable, so the clipped-at-window-edge case and the fully-visible case are rendered identically.** Confirming the visual effect needs the app running with seeded data. |
| Phase 1's concern that float money in analytics loses precision                                      | **Removed** (already dismissed in Phase 3 §6.3) | `Decimal` and the `Number()` path agree to two decimal places even at 365 × 33.33.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Phase 5's first automated pass flagging the booking form's four PII fields as unlabelled             | **Removed** (corrected within Phase 5)          | `FormField` renders `<Label htmlFor={name}>`; my grep could not see across the wrapper.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| An initial reading that `preload` was not a valid `next/image` prop                                  | **Removed** (corrected within Phase 8)          | Next 16 **deprecated `priority` in favour of `preload`**. The codebase is on the current API; I was on the deprecated one.                                                                                                                                                                                                                                                                                                                                                                                    |
| A suspicion that admin tables are clipped rather than scrollable                                     | **Removed** (dismissed within Phase 5)          | `ui/table.tsx` wraps every table in its own `overflow-x-auto` container.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Four of seven N+1 candidates                                                                         | **Removed** (dismissed within Phase 6)          | The analytics ones are `.map()` building an id array for a **single batched** `findMany` — the correct pattern.                                                                                                                                                                                                                                                                                                                                                                                               |
| The uneven `revalidatePath` coverage as a live bug                                                   | **Removed as a bug; re-entered as X-3**         | Correct today; becomes a bug only if caching is introduced.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Nine would-be findings removed across the audit.** Seven were caught inside their own phase;
two here. Every one dissolved for the same two reasons: reading the _installed_ documentation
rather than relying on recollection, or executing the code rather than reasoning about it.

## 4. Findings I am upgrading

| Finding                                                  | From   | To                                    | New evidence                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 3 BUG-3** (limiter fails closed)                 | high   | **high, and now the linchpin of X-1** | It is not only a login-availability bug; it is the link that converts anonymous public load into a staff lockout. Fixing it alone breaks the chain.                                                                                                                                                                                         |
| **Phase 3 BUG-13** (RETURN branch unchecked)             | medium | **high**                              | On its own it is an asymmetry. Combined with BUG-14 and the public status policy (X-2) it silently removes a vehicle from revenue with no alert.                                                                                                                                                                                            |
| **Phase 3 BUG-14** (`updateVehicle` writes status blind) | medium | **high**                              | Same reason — it is the entry point to X-2.                                                                                                                                                                                                                                                                                                 |
| **Phase 7 API-8** (four DB objects invisible to Prisma)  | high   | **high, with a blind guard**          | New observation: if `migrate dev` or `db push` ever drops RLS and the exclusion constraint, **the test suite still passes** — `rls-security.test.ts` greps the migration _files_ — and **CI still passes**, because it applies migrations to a fresh database. The failure would be invisible in exactly the environment where it happened. |
| **Phase 5 UX-1** (no success feedback)                   | high   | **high, with compounding evidence**   | It does not merely annoy: BUG-2 (a save that silently does nothing) and BUG-11 (a retry that creates a duplicate) are both _survivable only because_ nothing confirms success. The missing feedback is why two data bugs went unnoticed.                                                                                                    |

---

## 5. The nine cross-checks

The ones the brief asked for, each with a verdict.

| Cross-check                        | Verdict                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture vs implementation** | **Holds.** The stated rule "all business logic in `services/`" is true for data — 18 of 18 write sites. It is _not_ true for derived rules: four are re-implemented in components, and services leak display formatting outward.                                             |
| **Frontend vs backend**            | **One real divergence.** The client booking schema omits the three date rules the server enforces, so the client accepts input the server rejects — with an English message on an Albanian page. Duplication that has already diverged.                                      |
| **State vs API**                   | **Holds.** URL-as-state is applied consistently to list controls. Two exceptions: the detail drawer (no URL — UX-2) and the view switcher (React state, also causing PERF-3).                                                                                                |
| **API vs database**                | **One gap.** `returnDate > pickupDate` is enforced in Zod only; the exclusion constraint's `WHERE` clause covers just CONFIRMED/ACTIVE, so nothing at the DB level prevents an inverted range on the other three statuses (Phase 7 API-7).                                   |
| **Business logic vs validation**   | **Holds, with one asymmetry.** Server schemas are strict and layered. The client-side checks are subsets of them in three different ways, so every "the server refused" message is untranslated.                                                                             |
| **UX vs actual behaviour**         | **Three divergences, all confirmed.** A save that reports success and changes nothing (BUG-2); a submit button disabled with no reason given (BUG-4, API-3); a search failure rendered as "nothing matches" (BUG-9).                                                         |
| **Tests vs critical flows**        | **Fails.** 0 of 20 confirmed bugs would have been caught. Not a quality problem — an aim problem: the suite tests the pure core, and I independently verified that core is correct.                                                                                          |
| **Security vs authorization**      | **Holds strongly.** All 16 actions guarded, three layers deep, with immediate revocation on every request. The gaps are around the edges: object-level checks on two credential-issuing actions, and no way to _use_ the revocation mechanism that exists.                   |
| **Performance vs architecture**    | **One architectural cause dominates.** A single `cookies()` call in the root layout makes all 22 routes dynamic, which is why nothing is cached, which is why the single pooled connection is the binding constraint. The performance problem _is_ an architecture decision. |

---

## 6. How each conclusion was reached

Because the strength of the audit rests on this:

| Method                     | Applied to                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Executed the real code** | Date/interval logic at boundaries; client-vs-server pricing across both DST transitions; `date-fns` `min()` identity; Zod `.partial()` semantics; the open-redirect guard against six bypass inputs; the i18n dictionary payload; WCAG contrast for both themes — **validated against three known reference values (21.00, 4.48, 8.59)** |
| **Measured build output**  | Per-route client JS from the real chunks and manifests; chunk hashing for duplication; library identification by signature                                                                                                                                                                                                               |
| **Read installed sources** | `react-hook-form`'s `handleSubmit`; Prisma's transaction type declarations; Next 16 docs for `proxy`, `staleTimes`, Server Action CSRF, and the `preload`/`priority` deprecation                                                                                                                                                         |
| **Static reading only**    | Component behaviour, UX flows, most architecture judgements                                                                                                                                                                                                                                                                              |
| **Not verified**           | Runtime metrics; `EXPLAIN` plans; real screen-reader output; the router's cross-origin navigation; production configuration                                                                                                                                                                                                              |

---

## 7. What remains genuinely unverifiable here

Unchanged from where each phase left it, consolidated:

1. **Has the credential-rotation incident in `HANDOFF.md` §6.1 been completed?** Outranks every
   technical finding if not.
2. **Does Vercel replace or append to a client-supplied `x-forwarded-for`?** Decides whether
   the login limiter can be bypassed by rotating a header — and whether X-1 can be triggered
   past the limiter as well as through the unlimited endpoints.
3. **Dependency CVEs** — `npm audit` still unauthorised. `npm ci` reported that
   vulnerabilities exist.
4. **Production configuration** — the real `connection_limit`, whether `PAYMENTS_ENABLED` is
   false, whether Preview and Production env vars are scoped separately, which Node version
   builds, and whether RLS is actually enabled on the live database.
5. **Real cardinality** — fleet size and monthly reservation volume, which decide whether the
   Phase 6 scale walls are near or far.
6. **Five business-rule questions** from Phase 1 §11 that only you can answer.

**Two of these could be settled locally**: Docker is running, so a throwaway `postgres:16`
would let me run the integration test, verify the exclusion-constraint error mapping (Phase 3
HL-2), prove the migration objects exist, and drive the real UI for the browser-dependent
UX/a11y/performance items.

---

## 8. Going into Phase 11

After removals, upgrades and the three new cross-system findings:

| Category                                    |                                                   Count |
| ------------------------------------------- | ------------------------------------------------------: |
| Confirmed bugs                              | **20** (4 → **6** high after upgrades, 9 medium, 5 low) |
| New cross-system findings                   |                            **3** (2 high, 1 sequencing) |
| Security findings                           |                    1 high · 5 medium · 5 low · 2 latent |
| Latent (payments off)                       |                                                       7 |
| Architecture / code-quality findings        |                                    ~30, of which 6 high |
| Performance findings                        |                                                      11 |
| API / data findings                         |                                                       9 |
| Accessibility findings                      |                                             8 confirmed |
| Testing / DX findings                       |                                                     ~15 |
| **Findings removed as unsound**             |                                                   **9** |
| **Items needing your input or environment** |                            **6 + 5 business questions** |
| **Things explicitly protected from change** |               **~50 across §"verified sound" sections** |

The three root causes worth fixing before their symptoms: **the nested repairs form** (four
symptoms), **the unwrapped limiter query** (breaks the X-1 chain), and **`Vehicle.status`
having three writers** (X-2 plus two bugs).

---

_End of Phase 10. No code was modified. Phase 11 (Final Audit & Prioritisation) has not begun._
