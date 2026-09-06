# Alfa Rent — Code Quality & Architecture Audit (Phase 2)

**Audit date:** 27 August 2026
**Scope:** maintainability, complexity, architecture, reusability. Correctness bugs,
security, performance, UX/a11y and testing each have their own later phase.
**Method:** read-only. Seven parallel dimension finders plus my own direct reading.
**Verification note:** the adversarial verification pass was lost to a service session
limit, so **I re-verified every high-severity finding below against the code myself**.
Anything I could not personally confirm is marked as such and demoted.
**Status:** no code, config, schema or data was modified.

---

## How to read this

Severity is about consequence, not tidiness. Confidence is about evidence.

|                |                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **High**       | Something concrete goes wrong for an operator, a customer, or the next developer — today or on the next ordinary change. |
| **Medium**     | Real defect with a bounded blast radius, or drift that has already started.                                              |
| **Low**        | True, worth fixing when nearby, harmless if left.                                                                        |
| **Preference** | My taste, not a defect. Listed honestly and **not** to be treated as a work item.                                        |

Several things that look wrong are deliberate and documented. They are in §8, and they
should not be "cleaned up".

---

## 1. Confirmed problems — high severity

### 1.1 The repairs panel lives inside the vehicle form's `<form>`, and blocks saving it

- **Category:** coupling · **Severity:** high · **Confidence:** confirmed (verified directly)
- **Where:** [repairs.tsx](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx>) rendered at [vehicle-form.tsx:306](src/components/forms/vehicle-form.tsx:306), inside the `<form>` opened at [:126](src/components/forms/vehicle-form.tsx:126) and closed at `:564`
- **Symbol:** `RepairsPanel` / `VehicleForm`

`RepairsPanel` has no `<form>` of its own. Its inputs are children of the vehicle form,
and it copes with that through **three undocumented workarounds**: it builds its payload
with a scoped `repairFieldsRef.current.querySelectorAll("input[name]")` instead of the
form ([repairs.tsx:68-85](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:68>)),
it re-implements required-field checking by hand (`field.required && !field.value.trim()`),
and it puts `onChange={(event) => event.stopPropagation()}` on its `<section>` so typing
a repair does not mark the vehicle form dirty. Not one of the three carries a comment.

**Consequence — two of them, both reachable:**

1. `<form>` at `vehicle-form.tsx:126` has **no `noValidate`**, so native browser validation
   runs across every constrained field in the form. The repair `cost` and `description`
   inputs are `required` and render whenever the panel is open
   ([repairs.tsx:150](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:150>)).
   **Open the repairs panel, don't fill it in, click Save vehicle → the browser refuses to
   submit and points at a field in a panel the operator was not editing.**
2. `name="description"` and `id="description"` exist **twice in one form** — the vehicle's
   textarea at `vehicle-form.tsx:295` and the repair's input at `repairs.tsx:181`.
   `formData.get("description")` returns the first in DOM order, so the vehicle wins
   **only because the textarea happens to come first**. Move the panel up and saving a
   vehicle silently writes the repair text into the vehicle description.

**Recommendation:** give `RepairsPanel` its own `<form>` (it already builds its own
`FormData` and calls its own action, so nothing else changes), or at minimum rename its
fields to `repair-*` and add `noValidate` to the vehicle form. Then delete the three
workarounds. Effort: small.

### 1.2 `Vehicle.status` has three writers, three rules, and no owner

- **Category:** architecture · **Severity:** high · **Confidence:** confirmed
- **Where:** [vehicle.service.ts:216](src/services/vehicle.service.ts:216) · [inspection.service.ts:140,159](src/services/inspection.service.ts:140) · [vehicle.service.ts:246](src/services/vehicle.service.ts:246)

`Vehicle.status` is a stored second source of truth for "is this car out". Three places
write it: `recordRentalInspection` flips `AVAILABLE→RENTED` and back inside the handover
transaction with `count !== 1` guards; `deleteVehicle` soft-retires to `INACTIVE`; and
`updateVehicle` is a bare `prisma.vehicle.update({ data: input })` where `input` includes
`status`, **with no invariant check of any kind**.

**Consequence:** an admin editing a car that is currently out on rental can set it back to
`AVAILABLE` from the vehicle form. The double-booking constraint still protects the
calendar, but the fleet then reports a rented car as available, and the return
inspection's `updateMany({ where: { status: "RENTED" } })` silently matches zero rows —
which, unlike the pickup branch 19 lines above, is **not** checked
([inspection.service.ts:159](src/services/inspection.service.ts:159)).

