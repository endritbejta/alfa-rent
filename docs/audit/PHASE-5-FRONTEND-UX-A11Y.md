# Alfa Rent — Frontend / UX / Accessibility Audit (Phase 5)

**Audit date:** 27 August 2026
**Method:** read-only static analysis plus **computed verification** — I parsed the design
tokens and calculated WCAG contrast ratios for both themes rather than eyeballing them, and
resolved every form-label association through its wrapper component rather than by grep.
**Status:** no code, config, schema or data was modified.

## What I could and could not verify

There is **no local database and no `.env`**, so the app cannot run here: every page except
`/login` needs data. That means this phase is static.

**Docker is available and running (29.7.2)**, so a live pass _is_ possible — a throwaway
`postgres:16` container, `prisma migrate deploy`, the seed, then driving the real UI in a
browser at 320/768/1440 px. That would let me measure actual document widths, focus-visible
rendering, tab order, and real screen-reader output. **Say the word and I'll do it** — it is
the one thing that would materially strengthen this phase and Phase 6.

Everything below is either statically certain or computed. Where a claim needs a browser,
it says so.

---

## 1. Accessibility — confirmed problems

### A11Y-1 · Dark theme has three computed contrast failures; light theme has none

I parsed `globals.css` and computed WCAG 2.1 contrast ratios for every meaningful
foreground/background pair in both themes. **Light theme passes AA on all 20 text pairs.**
Dark theme does not.

| Pair                                                                             | Ratio    | Requirement                | Result   |
| -------------------------------------------------------------------------------- | -------- | -------------------------- | -------- |
| `--primary-foreground #ffffff` on `--primary #e8535c` — **primary CTA label**    | **3.61** | 4.5 (normal text)          | **FAIL** |
| `--success-foreground #ffffff` on `--success #1aa36a` — **confirm-button label** | **3.24** | 4.5                        | **FAIL** |
| `--input rgba(255,255,255,0.16)` on `--card` — **form field boundary**           | **1.62** | 3.0 (WCAG 1.4.11 non-text) | **FAIL** |
| same, on `--background`                                                          | **1.52** | 3.0                        | **FAIL** |

The third is the most telling, because **the light theme solved exactly this problem and
documented it**:

> _"A control boundary must remain identifiable against both white sheets and the warm
> canvas. This solid warm neutral clears 3:1 on white."_ — `--input: #918b89`

I verified that claim: light `--input` measures **3.36:1** on card and **3.01:1** on canvas.
Correct, deliberate, and **not carried over to dark**, which reverted to a low-alpha white.
In dark mode, form fields have effectively invisible borders.

The first two mean the two most important buttons in the app — the brand CTA and the green
confirm action, which the design system explicitly reserves for confirmations — have
labels that fail AA in dark mode. They pass only at large-text size (≥18.7 px bold), and
`Button` uses `text-sm` (14 px) / `text-[0.8rem]`.

**For balance, dark theme passes comfortably everywhere else**: body text 16–17:1, muted
text 7.1:1, all five status colours 5.0–8.5:1 (all five are properly redefined for dark),
accent text on accent 9.7:1, focus ring 5.1:1.

**Recommendation:** darken `--primary` and `--success` in dark until white clears 4.5:1
(around `#c8323c` and `#0f8354` respectively), or switch those two labels to a dark
foreground. Replace dark `--input` with a solid neutral clearing 3:1, exactly as light does.
Effort: trivial — four token values.

### A11Y-2 · There are no live regions, so nothing asynchronous is announced

`aria-live`: **0**. `role="status"`: **0**. `aria-atomic`: **0**. (`role="alert"` appears 17
times — errors _do_ announce, which is good, and `aria-busy` once.)

Six asynchronous status changes are therefore silent to assistive technology:

