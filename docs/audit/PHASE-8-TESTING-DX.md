# Alfa Rent — Testing & Developer Experience Audit (Phase 8)

**Audit date:** 27 August 2026
**Method:** read-only. Every one of the 21 test files read and classified by what it actually
asserts. The suite is then measured against the **20 confirmed bugs from Phase 3** — that is,
by whether it catches real defects, not by percentage coverage.
**Status:** no code, config, schema or data was modified.

---

## 1. What exists

`npm test` → **20 files, 94 tests, all passing, 1.24 s.** (The 21st file is the integration
test, which runs under a separate config and needs a database.)

| Kind                       | Files |  Tests | What it does                                                     |
| -------------------------- | ----: | -----: | ---------------------------------------------------------------- |
| **Behavioural unit tests** |    13 | **76** | Import a module, invoke it, assert on returns or throws          |
| **Source-text assertions** |     7 | **17** | `readFileSync` a source file and assert on substrings or regexes |
| **Integration**            |     1 |      1 | Real Postgres; one concurrency race                              |

The seven source-text files: `prisma/rls-security`, `src/app/brand-logo`,
`src/app/light-theme-tokens`, `src/app/navigation-scroll-reset`, `src/app/scroll-performance`,
`src/app/vehicle-detail-mobile`, `src/services/public-vehicle-boundary`. All seven were added
between 28–30 July 2026 — **after** the last audit, which is why no prior document assesses
them.

The 1.24 s runtime is the tell: **nothing touches a database and nothing renders a
component.**

---

## 2. The decisive measurement

Phase 3 confirmed 20 bugs by tracing or executing the failing path. The right question for a
test suite is not "what percentage of lines does it cover" but **"which of these would it have
caught?"**

**Answer: zero of twenty.**

| Bug                                                         | Would a test have caught it?                                                                                                                                                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-1 booking `fetch` has no `catch`                        | No — no component tests exist, and none can (§4)                                                                                                                                                            |
| BUG-2 clearing an optional vehicle field silently no-ops    | No — `parseVehicleFields` has no test                                                                                                                                                                       |
| BUG-3 rate limiter fails **closed** on a thrown query       | **No — and this is the closest miss.** `rate-limit.test.ts` has 6 tests and covers the adjacent `!row` fail-open branch, but mocks only _resolved_ values. There is no `mockRejected` anywhere in the file. |
| BUG-4 repairs panel blocks saving the vehicle               | No — requires rendered DOM                                                                                                                                                                                  |
| BUG-5 every calendar bar one day too wide                   | No — **and it is structurally untestable**: the faulty expression is inline in a server component's `.map()` (§3)                                                                                           |
| BUG-6 two different lifetime-spend figures                  | No — no service invocation tests                                                                                                                                                                            |
| BUG-7 `?page=abc` throws to the error boundary              | No — no page-level tests                                                                                                                                                                                    |
| BUG-8 palette search race                                   | No                                                                                                                                                                                                          |
| BUG-9 palette swallows every error                          | No                                                                                                                                                                                                          |
| BUG-10 revenue KPI and chart use different month boundaries | No — **the near-miss is instructive**: `reservation-lifecycle.test.ts` tests `businessDayStart` correctly across _both_ DST transitions. Nothing asserts that analytics actually _uses_ it.                 |
| BUG-11 partial commit → duplicate vehicle on retry          | No                                                                                                                                                                                                          |
| BUG-12 delete destroys Cloudinary images                    | No                                                                                                                                                                                                          |
| BUG-13 RETURN branch doesn't verify the vehicle update      | No — the integration test exercises PICKUP only                                                                                                                                                             |
| BUG-14 `updateVehicle` can mark a rented car available      | No                                                                                                                                                                                                          |
| BUG-15 inspection photos silently truncated                 | No                                                                                                                                                                                                          |
| BUG-16 refusal reasons matched by English string equality   | No                                                                                                                                                                                                          |
| BUG-17…20 (low)                                             | No                                                                                                                                                                                                          |

### The important reframe

**This is not a quality problem. It is an aim problem.**