**Recommendation:** make the lifecycle the only writer of `status`. Either remove `status`
from `updateVehicleSchema` and give it its own guarded action, or have `updateVehicle`
reject a status change that contradicts an open reservation. Effort: medium. _(The
unchecked return-branch update is a bug — handed to Phase 3.)_

### 1.3 The same customer has two different "lifetime spend" figures, one click apart

- **Category:** duplication · **Severity:** high · **Confidence:** confirmed (verified directly)
- **Where:** [reservation-detail.tsx:180,411](<src/app/(dashboard)/admin/reservation-detail.tsx:180>) vs [customer-detail-body.tsx:22,31](<src/app/(dashboard)/admin/customer-detail-body.tsx:22>)

Both drawers sum `totalPrice` over `ACTIVE`/`COMPLETED` reservations. They disagree three
ways:

|             | Reservation drawer                                                                 | Customer drawer                                                            |
| ----------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Rows summed | `take: 20` ([reservation.service.ts:535](src/services/reservation.service.ts:535)) | `take: 50` ([customer.service.ts:75](src/services/customer.service.ts:75)) |
| Format      | `spend.toFixed(2)` → `1234.00 EUR`                                                 | `Math.round(spend)` → `1234 EUR`                                           |
| Label       | none                                                                               | `t("admin.lifetime")` — "Lifetime" / "Gjithsej"                            |

**Consequence:** for any customer with more than 20 rentals the two figures are **different
numbers for the same thing**, and the one explicitly labelled "Lifetime" is itself capped
at 50. A repeat-customer figure that silently truncates is a wrong number on a screen
staff use to judge a customer.

**Recommendation:** compute customer spend in one service function with a database
aggregate (`_sum`), not from a truncated `include`. Return it as one named field both
drawers render. Effort: small.

### 1.4 The command palette turns every search failure into "nothing matches"

- **Category:** inconsistency · **Severity:** high · **Confidence:** confirmed (verified directly)
- **Where:** [command-palette.tsx:133](<src/app/(dashboard)/admin/command-palette.tsx:133>)
- **Symbol:** the debounced search effect

```
setHits("error" in result ? [] : result.hits);
```

**Consequence:** this is the **only place in the codebase that discards an error**. Every
other failure path surfaces a message. A revoked session, a database fault, or a
`ForbiddenError` all render as an empty result list, so an operator whose session died
is told their search found nothing instead of being sent to sign in.

**Recommendation:** keep the error in state and render it in the palette's result area,
matching the pattern the other twelve client components already use. Effort: trivial.

### 1.5 Enum→label maps are written 14 times in three type styles; five of them can render blank

- **Category:** duplication · **Severity:** high · **Confidence:** confirmed (verified directly)
- **Where:** `CATEGORY_KEYS` at [vehicle-card.tsx:10](src/components/shared/vehicle-card.tsx:10), [fleet-filters.tsx:23](src/components/forms/fleet-filters.tsx:23), [hero-search.tsx:13](src/components/forms/hero-search.tsx:13), [booking/page.tsx:12](<src/app/(website)/booking/page.tsx:12>), [car/[slug]/page.tsx:24](<src/app/(website)/car/[slug]/page.tsx:24>); plus casts at [vehicle-form.tsx:247,376](src/components/forms/vehicle-form.tsx:247), [vehicle-filters.tsx:125](<src/app/(dashboard)/admin/vehicles/vehicle-filters.tsx:125>), [vehicle-grid.tsx:94](<src/app/(dashboard)/admin/vehicles/vehicle-grid.tsx:94>), [calendar-timeline.tsx:345](src/components/dashboard/calendar-timeline.tsx:345)

The five `CATEGORY_KEYS` literals are byte-identical in content but carry **three different
type strategies**: two are `Record<VehicleCategory, …>` (exhaustive), one is
`satisfies Record<PublicVehicle["category"], …>` (exhaustive), and two are
`Record<string, TranslationKey>` — which erases exhaustiveness entirely. Five further
sites skip the map and cast a template literal to a hand-written union.

**Consequence — I verified the runtime behaviour:** `translate()` is
`const text = dictionary[key]; if (!values) return text;`
([translations.ts:1206](src/lib/i18n/translations.ts:1206)). A missing key returns
`undefined` and React renders **nothing**; a missing key _with_ interpolation values
**throws a TypeError**. So adding a seventh `VehicleCategory` breaks the build in three
files (correct), and in the other four compiles cleanly and ships a **silently blank
category label** — including a blank `<option>` in the admin vehicle form.