| Message             | Where                                                                                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Searching…"        | [command-palette.tsx:233](<src/app/(dashboard)/admin/command-palette.tsx:233>)                                                                                                                                                        |
| "Uploading photos…" | [inspection-action.tsx:271](<src/app/(dashboard)/admin/reservations/inspection-action.tsx:271>)                                                                                                                                       |
| "Saving…"           | [vehicle-form.tsx:178](src/components/forms/vehicle-form.tsx:178), [repairs.tsx:213](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:213>), [calendar-timeline.tsx:613](src/components/dashboard/calendar-timeline.tsx:613) |
| "Sending…"          | [booking-form.tsx:465](src/components/forms/booking-form.tsx:465)                                                                                                                                                                     |

**The worst case is the public booking success path.** On success the form is _replaced_ by
a confirmation card ([booking-form.tsx:170](src/components/forms/booking-form.tsx:170)) and
the page scrolls to top — but **focus is never moved and nothing is announced**. A
screen-reader user presses Send and receives no signal that their booking succeeded, that a
reference number exists, or that the form is gone. Combined with Phase 3's BUG-1 (network
failures are also silent), a non-sighted customer gets identical feedback for success and
failure: none.

**Recommendation:** an `aria-live="polite"` region for the pending/quote states, and on
confirmation move focus to the confirmation heading (`tabIndex={-1}` + `.focus()`). Effort: small.

### A11Y-3 · The calendar's booking modal is the one overlay with no dialog semantics

I compared all four overlays:

| Overlay                                                                                              | `role`      | `aria-modal` | Label | Escape | Focus trap  | Focus restore |
| ---------------------------------------------------------------------------------------------------- | ----------- | ------------ | ----- | ------ | ----------- | ------------- |
| `DetailDrawer`                                                                                       | ✅          | ✅           | ✅    | ✅     | ✅          | ✅            |
| `CommandPalette`                                                                                     | ✅          | ✅           | ✅    | ✅     | ✅          | ✅            |
| `ConfirmDialog` (Base UI `Dialog`)                                                                   | _primitive_ | _primitive_  | ✅    | ✅     | _primitive_ | _primitive_   |
| **`BookingModal`** ([calendar-timeline.tsx:485](src/components/dashboard/calendar-timeline.tsx:485)) | ❌          | ❌           | ❌    | ✅     | ❌          | ❌            |

`BookingModal` has no `role="dialog"`, no `aria-modal="true"`, and no `aria-labelledby`
pointing at its `<h2>`. Tab walks straight out into the calendar behind it, and closing
drops the operator at the top of the document. Its backdrop is a **full-viewport
`<button aria-label="Close">`**, so it is also the _first_ focusable element inside the
overlay — a keyboard user tabbing in hits "Close" before any field.

Escape _does_ work ([:112-118](src/components/dashboard/calendar-timeline.tsx:112)), so it
is dismissible.

This is the flow staff use to create a walk-in reservation — a real daily task.

**Recommendation:** render it through the same Base UI `Dialog` that `ConfirmDialog` uses.
That removes a fourth overlay implementation rather than adding one. Effort: small.

### A11Y-4 · Two admin fleet filters have no programmatic label

[vehicle-filters.tsx:101](<src/app/(dashboard)/admin/vehicles/vehicle-filters.tsx:101>) (Brand)
and [:116](<src/app/(dashboard)/admin/vehicles/vehicle-filters.tsx:116>) (Category) are wrapped
in a local `Group` component that renders its label as a **`<p>`**:

```jsx
<div>
  <p className="…uppercase">{label}</p>
  {children}
</div>
```

No `htmlFor`, no wrapping `<label>`, and neither `<select>` carries `id`, `aria-label` or
`aria-labelledby`. A screen-reader user hears "combo box" with no indication of what it
filters.

**These are the only two unlabelled controls in the app.** I resolved every other
`<select>` and text input through its wrapper and they are all correctly associated (§2).

**Recommendation:** make `Group` render a `<label>` wrapping its children, or give the
selects `id`s and the `<p>` an `htmlFor`. Effort: trivial.