The 76 behavioural tests point almost entirely at the pure-function core: pricing (6),
rental-dates (9), booking-calendar (5), reservation-lifecycle (6), reservation validation (7),
inspection validation (4), payments status/token (5), i18n (5), rate limiter (6), seed safety
(3).

And in Phase 3 I probed that core independently — executing the real modules against boundary
inputs — and **found it correct**: half-open interval semantics hold, `latestUnder` handles
both ceiling cases, client and server pricing agree across both DST transitions, and
`rentalDays` guards its own preconditions.

So the tests are doing their job on what they cover. The problem is that **every confirmed bug
lives in a layer with no tests at all**: server actions, services-with-a-database,
components, and pages.

---

## 3. Test quality

### Genuinely valuable — keep these

1. **`prisma/rls-security.test.ts`** is the best-engineered file in the suite. It derives its
   assertion matrix from `schema.prisma`'s `@@map()` declarations rather than hardcoding a
   table list, so **a new model is automatically covered**. That is the pattern the other
   source-text tests should follow. _(Its limitation is real and belongs to Phase 7 API-8: it
   proves the SQL was **written**, not that RLS is **enabled** on a live database.)_
2. **`src/services/vehicle.service.test.ts`** asserts that `publicVehicleFields` contains none
   of eight named sensitive columns, with the incident that motivated it in the docstring. It
   never invokes a service function — it is a payload-shape guard, and a good one: it would
   catch the exact data leak recurring.
3. **`src/services/public-vehicle-boundary.test.ts`** asserts four public entrypoints import
   `getPublicVehicle*` and not the admin readers, and that the public card never renders
   `vehicle.plate`. A real architecture guard.
4. **`src/utils/rental-dates.test.ts`** (9 tests) and **`reservation-lifecycle.test.ts`**
   (6 tests, including branch midnight across DST) are exactly the right tests for the
   hardest logic in the system.
5. **`seed-safety.test.ts`** tests the guard that stands between a developer and deleting
   production data.

### Brittle in a useless direction

The source-text tests split cleanly into two groups, and it matters which.

**Brittle usefully** — breaks when behaviour regresses: `rls-security`,
`public-vehicle-boundary`, `vehicle.service`.

**Brittle uselessly** — breaks on harmless edits, passes on real regressions:
`scroll-performance`, `light-theme-tokens`, `brand-logo`, `navigation-scroll-reset`,
`vehicle-detail-mobile`. For example
([scroll-performance.test.ts](src/app/scroll-performance.test.ts)):

```js
expect(styles).toContain("contain-intrinsic-size: auto 407px");
expect(styles).not.toContain("filter: blur(90px)");
```

- Fails if Prettier reformats the whitespace, or if the reserved size is tuned from 407 px.
- **Passes** if someone writes `filter: blur(80px)` — a differently-oversized blur, the exact
  problem the test exists to prevent.
- Cannot tell whether scrolling is actually smooth.

They encode _implementation trivia as a contract_. They are also the newest tests in the
repo, which suggests the pattern is spreading.