**Recommendation:** export one `CATEGORY_KEYS` / `FUEL_KEYS` / `TRANSMISSION_KEYS` /
`VEHICLE_STATUS_KEYS`, each typed `Record<VehicleCategory, TranslationKey>`, from a module
beside `translations.ts`; import at all sites; delete every cast and every
`transmission === "AUTOMATIC" ? … : …` ternary (six sites). This is the one consolidation
here that makes the compiler do work it currently cannot. Effort: small.

### 1.6 Albanian visitors never see a vehicle's real description

- **Category:** architecture · **Severity:** high · **Confidence:** confirmed (verified directly)
- **Where:** [vehicle-content.ts:9-22](src/lib/i18n/vehicle-content.ts:9) · consumed at [car/[slug]/page.tsx:59,86](<src/app/(website)/car/[slug]/page.tsx:59>)

`Vehicle.description` is a single database column holding English text. Albanian rendering
works by looking that exact English string up in `ALBANIAN_DESCRIPTIONS` — a hardcoded map
with **one entry** — and otherwise falling back to a generic sentence built from brand and
model, discarding the description entirely.

**Consequence, measured:** the seed catalogue ships **44 vehicles with 38 distinct
blurbs**, and the map covers exactly one of them. On the Albanian site — **which is the
default locale** — **43 of 44 vehicles display the identical generic sentence**. Whatever
staff write in the admin description field is invisible to the default audience. The same
string is also the page's `<meta name="description">`, so 43 vehicle pages ship
near-identical meta descriptions. `vehicle-content.test.ts` passes because it tests the
one mapped string.

**Recommendation:** this is a data-model question, not a lookup-table question — the
product needs `descriptionEn` / `descriptionSq` columns (or a `VehicleTranslation` table)
and two fields in the vehicle form. Until then the honest fallback is to show the English
description rather than a sentence that is not about the car. Effort: medium.

---

## 2. Architectural concerns

### 2.1 `src/components/**` imports from `src/app/**` at six sites

- **Category:** coupling · **Severity:** medium · **Confidence:** confirmed (verified directly)

| Importer                                                                      | Imports from `app/`                      |
| ----------------------------------------------------------------------------- | ---------------------------------------- |
| [calendar-timeline.tsx:7,8](src/components/dashboard/calendar-timeline.tsx:7) | `calendar/actions`, `reservation-detail` |
| [schedule-list.tsx:8](src/components/dashboard/schedule-list.tsx:8)           | `reservation-detail`                     |
| [vehicle-form.tsx:26,27](src/components/forms/vehicle-form.tsx:26)            | `vehicles/actions`                       |
| [language-selector.tsx:6](src/components/shared/language-selector.tsx:6)      | `locale-actions`                         |

The dependency graph is otherwise clean — I verified **zero** `services→app`, `lib→app`,
`services→components` edges, and `src/utils` is a perfect leaf with no internal imports.
But `components/dashboard/` is not a shared component library: it is part of the admin
feature, split across two directories, and the 469-line route file
`reservation-detail.tsx` exports the admin's **global drawer context**.

**Consequence:** you cannot move or rename an admin route module without breaking a
"shared" component, and `components/dashboard/*` cannot be reused or tested independently.
`calendar-timeline.tsx` has exactly one consumer and depends on two route-local modules —
it is a route component in the wrong folder.

**Recommendation:** move the drawer context to `src/components/dashboard/` (or
`src/lib/`) so the arrow points one way, and move single-consumer route components next to
their route. Do **not** invent a new layer for this. Effort: medium.

### 2.2 `reservation-detail.tsx` is three modules in one file

- **Category:** cohesion · **Severity:** medium · **Confidence:** confirmed

469 lines holding (a) the drawer React context and provider `:46-161`, (b) the drawer host,
and (c) a 300-line `ReservationBody` `:165-469`. `AdminShell` imports the provider, so
every admin route pulls the entire detail graph — and there are **zero dynamic imports**
anywhere in the app.

**Consequence:** the structural problem is that a context provider and a large presentational
body cannot be changed, reviewed, or loaded independently. The bundle consequence is real
but belongs to Phase 6.

**Recommendation:** split into `detail-context.tsx` (provider + hook) and
`reservation-body.tsx`. That alone makes lazy-loading possible later without forcing it now.
Effort: small.

### 2.3 `lib/` and `utils/` have no distinguishing rule

- **Category:** architecture · **Severity:** medium · **Confidence:** confirmed