### A11Y-5 · A duplicate `id` sends a label to the wrong control

`id="description"` exists **twice** inside one `<form>` — the vehicle textarea at
[vehicle-form.tsx:295](src/components/forms/vehicle-form.tsx:295) and the repair input at
[repairs.tsx:181](<src/app/(dashboard)/admin/vehicles/[id]/edit/repairs.tsx:181>). The repairs
panel's `<Label htmlFor="description">` therefore resolves to the **vehicle's** textarea.
Clicking the repair field's label focuses the wrong control, and screen readers announce the
wrong name. _(Root cause and the associated save-blocking bug: Phase 3 BUG-4.)_

### A11Y-6 · The accessibility linting is far narrower than it appears

`eslint-config-next` enables **6 `jsx-a11y` rules, all at severity 1 (warn)** — so they
could never fail CI even if they fired:

`alt-text`, `aria-props`, `aria-proptypes`, `aria-unsupported-elements`,
`role-has-required-aria-props`, `role-supports-aria-props`

The plugin ships roughly 35. **Not enabled**, and each would have caught something above:
`label-has-associated-control` (A11Y-4), `interactive-supports-focus`,
`click-events-have-key-events`, `no-static-element-interactions`, `anchor-is-valid`,
`heading-has-content`, `no-autofocus`, `tabindex-no-positive`.

Currently the suite reports zero warnings — which reads as "accessibility is clean" but
actually means "the six enabled rules pass".

**Recommendation:** add `plugin:jsx-a11y/recommended` at `error`, fix the fallout, and let
CI hold the line. Effort: small, plus whatever it surfaces.

### A11Y-7 · Unknown ids produce a crash screen instead of a 404

There is **no `not-found.tsx` in the admin route group** — only
[app/not-found.tsx](src/app/not-found.tsx) at the root and the two `error.tsx` boundaries.
`/admin/vehicles/<bad-id>/edit` throws `NotFoundError` from the service, which the error
boundary renders as the generic "something went wrong" card. The public
`/car/[slug]` route does this correctly, calling `notFound()`
([car/[slug]/page.tsx:46](<src/app/(website)/car/[slug]/page.tsx:46>)).

---

## 2. Accessibility — verified sound

Actively checked, and correct. Do not change these.

1. **Every image has alt text.** All 14 `<Image>` usages. _(Two apparent misses are
   `<Images>`/`<ImagePlus>` lucide icons, not images.)_
2. **The drawer and command palette are properly implemented overlays** — dialog role,
   `aria-modal`, labels, Escape, focus trap **and focus restore** via
   [use-focus-trap.ts](src/lib/use-focus-trap.ts), whose docstring explains exactly why.
3. **17 `role="alert"` regions** on validation and action errors — failures do announce.
4. **Every form control except A11Y-4 is correctly labelled.** I traced each through its
   wrapper: `booking-form`'s `FormField` renders `<Label htmlFor={name}>` matching each
   `<Input id={name}>`; `vehicle-form`'s `Field`/`Select` pairs `htmlFor` with `id` for all
   four enum selects; `hero-search`, `fleet-filters` and `calendar-timeline` use wrapping
   `<label>`s; `language-selector` uses `aria-label`. **My first automated pass flagged the
   booking form's four PII fields as unlabelled — that was a false positive from not
   following the wrapper. It is correct.**
5. **No `onClick` on `<div>`, `<span>` or `<li>` anywhere** — the whole class of
   keyboard-inaccessible custom controls is absent.
6. **`prefers-reduced-motion` and `prefers-reduced-transparency` are both honoured**
   ([globals.css:493, :522](src/app/globals.css:493)), and `Button` carries
   `motion-reduce:transition-none`.
7. **A visible focus style exists on every button** —
   `focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50`, and the ring
   measures 4.9:1 (light) / 5.1:1 (dark) against card.
8. **`/login` sets `robots: { index: false }`.**

---

## 3. UX

### UX-1 · No admin mutation ever confirms that it worked