**Recommendation:** keep the three architecture guards, follow `rls-security`'s
derive-from-source approach, and retire or rewrite the five that assert CSS substrings. Their
intent (don't undo these optimisations) belongs in a code comment — which in this codebase is
a load-bearing artefact — not in an assertion that fires on reformatting.

### Two structural blockers in the test configuration

**TEST-1 · Component tests cannot be discovered even if written.**
[vitest.config.ts:9](vitest.config.ts:9) is
`include: ["src/**/*.test.ts", "prisma/**/*.test.ts"]` — **never `.tsx`**, and no DOM
environment is configured. So a `Button.test.tsx` would be silently ignored, and the entire
component layer — where five of the twenty confirmed bugs live — is untestable without a
config change. Nothing tells you; the file just never runs.

**TEST-2 · The integration config excludes `prisma/`.**
[vitest.integration.config.ts:9](vitest.integration.config.ts:9) is
`include: ["src/**/*.integration.test.ts"]`. A database-backed test placed in `prisma/`
— the natural home for a migration-integrity test (Phase 7 API-8) — would be silently
skipped.

### The integration test: good, and dangerous

[reservation-concurrency.integration.test.ts](src/services/reservation-concurrency.integration.test.ts)
tests one genuinely valuable race — cancel versus pickup-inspection, asserting exactly one
wins and that `Vehicle.status` and the inspection count agree with the outcome. That is the
right kind of test.

But it **unconditionally inserts a User, Customer, Vehicle and Reservation into whatever
`DATABASE_URL` names**, with no production guard — unlike the seed, which refuses to run
without an explicit destructive acknowledgement and two strong passwords. Pointing it at
production would write real rows and could trip the exclusion constraint against a real
booking. The asymmetry is the finding: the destructive seed is carefully gated; the
destructive test is not.

---

## 4. Coverage gaps, ranked by what they would catch

| Gap                                                                              |                           Tests today | Bugs it would have caught                                |
| -------------------------------------------------------------------------------- | ------------------------------------: | -------------------------------------------------------- |
| **Server actions** (16, all guarded)                                             |                                 **0** | BUG-2, BUG-11, BUG-16                                    |
| **Auth & RBAC** — `requireUser`, `requireRole`, `verifyCredentials`, `authorize` |                                 **0** | the SEC-1 redirect bypass, BUG-3                         |
| **Services against a real database**                                             |                          1 (one race) | BUG-6, BUG-12, BUG-13, BUG-14                            |
| **Components / pages**                                                           |        **0, and impossible** (TEST-1) | BUG-1, BUG-4, BUG-7, BUG-8, BUG-9, BUG-15                |
| **The exclusion-constraint → 409 mapping**                                       |                                     0 | Phase 3 HL-2 — the substring match on a Postgres message |
| **Migration integrity in a live DB**                                             |                   0 (only file greps) | Phase 7 API-8                                            |
| **E2E / browser**                                                                |                                     0 | the whole booking funnel                                 |
| **`businessWeekStart` / `businessMonthStart`**                                   | 0 (only `businessDayStart` is tested) | BUG-10                                                   |

**The highest-value four tests to write**, in order:

1. **`consumeRateLimit` with a rejecting `$queryRaw`.** One `mockRejected` line in a file that
   already exists. Catches BUG-3, which currently makes a database blip lock out all staff.
2. **A migration-integrity test against the CI Postgres** asserting the exclusion constraint,
   `btree_gist`, RLS and both CHECKs exist via `pg_constraint`/`pg_class`. CI already runs
   `postgres:16` and `migrate deploy`, so this is nearly free — and it protects the two things
   the system most depends on.
3. **A double-booking integration test** that confirms two concurrent PENDING→CONFIRMED
   transitions produce exactly one success **and a 409 through `normalizeError`** — closing
   both HL-2 and the untested headline invariant.
4. **`parseVehicleFields` + `updateVehicleSchema` round-trip**, asserting that an emptied
   optional field actually clears. Catches BUG-2, and needs no database.

---

## 5. A correction, and what it revealed

While auditing `scroll-performance.test.ts` I saw it assert `preload={index === 0}` and
`preload={preload}`, and started writing this up as a bug: `next/image` uses `priority`, not
`preload`, so I suspected the optimisation was a no-op that the test had enshrined.

**I was wrong.** The installed Next 16 docs are explicit:

> _"Starting with Next.js 16, the `priority` property has been deprecated in favor of the
> `preload` property in order to make the behavior clear."_
> — `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:293`

The codebase is on the current API and my recollection was on the deprecated one. This is
exactly what `AGENTS.md` warns about, and it is worth recording as a method note: **five of my
would-be findings across this audit dissolved on checking the installed documentation or
executing the code.**

It does flip into one small real finding, though:

**DX-1 · One image still uses the deprecated prop.**
[car/[slug]/page.tsx:128](<src/app/(website)/car/[slug]/page.tsx:128>) uses `priority`, while
five other sites (`vehicle-card`, `brand-logo`, `car/page`, `login`, `site-header`) use the
current `preload`. `AGENTS.md` says _"Heed deprecation notices."_ **Severity: low**, effort:
one word.

---

## 6. Developer experience

I am in an unusually good position to assess this: **I arrived at this repository today
knowing nothing about it.** What follows is what actually happened, not what I imagine might.

### The setup path, as lived

1. **`node_modules` was absent.** Nothing in the repo signals that; `npm run dev` would simply
   fail. Minor, but it is step zero.
2. **There is no `.env` and no way to create a working one from the repo alone.**
   `.env.example` is good — well commented, no real values, explicit warnings — but
   `DATABASE_URL` needs a database that does not exist yet.
3. **No local Postgres is installed**, and `README.md` assumes one (`createdb alfa_rent`).
   There is **no `docker-compose.yml`**, so "get a database" is an unscripted, undocumented
   step on the developer's own machine.
4. **`npx prisma migrate dev` — which the README tells you to run — is forbidden.**
   `HANDOFF.md` states it needs a TTY, will not work here, and that every migration was
   hand-written for that reason. **The README and the HANDOFF contradict each other**, and the
   rule lives in neither `AGENTS.md` nor `CLAUDE.md`, where tooling and agents would see it.
5. **The only way to get data is a destructive seed** requiring three environment variables
   including two distinct 16-character passwords. The gate is _correct_ — but it means a new
   developer's first successful run of the app is behind a command they must assemble by hand
   from prose.

**Net: a developer can run `lint`, `typecheck`, `test` and `build` within minutes of cloning —
which is genuinely good — but cannot see the application run without solving an
undocumented database problem first.** Everything except `/login` needs data.

### Scripts and tooling

|                             |                                                                                                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Good**                    | `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:integration`, `db:seed`, `vercel-build`. `postinstall` runs `prisma generate`. Pre-commit runs `lint-staged && npm run typecheck` — **typechecking on every commit** is better than most projects.    |
| **Missing**                 | No `format` script, though the README documents `npx prettier --write .` — **and there is no `.prettierignore`**, so that documented command would reformat `package-lock.json` and all six root audit documents. No `db:migrate`, no `db:studio`, no `db:reset`. |
| **`.vscode/settings.json`** | Contains exactly one setting — suppressing a _Postman extension_ notification. No format-on-save, no ESLint integration, no `extensions.json`. It is tracked but contributes nothing.                                                                             |
| **Node version**            | **Three different versions across three environments**: `.nvmrc` says `23.5.0` (an odd-numbered, non-LTS release, and Vercel does not read `.nvmrc`), `engines` says `>=20`, this machine runs 26.6.0. Nothing pins production.                                   |

### Debugging affordances

- **No error reporting.** `console.error` in four places; both error boundaries surface a
  `digest` for correlation, which is the right groundwork — but there is nothing to correlate
  _against_. This has been the top item in `HANDOFF.md` §6 since 17 July.
- **No structured logging**, no request ids, no timing.
- **`prisma.$on("query")` is not wired**, and the client logs only `warn`/`error` in
  development — so there is no way to see the 19 queries a calendar page fires without adding
  code.
- **`vercel logs <url> --json` is documented in `HANDOFF.md`** as the diagnosis route, with
  the reason (Vercel env vars are marked Sensitive, so `vercel env pull` returns empty
  strings). That is a genuinely useful, hard-won note.

### Documentation

The documentation is **unusually substantial and unusually good on rationale** — `HANDOFF.md`
§3 ("conventions that have bitten before") and §4 ("deliberate decisions — do not fix these")
are the reason this audit moved as fast as it did. But it has drifted and it now contradicts
itself:

| Problem                            | Detail                                                                                                                                                                                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contradiction**                  | README says run `prisma migrate dev`; HANDOFF says it cannot run and never has                                                                                                                                                                           |
| **Stale stack**                    | README lists **Framer Motion** — absent from `package.json`, `node_modules` and all source                                                                                                                                                               |
| **Stale structure**                | README documents `src/hooks/` — does not exist                                                                                                                                                                                                           |
| **Stale counts**                   | HANDOFF says 19 tests; `plans/001` says 17 files / 82 tests; reality is 20 / 94                                                                                                                                                                          |
| **Stale findings**                 | Both audit documents list issues since fixed (slug collisions, dead service, `middleware.ts`) alongside issues still open, with no way to tell which is which                                                                                            |
| **Six overlapping root documents** | `README`, `AGENTS`, `CLAUDE`, `HANDOFF`, `AUDIT_REPORT`, `PERFORMANCE_AUDIT`, plus two `plans/` — with no index and no dates in most filenames                                                                                                           |
| **`AGENTS.md` is 5 lines**         | It contains the single most important operating rule (read the local Next docs) but **not** the rules that have actually caused incidents: never `migrate dev`, never proxy uploads, Decimal cannot cross the boundary. Those live only in `HANDOFF.md`. |

### CI

Genuinely strong and correctly ordered: `npm ci` → `lint` → `tsc --noEmit` → `test` →
`prisma migrate deploy` (against a real `postgres:16` service) → `test:integration` →
`build`. Migrations are exercised against a real database on every push.

**Two gaps:** the ESLint a11y rules are all severity 1, so they can never fail CI
([Phase 5 A11Y-6](docs/audit/PHASE-5-FRONTEND-UX-A11Y.md)); and nothing verifies the
database objects that `schema.prisma` does not model (Phase 7 API-8), even though the
infrastructure to do so is already running.

---

## 7. What would confuse a developer joining tomorrow?

In the order they would hit it:

1. **"How do I get a database?"** — the single biggest blocker. No compose file, no script,
   and the README's `prisma migrate dev` instruction is one the project forbids.
2. **"Which document is true?"** Six root documents, two of them audits with a mix of fixed
   and open findings, one contradicting the README.
3. **"Why is there no `asChild`?"** shadcn here is the **Base UI** flavour. This is documented
   in `HANDOFF.md` §3 — and it is the kind of thing that costs an afternoon if unread.
4. **"Why does my `Decimal` break on the client?"** Documented, and the docstrings at the
   boundary are excellent — but only if you find them before you hit it.
5. **"Why did my `.test.tsx` not run?"** It is silently excluded (TEST-1). Nothing errors.
6. **"Did my save work?"** No admin mutation gives success feedback
   ([Phase 5 UX-1](docs/audit/PHASE-5-FRONTEND-UX-A11Y.md)) — so a developer testing their own
   change cannot tell whether it landed, which is how BUG-2 survived.
7. **"Why is `setTimeout(…, 0)` everywhere?"** An ESLint rule forbids sync `setState` in an
   effect, and `requestAnimationFrame` was tried and silently broke things. Documented in
   `HANDOFF.md`; invisible at the call sites.
8. **"Which Node version?"** Three answers.

**The fix for most of this is small and concentrated:** a `docker-compose.yml` plus a
`db:setup` script, a corrected README, and moving the incident-derived rules from `HANDOFF.md`
into `AGENTS.md`. That would collapse items 1, 2, 3, 4, 7 and 8.

---

## 8. Priority

1. **Unblock local development** — `docker-compose.yml` + a `db:setup` script that creates,
   migrates and seeds a throwaway database. Fixes the largest onboarding cost and makes
   integration tests and browser verification routine.
2. **Fix the README/HANDOFF contradiction** and move the incident rules into `AGENTS.md`.
3. **Write the four highest-value tests** (§4) — one of them is a single `mockRejected` line
   guarding a bug that can lock out all staff.
4. **TEST-1** — add `*.test.tsx` and a DOM environment so the component layer becomes testable
   at all.
5. **Guard the integration test** against a non-local `DATABASE_URL`, matching the seed's gate.
6. **Wire error reporting.** Open since 17 July, blocks any claim of production readiness, and
   the error boundaries are already prepared for it.
7. **Retire the five CSS-substring tests**; keep and extend the three architecture guards.
8. **Raise the a11y lint rules to `error`**; pin one Node version; add `.prettierignore`;
   **DX-1** (one deprecated `priority` prop).

---

_End of Phase 8. No code was modified. Phase 9 (Technical Debt & Consistency) has not begun._