`src/utils/` holds `pricing.ts`, `rental-dates.ts`, `vehicle.ts`. `src/lib/` holds real
modules (`auth/`, `db/`, `cloudinary/`, `payments/`, `validations/`, `i18n/`) **and**
five pure domain modules that are indistinguishable from the `utils/` three:
`reservation-lifecycle.ts`, `vehicle-policy.ts`, `booking-calendar.ts`, `errors.ts`,
`site-config.ts`.

**Consequence:** there is no rule that tells the next developer where a new pure helper
goes, so it goes wherever. Note this is a _filing_ problem, not a correctness one — and
`reservation-lifecycle.ts` / `booking-calendar.ts` being pure and dependency-free is
deliberate and good, because client components import them.

**Recommendation:** pick one rule and state it in `AGENTS.md` — the cheapest is "`utils/`
is for pure, domain-free helpers; `lib/` is for anything with a dependency or a domain
concept" — then move the two or three files that break it. Do not restructure further.
Effort: small.

### 2.4 The unit of work for "save a vehicle with its gallery" lives in the route layer

- **Category:** cohesion · **Severity:** medium · **Confidence:** confirmed
- **Where:** [vehicles/actions.ts:93-95](<src/app/(dashboard)/admin/vehicles/actions.ts:93>)

`createVehicleAction` calls `createVehicle(input)` and then `syncVehicleImages(id, images)`
as two separate service calls. The invariant "a vehicle and its gallery save together" is
therefore expressed in the action, where the service layer cannot enforce it.

**Consequence:** if `syncVehicleImages` throws, the vehicle row already exists and the
operator sees an error — a partial commit the service layer is structurally unable to
prevent. _(The atomicity failure itself is a Phase 3 bug; the placement is the Phase 2
finding.)_

**Recommendation:** add `createVehicleWithImages` to the service layer and let the action
call one thing. Effort: medium.

### 2.5 The `Prisma.Decimal` → client boundary has no owner

- **Category:** architecture · **Severity:** medium · **Confidence:** confirmed (verified directly)

The rule "Decimal never crosses the boundary" is real and universally obeyed — but it is
obeyed by roughly 35 hand-written conversions scattered across the outermost layer, in
**two incompatible conventions**. The clearest demonstration is one screen:

| Same price, same page | Code                                                                                                                                                                                                  | Renders     |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Fleet **table** view  | [vehicles/page.tsx:106](<src/app/(dashboard)/admin/vehicles/page.tsx:106>) `Number(v.pricePerDay).toFixed(2)} EUR`                                                                                    | `45.00 EUR` |
| Fleet **grid** view   | [page.tsx:226](<src/app/(dashboard)/admin/vehicles/page.tsx:226>) `String(v.pricePerDay)` → [vehicle-grid.tsx:113](<src/app/(dashboard)/admin/vehicles/vehicle-grid.tsx:113>) `Number(v.pricePerDay)` | `45`        |

**Consequence:** the same car's price is formatted two different ways on one page,
switched by a toggle. The grid also converts Decimal→string→number for no reason.

**Recommendation:** one `toPlainMoney()` at the service/action boundary and one
`formatEur(value)` for rendering (see §3.1). Effort: large if done exhaustively; do it
incrementally, one screen at a time.

---

## 3. Duplication that has already drifted

Duplication is only worth removing when it has consequences. These have them.

### 3.1 Money is formatted four ways, and two ignore the app's locale

- **Severity:** medium · **Confidence:** confirmed
- `toFixed(2)` → `1234.00 EUR` at [reservation-detail.tsx:163](<src/app/(dashboard)/admin/reservation-detail.tsx:163>), [customer-detail-body.tsx:12](<src/app/(dashboard)/admin/customer-detail-body.tsx:12>)
- `toLocaleString(undefined, {maximumFractionDigits: 0})` → `1,234 EUR` at [vehicle-detail-body.tsx:20](<src/app/(dashboard)/admin/vehicle-detail-body.tsx:20>), [repairs.tsx:33](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:33>)

`undefined` as the locale means **the browser's** locale, not the app's — so the same
figure renders differently depending on the viewer's OS settings, in an app that otherwise
controls its locale explicitly. There is no `Intl.NumberFormat` anywhere in the repo.

**Recommendation:** one `formatEur(value, { precision })` taking the app locale. Effort: small.

### 3.2 Eleven user-facing dates are unlocalized — and five are produced inside services

- **Severity:** medium · **Confidence:** confirmed (measured directly)

I counted every `format()` call: **40 of 59 pass a `locale`; 19 do not.** Eight of the 19
are machine formats (`"yyyy-MM-dd"`, `"d"`) and correctly locale-free. The remaining
**eleven are user-facing**:

- [reservation-rows.tsx:79,80,161,162](<src/app/(dashboard)/admin/reservations/reservation-rows.tsx:79>) — the main reservations list, both table and card views
- [vehicle-form.tsx:428](src/components/forms/vehicle-form.tsx:428) — registration expiry
- [reservation.service.ts:35](src/services/reservation.service.ts:35) — `day()`, used inside **error messages shown to users**
- [analytics.service.ts:37,47,334,390](src/services/analytics.service.ts:37) — **all four chart axis label generators**

**Consequence:** on the Albanian dashboard (the default) the reservations list and every
chart axis read in English. Separately, five of these sit **inside the service layer**,
which should not be producing display strings at all — the same
separation-of-concerns problem as §2.5.

**Recommendation:** a `getDateLocale(locale)` helper (this also removes the 15 repeated
`locale === "sq" ? sq : enUS` lines), and move label formatting out of
`analytics.service.ts` into the chart components. Effort: small.

### 3.3 The Cloudinary uploader is implemented twice and has already diverged

- **Severity:** medium · **Confidence:** confirmed (agent-found, spot-checked)
- **Where:** [media-grid.tsx:161-240](src/components/forms/media-grid.tsx:161) vs [inspection-photo-upload.tsx:27-152](<src/app/(dashboard)/admin/reservations/inspection-photo-upload.tsx:27>)

~110 lines of parallel code across four layers: the same six-field `FormData` POST to the
same Cloudinary URL with the same success predicate; identical `patch()` and `remove()`
helpers; the same `ACCEPTED` and `MAX_BYTES` constants (but the rationale comment on only
one copy); near-identical Zod receipt schemas and JSON parse guards
([image.ts:20,39](src/lib/validations/image.ts:20) vs [inspection.ts:6,43](src/lib/validations/inspection.ts:6));
and two separate translation-key pairs for the same two rejection reasons.

**Drift already visible to operators:** inspection uploads have **no progress bar**, their
rejections overwrite one shared error string instead of naming each file, and they
silently truncate over the limit with `.slice(0, room)` where the media grid reports a
message. The 10 MB cap is currently encoded in **four** places, two of them hardcoded
inside translation strings.

**Recommendation:** extract a client-safe `uploadToCloudinary(file, signature, onProgress?)`
plus the shared constants and one receipt schema. It must **not** import
`@/lib/cloudinary`, which calls `cloudinary.config({ api_secret })` at module scope. Leave
both components' state and rendering alone — the grids are genuinely different UIs.
Effort: medium.

### 3.4 Two route lists, and ⌘K cannot reach Calendar or Analytics

- **Severity:** medium · **Confidence:** confirmed (verified directly)
- [command-palette.tsx:26-48](<src/app/(dashboard)/admin/command-palette.tsx:26>) vs [admin-nav.tsx:20-37](<src/app/(dashboard)/admin/admin-nav.tsx:20>)

`AdminNav` lists six destinations; the palette's `ROUTE_DEFS` lists five — dashboard,
vehicles, reservations, customers, new vehicle. **Calendar and Analytics are missing.**
The sidebar list is `satisfies`-typed; the palette's is not linked to it at all.

**Consequence:** two of six admin destinations are unreachable from the command palette,
and nothing will ever tell you when a seventh is added.

**Recommendation:** export the nav list once and have the palette import it, appending its
extra actions. Effort: trivial.

### 3.5 The 16-field vehicle form contract is restated in three unlinked places

- **Severity:** medium · **Confidence:** confirmed
- [vehicle-form.tsx](src/components/forms/vehicle-form.tsx) `name=` attributes · [actions.ts:32-49](<src/app/(dashboard)/admin/vehicles/actions.ts:32>) `formData.get(…)` keys · [validations/vehicle.ts:55-80](src/lib/validations/vehicle.ts:55) schema keys

Three hand-maintained lists of the same 16 field names, joined only by string literals.
`parseVehicleFields` has no return-type annotation and `schema.parse()` takes `unknown`,
so nothing checks list two against list three.

**Consequence:** a typo in any `name=` attribute compiles, lints, type-checks, and
**silently no-ops on update** — because `updateVehicleSchema` is `.partial()`, an absent
key is simply not written. No test covers any of it.

**Recommendation:** annotate `parseVehicleFields` with the schema's input type
(`z.input<typeof createVehicleSchema>`). That is a one-line change that makes the compiler
catch the drift. Effort: trivial.

### 3.6 Smaller confirmed duplication