- **Severity:** high (for a staff tool) · **Confidence:** confirmed

There is **no toast, snackbar, or notification mechanism anywhere in the codebase.** I
grepped for it: the only hits are a code comment and the `admin.dismissNotification` key
belonging to the _pending banner_. (`sonner` was installed and then removed as dead code.)

So after saving a vehicle, deleting one, confirming a reservation, extending a rental,
recording an inspection, or adding a repair, the operator's only signal is that the page
navigated or the panel closed. The one attempt at a success signal —
`redirect("…/edit?created=1")` at
[vehicles/actions.ts:100](<src/app/(dashboard)/admin/vehicles/actions.ts:100>) — **is dead**;
the edit page does not read `searchParams` at all.

Failure, by contrast, is well handled everywhere: 17 `role="alert"` messages, consistent
inline error rendering.

**Consequence:** an operator who is unsure whether a save landed will re-submit. Combined
with Phase 3's BUG-2 (clearing a field silently does nothing) and BUG-11 (a failed photo
save leaves a vehicle created, so retrying creates a second one), the absence of positive
feedback actively compounds two data bugs.

**Recommendation:** this is the one place a small library is justified. Add a toast, wire it
to every action's success path, and delete the dead `?created=1`. Effort: small.

### UX-2 · Reservation and customer detail have no URL

- **Severity:** medium · **Confidence:** confirmed

The route inventory has **no `[id]` segment** under `reservations/` or `customers/` — only
`vehicles/[id]/edit`. Both detail views exist purely as drawer state inside
`ReservationDetailProvider`.

**Consequence:** staff cannot bookmark a reservation, send a colleague a link to one, or
reopen one after a refresh. The browser Back button does not close the drawer — it leaves
the page. For a tool where two people discuss the same booking on the phone, this is real
friction.

**Recommendation:** back the drawer with a search param (`?reservation=<id>`), which the
codebase already does for every list filter. Same pattern, no new concepts.

### UX-3 · The feature the vehicle drawer exists for is only reachable by keyboard shortcut

The vehicle cost/profitability drawer — whose own source calls it _"the reason this drawer
exists"_ — is opened only from the ⌘K palette
([command-palette.tsx:77,156](<src/app/(dashboard)/admin/command-palette.tsx:77>)). The fleet
grid cards and the table's Edit button both navigate to the **edit page** instead. An
operator who never discovers ⌘K never sees per-vehicle economics.

### UX-4 · Server error messages are English in an Albanian-default interface

Every message thrown by the service layer is a hardcoded English literal, and client
components render `result.error` verbatim — e.g.
[status-actions.tsx:68-72](<src/app/(dashboard)/admin/reservations/status-actions.tsx:68>).
So an Albanian operator (the default locale) sees _"Cannot change a COMPLETED reservation to
CONFIRMED"_ or _"Rental duration cannot exceed 365 days"_ amid otherwise fully localised
chrome. Phase 2 §3.2 has the full inventory; Phase 3 BUG-16 covers the one place this is
worked around by comparing English strings.

### UX-5 · Other confirmed friction, cross-referenced

| Issue                                                                | Effect on the user                                                      | Source           |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| Booking submit fails silently on any network error                   | Customer cannot tell success from failure                               | Phase 3 BUG-1    |
| Clearing an optional vehicle field appears to save                   | Operator believes they changed something they did not                   | Phase 3 BUG-2    |
| Opening the repairs panel blocks saving the vehicle                  | Save refused, pointing at a field in another panel                      | Phase 3 BUG-4    |
| Search failures render as "Nothing matches …"                        | Operator with a dead session sees an empty result, not a sign-in prompt | Phase 3 BUG-9    |
| Inspection photos silently truncated at 6                            | Evidence photos lost without a word                                     | Phase 3 BUG-15   |
| Extension refusal falls through to a generic message in 1 of 4 cases | Operator is told "cannot extend" with no reason                         | Phase 3 BUG-16   |
| Pending banner flashes before hydration                              | Dismissed banner reappears momentarily on every load                    | Phase 3 BUG-17   |
| `/booking` with no `vehicle` param silently redirects to `/car`      | No explanation for the redirect                                         | this phase, low  |
| Booking confirmation gives a reference number but **no email**       | Customer has nothing durable; no notification infrastructure exists     | Phase 1, Phase 3 |

