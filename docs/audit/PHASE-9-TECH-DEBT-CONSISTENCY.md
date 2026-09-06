# Alfa Rent — Technical Debt & Consistency Audit (Phase 9)

**Audit date:** 27 August 2026
**Method:** read-only. Debt markers, commented-out code and workarounds enumerated by
scanning all 175 source files; dependency currency compared against the versions actually
installed and against the `npm outdated` record in `plans/001` (30 July); competing approaches
counted per concern.
**Status:** no code, config, schema or data was modified.

**Not run:** `npm outdated` and `npm audit`, both of which need the registry and neither of
which is authorised. §2 uses the 30 July record plus locally installed versions instead, and
flags its own staleness.

---

## 1. What is _not_ technical debt

Worth establishing first, because it changes what "debt" means for this project. Measured
across 19,026 lines:

| Marker                                    |                                                                                          Count |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------: |
| `TODO` / `FIXME` / `HACK` / `XXX`         |                                                                                          **0** |
| Commented-out code                        |                                                    **0** — the only match in my scan was prose |
| `any` / `@ts-ignore` / `@ts-expect-error` |                                                                                          **0** |
| `eslint-disable` of any kind              |                                                                                          **0** |
| Circular imports                          |                                                                                          **0** |
| Unused production dependencies            | **0** _(`react-dom` has no source import but is required by the runtime — correctly retained)_ |
| Non-linear or retro-edited migrations     |                                                            **0** — 12 directories, append-only |
| Stray `console.log` / `debugger`          |                                        **0** — six intentional `console` calls, each justified |

I have audited codebases an order of magnitude smaller with more of all of these. **The debt
in this project is not decay — it is (a) frozen dependencies, (b) undocumented workarounds,
and (c) competing approaches to the same problem.** Those three are what follows.

---

## 2. Dependency debt

### DEBT-1 · The caret ranges are decorative; everything is frozen at the lockfile floor

I compared each range against what is actually installed:

| Package               | Range     | **Installed** |
| --------------------- | --------- | ------------- |
| `@hookform/resolvers` | `^5.4.0`  | 5.4.0         |
| `lucide-react`        | `^1.24.0` | 1.24.0        |
| `react-hook-form`     | `^7.81.0` | 7.81.0        |
| `prettier`            | `^3.9.5`  | 3.9.5         |
| `lint-staged`         | `^17.0.8` | 17.0.8        |
| `zod`                 | `^4.4.3`  | 4.4.3         |
| `date-fns`            | `^4.4.0`  | 4.4.0         |
| `@base-ui/react`      | `^1.6.0`  | 1.6.0         |

**Every single one resolves to the floor of its range.** That is correct `npm ci` behaviour —
CI and Vercel both install the lockfile, not the range — but it means the mental model "we use
`^`, so we get patches" is false. Dependencies move only when someone deliberately runs
`npm update`.

### DEBT-2 · Four exactly-pinned packages are behind, and they are the ones that matter

Against the `npm outdated` run recorded in `plans/001` on 30 July (**now four weeks stale**):

| Package              | Pinned at   | Available 30 Jul |
| -------------------- | ----------- | ---------------- |
| `next`               | **16.2.11** | 16.2.12          |
| `eslint-config-next` | **16.2.11** | 16.2.12          |
| `react`              | **19.2.4**  | 19.2.8           |
| `react-dom`          | **19.2.4**  | 19.2.8           |

These four are pinned without a caret — a defensible choice for the framework and runtime,
since floating them silently is worse. But it makes updates a deliberate act that has not
happened in four weeks, and these are precisely the packages where a patch is most likely to
be a security or correctness fix. **Pair `next` with `eslint-config-next`, and `react` with
`react-dom`.**

### DEBT-3 · Deliberate holds — record them as decisions, not debt

- **`next-auth@5.0.0-beta.32`** handles production authentication. This is the right call
  (npm reports v4 as "latest", which would be a downgrade to a different release line), but a
  beta may not receive backported security fixes. **This deserves an explicit written decision
  and a watch on the release notes**, rather than being implicit.