| Finding                                                                                                                                                                                                                                                               | Sites        | Consequence                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `locale === "sq" ? sq : enUS`                                                                                                                                                                                                                                         | 15           | Both i18n entry points already know the locale; the ternary is pure repetition                                                                       |
| `return { error: normalizeError(error).body.error.message }`                                                                                                                                                                                                          | 15           | Identical error plumbing in every action. **A wrapper is warranted only if it also fixes §4.2** — otherwise it is indirection for its own sake       |
| `BLOCKING_STATUSES` named in `reservation.service.ts` but re-typed as an anonymous literal in [vehicle.service.ts:135](src/services/vehicle.service.ts:135)                                                                                                           | 2            | The public fleet date filter's blocking rule has no name to grep for                                                                                 |
| `["PENDING","CONFIRMED","ACTIVE"]` ("open reservations")                                                                                                                                                                                                              | 3 unnamed    | Same                                                                                                                                                 |
| `Panel` vs the local `Card` in [vehicle-form.tsx:568](src/components/forms/vehicle-form.tsx:568)                                                                                                                                                                      | 2            | `Panel`'s own docstring claims _"one rhythm everywhere"_; the largest admin form uses a second rhythm                                                |
| `EmptyState` has one consumer; four sites hand-roll the same dashed block                                                                                                                                                                                             | 5            | Four different sizes for the same idea                                                                                                               |
| `useReservationDetail` and `useDetailDrawer` are two exported names for **one identical hook** ([reservation-detail.tsx:57-58](<src/app/(dashboard)/admin/reservation-detail.tsx:57>))                                                                                | 7 call sites | No rule decides which to use                                                                                                                         |
| `T10:00:00Z` string-concatenated at [booking-form.tsx:152](src/components/forms/booking-form.tsx:152), [availability-widget.tsx:78](src/components/forms/availability-widget.tsx:78), [calendar-timeline.tsx:455](src/components/dashboard/calendar-timeline.tsx:455) | 3            | The business pickup hour is a magic string, documented in a fourth unrelated file                                                                    |
| Page sizes: `3`, `24`, `25` (×2 each), caps `50`/`100`, unused default `12`                                                                                                                                                                                           | 8 literals   | `paginationSchema.parse({page, perPage: 25})` then `getReservations({perPage: 25})` — typed twice in one function, and the parsed value is discarded |

---

## 4. Inconsistency

### 4.1 Sixteen server actions, four result shapes

- **Severity:** medium · **Confidence:** confirmed

`ActionResult` is declared **identically in two files**
([reservations/actions.ts:28](<src/app/(dashboard)/admin/reservations/actions.ts:28>),
[vehicles/actions.ts:28](<src/app/(dashboard)/admin/vehicles/actions.ts:28>)), and across the
16 actions there are four return shapes: `{error} | undefined`, `{ok:true} | {error}`,
`{signature} | {error}`, `{data} | {error}`. Clients discriminate two different ways
(`result?.error` vs `"error" in result`).

**Recommendation:** one exported `ActionResult<T>` union in `lib/`, one discriminator.
Effort: small.

### 4.2 The auth guard is inside the `try` in 3 actions and outside it in 12

- **Severity:** medium · **Confidence:** confirmed

Inside: [vehicles/actions.ts:65](<src/app/(dashboard)/admin/vehicles/actions.ts:65>),
[reservations/actions.ts:35](<src/app/(dashboard)/admin/reservations/actions.ts:35>),
[search-actions.ts:15](<src/app/(dashboard)/admin/search-actions.ts:15>). Outside: the other
twelve.

**Consequence:** the same condition — a revoked session, a wrong role — produces a tidy
inline error message in three places and an **unhandled thrown error that hits the route
error boundary** in twelve. No comment states a rule. _(Which behaviour is correct is a
UX question for Phase 5; the inconsistency is the Phase 2 finding.)_

### 4.3 Four `ROUTE`/list-page validation behaviours

Reservations and customers call `paginationSchema.parse` (throws on a bad `?page`), while
the fleet page uses `adminVehicleFilterSchema` whose per-field `.catch()` is a documented,
deliberate design _("one unreadable param drops just that filter instead of failing the
parse and quietly handing back an unfiltered fleet"_,
[validations/vehicle.ts:35-39](src/lib/validations/vehicle.ts:35)). **The `.catch()` design
is right; the two pages that don't use it are the outliers.**

### 4.4 Overlay implementations

Four hand-rolled overlays with three different levels of rigour: `DetailDrawer` and
`CommandPalette` use `useFocusTrap`; `ConfirmDialog` uses the Base UI `Dialog`; and
`BookingModal` in [calendar-timeline.tsx:485](src/components/dashboard/calendar-timeline.tsx:485)
has **neither dialog semantics nor a focus trap**. _(Accessibility impact → Phase 5.)_