---

## 4. Responsive design

**Mostly good — and I dismissed three suspected problems by checking.**

### Verified sound

1. **Tables scroll correctly.** [ui/table.tsx:9-12](src/components/ui/table.tsx:9) wraps
   every `<table>` in `<div className="relative w-full overflow-x-auto">`. The
   `overflow-hidden` on the outer card at
   [vehicles/page.tsx:47](<src/app/(dashboard)/admin/vehicles/page.tsx:47>) is only for the
   rounded corner — it does not clip the table. **Suspected finding, dismissed.**
2. **The fleet calendar contains its own overflow.**
   [calendar-timeline.tsx:219](src/components/dashboard/calendar-timeline.tsx:219) uses
   `overflow-auto overscroll-x-contain` with a sticky name column that narrows on mobile
   (`[--name-w:7.5rem] sm:[--name-w:12.5rem]`). `overscroll-x-contain` prevents scroll
   chaining to the page. This directly addresses the prior audit's M12 (page-level
   horizontal overflow at 320 px) and **appears fixed** — though confirming the actual
   document width needs a 320 px browser.
3. **Buttons are mobile-first.** The `default` variant is `h-11 … sm:h-9` and `icon` is
   `size-11 sm:size-8` — i.e. **44 px on touch, 36/32 px on desktop**. That is a deliberate
   design decision, not an oversight.
4. **Fleet cards use `content-visibility: auto`** with a reserved intrinsic size, so
   off-screen cards skip layout without causing scroll jumps.
5. **Filters render once and mount twice** — `fleet-filters.tsx` defines `controls` once and
   places it in both a mobile `Sheet` and a desktop panel, with the URL as the single source
   of truth.

### Touch targets — correcting the prior audit

`AUDIT_REPORT.md` M13 states _"Touch targets are frequently smaller than 44×44 CSS pixels."_
That is literally true but measures against the wrong bar and misses the deliberate work.
Measured usage:

| Variant          | Size                          |           Uses | WCAG 2.2 AA (2.5.8, ≥24 px) | AAA (2.5.5, ≥44 px) |
| ---------------- | ----------------------------- | -------------: | --------------------------- | ------------------- |
| `default`        | **44 px** mobile / 36 desktop |             50 | pass                        | **pass**            |
| `lg`             | 44 px                         |              2 | pass                        | pass                |
| `icon`           | **44 px** mobile / 32 desktop |              1 | pass                        | pass                |
| `sm`             | 32 px (no mobile bump)        |             24 | pass                        | fail                |
| `icon-sm`        | 28 px                         |              2 | pass                        | fail                |
| `xs` / `icon-xs` | 24 px                         | **0 — unused** | pass (at the boundary)      | fail                |

**53 of 79 buttons are 44 px on touch. All 79 meet WCAG 2.2 AA.** The 26 that fall short of
44 px fail only the AAA enhanced criterion. The genuinely risky variants (`xs`, `icon-xs` at
exactly 24 px) are not used anywhere.

**Honest recommendation:** give `sm` and `icon-sm` the same `sm:` treatment the default
variant already has (`h-11 sm:h-8`), since `sm` is the most-used size in the admin and staff
do use the dashboard on phones. This is a small improvement, not a compliance fix.

### Needs a browser

Actual document width at 320 px; focus-visible rendering; real tab order through the
calendar's per-day buttons; whether the sticky action bar overlaps content on short
viewports; iOS Safari behaviour of the mobile `Sheet`.

---

## 5. UI consistency

Drawn from this phase and Phase 2, deduplicated.