- **`typescript@5.9.3`** with 7.x available — a major compiler migration, correctly isolated.
- **`@types/node@^20`** with 26 available — correctly held to match the declared engine.
- **`overrides` pins `postcss@8.5.19` and `sharp@0.35.0`** — evidence that transitive
  advisories have been handled deliberately before. Good practice; keep the pins documented.

### DEBT-4 · Three Node versions across three environments

`.nvmrc` says `23.5.0` (odd-numbered, non-LTS, **and Vercel does not read `.nvmrc`**);
`engines` says `>=20`; this machine runs 26.6.0. **Nothing pins production** — it is whatever
the Vercel dashboard says. Pick one LTS, put it in all three places.

---

## 3. The real debt: workarounds nobody marked

None of these carries a `TODO`. Most carry a _reason_, which is why they are invisible as debt
— they read as decisions. Some are; some are not.

| Workaround                                                                  | Where                                                                                                                                                                                                                                                                                                                                                                      | Why it exists                                                                                                                                              | Verdict                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setTimeout(…, 0)` around a `setState`                                      | 5 sites: [admin-shell:163](<src/app/(dashboard)/admin/admin-shell.tsx:163>), [pending-queue:38](<src/app/(dashboard)/admin/reservations/pending-queue.tsx:38>), [theme-toggle:23](src/components/shared/theme-toggle.tsx:23), [availability-widget:66](src/components/forms/availability-widget.tsx:66), [detail-drawer:52](src/components/dashboard/detail-drawer.tsx:52) | An ESLint rule forbids synchronous `setState` in an effect; `requestAnimationFrame` was tried and **silently broke two features** in non-painting contexts | **Keep the workaround.** The debt is the _effects themselves_ — three of the five set state that could be derived during render. Fix the effect, and the workaround disappears with it. |
| `onChange={e => e.stopPropagation()}` on a `<section>`                      | [repairs.tsx:113](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:113>)                                                                                                                                                                                                                                                                                          | Stops repair-field edits marking the _vehicle_ form dirty                                                                                                  | **Remove — fix the cause.** All three repairs workarounds exist only because the panel lives inside another form (Phase 3 BUG-4).                                                       |
| `repairFieldsRef.current.querySelectorAll("input[name]")` to build FormData | [repairs.tsx:68](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:68>)                                                                                                                                                                                                                                                                                            | Cannot use the enclosing form's FormData — it belongs to the vehicle                                                                                       | **Remove — same cause.**                                                                                                                                                                |
| Hand-rolled `field.required && !field.value.trim()`                         | [repairs.tsx:74](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:74>)                                                                                                                                                                                                                                                                                            | Native `required` would block the _vehicle_ form's submit                                                                                                  | **Remove — same cause.** _(It doesn't work either: native validation still fires — BUG-4.)_                                                                                             |
| `String(v.pricePerDay)` → `Number(v.pricePerDay)` round trip                | [vehicles/page.tsx:226](<src/app/(dashboard)/admin/vehicles/page.tsx:226>) → [vehicle-grid.tsx:113](<src/app/(dashboard)/admin/vehicles/vehicle-grid.tsx:113>)                                                                                                                                                                                                             | Decimal cannot cross the RSC boundary                                                                                                                      | **Simplify.** Convert to `number` once, as `detail-actions.ts` does everywhere else.                                                                                                    |
| Matching service error text by **English string equality**                  | [extend-reservation.tsx:50-62](<src/app/(dashboard)/admin/reservations/extend-reservation.tsx:50>)                                                                                                                                                                                                                                                                         | Service messages are English literals; the UI needs Albanian                                                                                               | **Remove.** Fragile by construction, and one of four cases already never matches (BUG-16). The real fix is error _codes_.                                                               |
| `error.message.includes("reservations_no_overlap")`                         | [errors.ts:116](src/lib/errors.ts:116)                                                                                                                                                                                                                                                                                                                                     | Prisma does not model the exclusion constraint, so it surfaces as an unknown error                                                                         | **Keep, but test it.** There is no better hook today; the debt is the missing test (Phase 3 HL-2).                                                                                      |
| `Promise.all` instead of `$transaction` for grouped reads                   | 4 sites in `analytics.service.ts`, 1 in `search.service.ts`                                                                                                                                                                                                                                                                                                                | `Prisma.groupBy` loses its types inside `$transaction([...])` — documented in `HANDOFF.md`                                                                 | **Keep.** `search.service.ts` even explains it needs no consistent snapshot. Note the _consequence_ is real though: two analytics readers can report different snapshots (Phase 1).     |
| `mounted` + `setTimeout` before reading the theme                           | [theme-toggle.tsx:18-27](src/components/shared/theme-toggle.tsx:18)                                                                                                                                                                                                                                                                                                        | Theme is unknown during SSR                                                                                                                                | **Keep** — standard `next-themes` pattern.                                                                                                                                              |
| A dummy bcrypt hash for unknown emails                                      | [user.service.ts:29](src/services/user.service.ts:29)                                                                                                                                                                                                                                                                                                                      | Equalise response timing so it cannot be used to enumerate accounts                                                                                        | **Keep — this is not debt, it is a security control.**                                                                                                                                  |

**The pattern worth naming: four of these ten workarounds trace to one root cause** — the
repairs panel being nested inside the vehicle form. Fixing that one structural problem
(Phase 3 BUG-4, effort: small) deletes three workarounds and a confirmed bug at once. **That
is the highest debt-reduction-per-unit-of-work item in the codebase.**

---

## 4. Multiple approaches to the same problem

Counted across the codebase. This is the clearest picture of accumulated inconsistency.

| Concern                                |                          Approaches | Detail                                                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Form submission**                    |                               **5** | `<form action={…}>` + FormData (vehicle, inspection) · RHF + `fetch` (booking) · RHF + `signIn` (login) · manual FormData from a scoped DOM query (repairs) · controlled `useState` object + direct action call (calendar modal) |
| **Client-side validation**             |                               **5** | shared Zod both sides (login) · separate client Zod with a **different rule set** (booking) · imperative pre-check (inspection) · manual DOM `required` scan (repairs) · native HTML validation only (vehicle form)              |
| **Server action result shape**         |                               **4** | `{error} \| undefined` · `{ok:true} \| {error}` · `{signature} \| {error}` · `{data} \| {error}` — and `ActionResult` is declared **identically in two files**                                                                   |
| **Overlay implementation**             |                               **4** | `DetailDrawer` · `CommandPalette` · Base UI `Dialog` (`ConfirmDialog`) · hand-rolled `BookingModal` with no dialog semantics                                                                                                     |
| **UI-preference persistence**          |                               **4** | cookie (sidebar — with a documented reason) · `localStorage` (banner dismissal, queue layout) · URL search params (all list filters) · non-persisted React state (view switcher)                                                 |
| **Money formatting**                   |                               **4** | two `toFixed(2)` helpers · two `toLocaleString(undefined,{maximumFractionDigits:0})` helpers — plus ~16 inline sites                                                                                                             |
| **Enum → label mapping**               | **3 type strategies over 14 sites** | `Record<Enum,TranslationKey>` (exhaustive) · `satisfies Record<string,…>` (**not** exhaustive) · hand-written union casts                                                                                                        |
| **Select styling**                     |                               **3** | a local `selectClass` const · `cn(field, …)` · an inline literal                                                                                                                                                                 |
| **Async read from a client component** |                               **2** | `fetch` to a route handler (availability, booking) · server action as a read (drawer, palette)                                                                                                                                   |
| **Out-of-range URL params**            |                               **2** | per-field `.catch()` (fleet — documented, correct) · `.parse()` that throws (reservations, customers — BUG-7)                                                                                                                    |
| **Guard placement in actions**         |                               **2** | inside the `try` (3 actions) · outside it (12) — with no stated rule                                                                                                                                                             |
| **Date locale selection**              |             **1 pattern, 15 sites** | `locale === "sq" ? sq : enUS` — consistent, purely duplicated                                                                                                                                                                    |

---

## 5. Which of these should actually be standardised

The user asked me to distinguish. Here is the judgement, with the reason each way.

### Standardise — each has a user-visible or compiler-checkable payoff

1. **Money formatting (4 → 1).** Not for tidiness: the _same price renders `45.00 EUR` in the
   fleet table and `45` in the fleet grid, one toggle apart_, and two of the four helpers
   follow the **browser's** locale rather than the app's. This is a correctness-of-display
   problem.
2. **Enum → label maps (14 sites, 3 strategies → 1 exhaustive module).** The payoff is that
   the compiler starts catching what it currently cannot: adding a seventh `VehicleCategory`
   compiles in four files and ships a **blank label**, because `translate()` returns
   `undefined` for a missing key.
3. **Date locale + the 11 unlocalised dates (→ one `getDateLocale` helper).** Removes 15
   duplicated ternaries _and_ fixes the main reservations list and all four chart axes
   rendering English months in an Albanian-default UI.
4. **Out-of-range URL params → `.catch()` everywhere.** The fleet page is already right and
   documents why; the two pages using `.parse()` throw a crash screen on `?page=0`.
5. **Action result shape (4 → 1 `ActionResult<T>`).** Low effort, and it removes a duplicated
   type declaration. Do this _together with_ deciding the guard-placement rule, since both
   change the same call sites.
6. **Overlays (4 → 1 primitive).** This _removes_ an implementation rather than adding an
   abstraction, and it fixes a real accessibility gap (Phase 5 A11Y-3).

### Leave alone — standardising would make it worse

1. **The five form-submission approaches.** Each fits its context: FormData + server action
   for progressive admin forms that must work with a `<form>`; RHF for the public conversion
   form, which needs per-field messages and translated errors; `signIn` for login because
   Auth.js owns it. **Forcing one pattern would mean either losing progressive enhancement in
   the admin or hand-rolling field errors on the public form.** Do not unify.
2. **The client error-display pattern.** `useState<string|null>` + `if (result?.error)` +
   `role="alert"` repeats ~12 times and is **already consistent**. It is the most reliable
   part of the UI. A `useActionError` hook would add indirection and save nothing.
3. **`fetch` vs server action for reads.** A public, potentially cacheable GET and an
   authenticated drawer read are genuinely different problems. Both choices are right.
4. **`Promise.all` vs `$transaction`.** Documented, with a real Prisma limitation behind it.
5. **The 15 duplicated `locale === "sq" ? sq : enUS` lines** — worth a helper (see above), but
   note this one is _duplication without drift_: all 15 agree. It is the cheapest item on the
   list and the least urgent.
6. **The 5 `setTimeout(…, 0)` sites.** They satisfy a real lint rule, and the obvious
   alternative was tried and silently broke things. Fix the unnecessary effects; keep the
   pattern where the effect is genuine.

---

## 6. Do NOT over-engineer

Explicitly, so that a later pass — human or agent — does not "improve" these. Each is a
temptation I considered and rejected.

1. **Do not add a repository/DAL layer over Prisma.** `services/` _is_ that layer, and it is
   already the sole writer (18 of 18 write sites). Another layer would add indirection with no
   new guarantee.
2. **Do not split `reservation.service.ts` (614 lines).** Availability, quoting, creation,
   transitions, extension and calendar reads all operate on one aggregate. Splitting scatters
   one invariant across files.
3. **Do not extract `vehicle-form.tsx`'s cards (642 lines).** 442 of those lines are markup for
   one cohesive form. You would trade a readable file for five files and a props protocol.
4. **Do not add a state-management library.** URL-as-state is working, is shareable, and
   survives refresh. The only state that should move _into_ the URL is the drawer (Phase 5
   UX-2) and the view switcher — both are search params, not a store.
5. **Do not build an i18n framework or extract the dictionary into JSON files.** 549 keys at
   **97.6% utilisation**, `TranslationKey = keyof typeof en` giving compile-time key safety,
   and a test asserting both dictionaries have identical keys. A framework would lose the type
   safety, which is the best property it has.
6. **Do not replace `date-fns`.** Four copies in the bundle is a _chunking_ problem
   (Phase 6 PERF-1); the library is not the fault.
7. **Do not add Redis for rate limiting.** The Postgres choice is documented, is one atomic
   upsert, and is correct at this scale. Add the missing `try/catch` (BUG-3) instead.
8. **Do not roll out a generic `EmptyState` across the four hand-rolled dashed blocks.** They
   are four different sizes for four different layouts; unifying buys a props matrix.
9. **Do not abstract the 15 `normalizeError(error).body.error.message` lines on their own.** A
   wrapper is only worth it if it also settles the guard-placement inconsistency — otherwise
   it is indirection for its own sake.
10. **Do not introduce a design-token generator.** 209 hand-written tokens, many carrying the
    reasoning for their value, are better documentation than any generator would produce.
11. **Do not replace `businessCalendarStart`'s hand-rolled offset computation** with
    `date-fns-tz`. It is correct across DST, documented, and tested in both seasons.
12. **Do not "fix" `src/proxy.ts` back to `middleware.ts`.** It is the current Next 16
    convention; I verified this against the installed docs.

---

## 7. Addendum to Phase 5 — a correction and a new finding

While tracing `stopPropagation` sites I found something my Phase 5 sweep missed. I had
reported "no `onClick` on non-interactive elements anywhere", based on a grep for
`div`/`span`/`li` with the handler on the same line. Two components put the props on separate
lines and were not matched.

**The good news, and my conclusion still holds:** both are **textbook-correct** custom
controls — [reservation-rows.tsx:56-69](<src/app/(dashboard)/admin/reservations/reservation-rows.tsx:56>)
(table) and `:131-144` (card) each carry `role="button"`, `tabIndex={0}`, an `aria-label`,
`onClick`, `onKeyDown` handling Enter **and** Space with `preventDefault`, and a visible
`focus-visible` ring. That is better than most hand-rolled clickable rows.

**The new finding — A11Y-8 · interactive content nested inside `role="button"`.**
Both variants contain `InspectionAction` and `StatusActions` **inside** the
`role="button"` element, with `stopPropagation` on the wrapping cell (and a comment explaining
why). Nesting interactive content inside a `role="button"` is invalid ARIA: the button's
accessible name subsumes the region, and screen readers may not expose the inner controls when
navigating by button.

**Consequence:** a screen-reader user on the reservations list may be unable to reach the
"Start rental" / "Confirm" buttons at all, on the app's busiest staff screen.
**Severity: medium.** **Recommendation:** make the row's _cells_ non-interactive and put the
open-drawer affordance on an explicit control (the customer name as a button or link), rather
than the whole row. That also removes the four `stopPropagation` calls.

---

## 8. Priority

1. **Fix the nested repairs form** (Phase 3 BUG-4). One structural fix removes three
   workarounds and a confirmed bug.
2. **A11Y-8** — nested interactive content in `role="button"`, on the busiest staff screen.
3. **Money formatting and enum→label maps** — the two standardisations with real payoffs
   (wrong display; compiler blindness).
4. **`.catch()` on the two pagination parses** — trivial, removes a crash screen.
5. **`next`/`eslint-config-next` and `react`/`react-dom` patch updates**, as two paired
   commits. Re-run `npm outdated` first — the record I used is four weeks old.
6. **Write down the `next-auth` beta decision** and pin one Node version in all three places.
7. **Date-locale helper + the 11 unlocalised dates**, then the action result shape.
8. **Retire the English-string error matching** in favour of error codes.

---

_End of Phase 9. No code was modified. Phase 10 (Cross-Audit Verification) has not begun._