---

## 5. Stale and misleading comments

In a codebase whose primary navigational aid is its comments, a stale one is worse than no
comment. All four verified directly.

| Comment                                                                                                                                                                                                | Reality                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [use-focus-trap.ts:17](src/lib/use-focus-trap.ts:17) — _"The drawer, confirm dialog and command palette are hand-rolled overlays"_ + _"(Known gap: HANDOFF.md cleanup item on DetailDrawer/Confirm.)"_ | `ConfirmDialog` is **not** hand-rolled — it uses the Base UI `Dialog` and never calls this hook. And the "known gap" it points at is the one this hook closed.                 |
| [validations/image.ts:3](src/lib/validations/image.ts:3) — _"Mirrors MAX_FILES in image.service.ts"_                                                                                                   | There is no `MAX_FILES` in `image.service.ts`. The real dependency is the reverse: the service imports `MAX_VEHICLE_IMAGES` from this file.                                    |
| [detail-drawer.tsx:9](src/components/dashboard/detail-drawer.tsx:9) — _"Must match `--motion-panel-exit` in globals.css"_, `EXIT_MS = 192`                                                             | `--motion-panel-exit: 160ms` ([globals.css:200](src/app/globals.css:200)). The comment states an invariant the code breaks; the drawer stays mounted 32 ms past its animation. |
| [auth/config.ts:3-8](src/lib/auth/config.ts:3) — the split exists to keep the credentials provider out of _"the edge bundle"_                                                                          | Next 16's proxy runs on the **Node.js** runtime by default. The split is still worth keeping; the stated reason is out of date.                                                |

---

## 6. Over-engineering

Places where the code is more elaborate than the problem — offered sparingly, because
most of this codebase is not.

- **The `(dashboard)` route group is an empty wrapper.** Every file that would justify it
  (`layout.tsx`, `error.tsx`, `loading.tsx`, the shell) lives one level deeper in
  `admin/`. The group adds a directory and buys nothing today. _Low — leave it unless you
  are touching the tree anyway._
- **The payments provider registry.** A registry with zero registrations, guarding a
  single eventual bank. I looked hard at this and **I do not think it is over-engineered**:
  `docs/online-payments.md` states the reason (no Kosovo bank protocol yet), the seam is
  one interface with two methods, and the alternative — writing the bank's protocol inline
  — is what makes payment code unreviewable. Recorded here so a later phase does not
  re-open it. **Verdict: keep.**
- **`ViewSwitcher` receives all three renderings as props**
  ([vehicles/page.tsx:211-237](<src/app/(dashboard)/admin/vehicles/page.tsx:211>)), so the
  server renders and serializes grid + table + dense table on every load while the client
  mounts one. Two of the three are the same component with a `dense` flag. It also breaks
  the codebase's own **URL-as-admin-state** convention that every other list control
  follows. _Medium — the fix applies an existing pattern rather than adding one._

## 7. Under-engineering

- **`MediaGrid`'s `Item` type is not a discriminated union**
  ([media-grid.tsx:60-71](src/components/forms/media-grid.tsx:60)). `status` is a union but
  the payload fields are all optional, so `serialize()` must re-check them at runtime — and
  a `"ready"` item missing its signature is **silently dropped from the payload by
  `flatMap`**, so the photo vanishes on save with no error. A discriminated union makes
  that state unrepresentable. _(The state model is otherwise excellent — see §8.)_
- **The client booking schema restates the cheap rules and omits the two that matter.**
  [booking-form.tsx:34-49](src/components/forms/booking-form.tsx:34) validates fields and
  ordering but not the three date rules the server enforces — past-date, the 730-day
  horizon, and the 365-day maximum
  ([validations/reservation.ts:22-43](src/lib/validations/reservation.ts:22)). A vehicle
  with no registration expiry has no upper picker bound, so a 400-day rental is
  selectable, and the customer's rejection message arrives **in English on an Albanian
  page**, because service error strings are English literals.
- **No shared formatting layer at all**, while money and dates are formatted 30+ times
  inline (§3.1, §3.2).

---

## 8. Good architecture worth preserving — do not "clean this up"

Verified, and each has a stated reason that still holds.

1. **Dependency direction where it matters.** Across ~458 internal import edges: **zero**
   `services→app`, **zero** `lib→app`. `src/utils` is a perfect leaf. All three
   client→service imports are `import type`.