| Area                  | State                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Buttons**           | One `Button` with a coherent variant/size system, pill radius, consistent focus and disabled treatment. **Good.**                                                                |
| **Colours**           | 209 tokens, both themes, semantic status colours redefined per theme, reduced-transparency fallbacks. **Good**, except A11Y-1.                                                   |
| **Typography**        | One family (Geist) used across its weight range with tabular figures, with the reasoning documented. **Good.**                                                                   |
| **Money**             | **Inconsistent** — four `eur` helpers, two formats, and the same price renders `45.00 EUR` in the fleet table but `45` in the fleet grid, one toggle apart (Phase 2 §2.5, §3.1). |
| **Dates**             | **Inconsistent** — 11 user-facing dates render without a locale, including the main reservations list and all four chart axes (Phase 2 §3.2).                                    |
| **Modals/overlays**   | Four implementations, three rigorous, one not (A11Y-3).                                                                                                                          |
| **Tables**            | One primitive, used consistently, scrolls correctly. **Good.**                                                                                                                   |
| **Dropdowns**         | No shared `select` primitive; 7 hand-styled selects across 3 class definitions (Phase 2). Two are unlabelled (A11Y-4).                                                           |
| **Alerts/validation** | Consistent inline `role="alert"` pattern across 12+ components. **Good** — this is the most uniform part of the UI.                                                              |
| **Loading states**    | `loading.tsx` in both route groups plus a root `global-error`; skeletons exist. **Good.**                                                                                        |
| **Empty states**      | Well covered in content (`noReservations`, `noVehicles`, `noPhotos`, `noSearchResults`, `notSet`) but hand-rolled — the `EmptyState` component has **one** consumer. Cosmetic.   |
| **Success states**    | **Absent entirely** (UX-1).                                                                                                                                                      |

---

## 6. Shared components worth extracting — and ones not to

**Justified:**

1. **A toast/notification surface** (UX-1). The only genuinely missing piece of UI
   infrastructure. Every mutation needs it.
2. **`formatEur(value)` and `getDateLocale(locale)`** (Phase 2 §3.1–3.2). These fix
   _user-visible_ inconsistency, not just duplication — the same price rendering two ways on
   one screen is the proof.
3. **Route the booking modal through the existing `Dialog`** (A11Y-3). This _removes_ an
   implementation rather than adding an abstraction.
4. **Fix `Group` to render a `<label>`** (A11Y-4). A three-line change, not a new component.

**Not justified — do not extract:**

- **`vehicle-form.tsx`'s cards.** 442 of its 642 lines are markup for one cohesive form.
  Splitting trades a readable file for five files and a props protocol.
- **A generic `EmptyState` rollout.** Four hand-rolled dashed blocks at four sizes is
  untidy, not broken. Converting them buys consistency at the cost of a props matrix for
  four one-off layouts. Low value; do it only if you are touching those screens anyway.
- **A shared `useActionError` hook.** The `useState<string|null>` + `if (result?.error)` +
  `role="alert"` pattern repeats ~12 times and is _already consistent_. Wrapping it would
  add indirection to the most reliable part of the UI.

---

## 7. Priority

1. **A11Y-1** — four token values fix two failing button labels and invisible dark-mode
   field borders. Trivial, high value.
2. **UX-1** — no success feedback; actively compounds two Phase 3 data bugs.
3. **A11Y-2** — live regions, and focus/announcement on booking success. A non-sighted
   customer currently cannot tell whether a booking worked.
4. **A11Y-4** and **A11Y-5** — two trivial label fixes.
5. **A11Y-3** — route the booking modal through `Dialog`.
6. **A11Y-6** — turn on `jsx-a11y/recommended` at `error` so CI holds the line.
7. **UX-2**, **UX-3**, **A11Y-7**, then the `sm` touch-target improvement.

---

_End of Phase 5. No code was modified. Phase 6 (Performance & Scalability) has not begun._