2. **`reservation.service.ts` at 614 lines is one domain, not several.** Availability,
   quoting, creation, transitions, extension and calendar reads all operate on the same
   aggregate. Splitting it would scatter one invariant across files. **Leave it.**
3. **`vehicle-form.tsx` at 642 lines is justified.** 16 fields, four cards, ~442 lines of
   markup. The seam people reach for — extracting the cards — would trade one readable
   file for five files and a props protocol. **Leave it one file.**
4. **`MediaGrid` holds per-file upload state on the item**, not in parallel maps that can
   disagree. This is the correct shape.
5. **`publicVehicleSelect` as an explicit allowlist**, with the incident that motivated it
   recorded in the comment, and `buildVehicleWhere` shared by admin and public reads
   _"so their filtering cannot drift"_.
6. **The deliberate transition split**: `reservation.service` owns decision transitions and
   explicitly refuses `ACTIVE`/`COMPLETED`, because those belong to the inspection
   transaction.
7. **`adminVehicleFilterSchema`'s per-field `.catch()`**, with its stated reason.
8. **`redirect()` placed outside the `try`** in both navigating actions — required,
   because Next implements it by throwing.
9. **`businessCalendarStart`** ([reservation-lifecycle.ts:61-84](src/lib/reservation-lifecycle.ts:61)).
   It looks like over-engineering. It is not: it computes a Belgrade-local day boundary
   correctly across DST without a timezone library, it is documented, and
   `businessDayStart` is tested in both summer and winter. **Do not replace it with
   `date-fns-tz` and do not simplify it.**
10. **All five route handlers are uniform** — every one wraps in `withErrorHandling` and
    returns via `ok()`, with zero ad-hoc error paths. **16 of 16 server actions end in
    `Action`.**
11. **The `loadVehicle` React `cache()` wrapper**
    ([car/[slug]/page.tsx:42](<src/app/(website)/car/[slug]/page.tsx:42>)) so
    `generateMetadata` and the page share one query — the exact pattern that should be
    applied to `requireUser()`.
12. **The booking/reservation vocabulary split is principled, not drift.** "Booking" is
    consistently the public/wire word (`/api/bookings`, `bookingCalendar`); "reservation"
    is the persisted entity and the staff word. I checked for leakage in both directions
    and found none. **Considered and dismissed — this is not a naming problem.**

---

## 9. Handed to later phases

Found while reading, not pursued here:

- **Phase 3 (bugs):** the unchecked `updateMany` on the return branch
  ([inspection.service.ts:159](src/services/inspection.service.ts:159)); `createVehicleAction`'s
  partial commit; the `noValidate` submit block in §1.1; `booking-form`'s uncaught `fetch`;
  the always-false `to === r.returnDate` calendar bar-width check confirmed in Phase 1.
- **Phase 4 (security):** vehicle images verify the Cloudinary signature but **not** the
  folder prefix, while inspection photos verify both.
- **Phase 5 (UX/a11y):** `BookingModal` has no focus trap or dialog role; duplicate
  `id="description"` breaks the repairs panel's `<label htmlFor>`; untranslated server
  error messages.
- **Phase 6 (performance):** the eager admin detail graph; the triple fleet rendering; the
  dictionary in every RSC payload.
- **Phase 8 (testing):** `parseVehicleFields` has no test; `businessWeekStart` and
  `businessMonthStart` have no direct tests; `vehicle-content.test.ts` passes while
  covering 1 of 38 descriptions.

---

## 10. Coverage gaps in this phase

Three of seven dimension finders (**duplication**, **dead code**, **engineering balance**)
and the entire adversarial verification pass were lost to a service session limit. I
covered duplication and engineering balance directly, and partially covered dead code:

- **9 of 142 design tokens are genuinely unreferenced** (I verified this properly, after
  a naive first pass produced 69 false positives by ignoring that Tailwind v4 `@theme`
  tokens are consumed as utility classes): `--color-sidebar-ring`,
  `--color-sidebar-primary-foreground`, `--radius-sm`, `--radius-4xl`,
  `--color-skeleton-highlight`, `--ease-move`, `--series-primary`, `--series-ghost`,
  `--chart-grid`.
- `CardAction` and `CardFooter` are **unused exports**; `ui/card.tsx` has exactly one
  consumer (`login/page.tsx`).
- `isTerminalPaymentStatus` and `cancelReservation` have no production caller.
- `/api/vehicles` has no internal consumer (an external one cannot be disproved from the
  repository).

**A full dead-code sweep and unused-translation-key count were not completed.** If you
want them, they are cheap to run on their own.

---

_End of Phase 2. No code was modified. Phase 3 (Bug & Reliability) has not begun._
