# Alfa Rent — Design Audit and Change Proposal

**Status:** Approved and implemented  
**Branch:** `codex/design-audit-plan`  
**Baseline:** `7eedefe`  
**Audit date:** 2026-07-30

## Executive verdict

Alfa Rent already has a strong visual foundation. The warm graphite palette, restrained Alfa red, photographic vehicle presentation, typography, and “one primary red action” rule create a credible premium identity. A full redesign would discard good work.

The recommended direction is a focused system refinement: preserve the identity, strengthen trust and localization, shorten the mobile booking and fleet journeys, make the admin interface more operational, and consolidate accessibility and motion behavior.

## Implementation result

The approved direction has been applied on `codex/design-audit-plan`:

- Replaced the mobile fleet filter wall with a compact trigger and accessible bottom sheet.
- Added public fleet search and price sorting backed by URL state and server filtering.
- Replaced the booking vehicle dropdown with a searchable, visual picker and contextual reservation summary.
- Split booking content into clear trip and customer-detail sections without introducing a wizard.
- Added programmatic field-error relationships and larger public mobile controls.
- Removed fake testimonials and prevented placeholder phone/email channels from rendering.
- Reworked contact and staff login hierarchy while preserving the existing identity.
- Localized public pagination and the most visible admin table/search vocabulary.
- Removed `transition-all`, keyboard-triggered motion, global ambient looping, and ungated hover transforms.
- Standardized panel, dialog, and sheet motion with reduced-motion and reduced-transparency alternatives.
- Added a route-shaped public loading state.
- Verified the result at mobile and desktop breakpoints with no horizontal overflow in the booking or contact flows.

Verification completed: TypeScript, ESLint, 82 automated tests, and the optimized Next.js production build.

| Area                      |      Score | Summary                                                                                                                          |
| ------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------- |
| Visual identity           |     8.5/10 | Distinctive, premium, and consistent on the public site                                                                          |
| Hierarchy and composition |       8/10 | Strong hero, fleet cards, and vehicle detail layouts                                                                             |
| Conversion journey        |     6.5/10 | Booking and filtering become long and high-friction on mobile                                                                    |
| Trust and content         |     5.5/10 | Placeholder contact data, mixed languages, and unverified-looking testimonials weaken confidence                                 |
| Accessibility             |     6.5/10 | Good focus foundations, but form error wiring, touch targets, and reduced-motion coverage need work                              |
| Motion quality            |       6/10 | Good restraint in places, but keyboard-triggered animation, `transition-all`, and global ambient motion fail the target standard |
| Admin UX                  |     6.5/10 | Functional, but less cohesive, localized, and deliberately branded than the public experience                                    |
| **Overall**               | **7.3/10** | Strong product foundation with a clear route to a 9/10 experience                                                                |

## What should remain

- The warm graphite, ivory, and Alfa red visual identity in `src/app/globals.css:121`.
- Geist typography, tight display tracking, and the existing radius/elevation ladder.
- The premium dark hero and the warm light content canvas.
- Vehicle-first photography and the current card proportions.
- The “one filled red action per viewport” discipline.
- The desktop vehicle-detail composition and mobile sticky booking action.
- Dense, practical admin information architecture; it should be refined, not turned into a marketing interface.

## Design direction

### Public experience

**Premium, calm, photographic, and trustworthy.** Keep generous hierarchy and strong vehicle imagery. Replace decorative or generic content with real operational reassurance: verified contact channels, clear booking expectations, localized copy, transparent pricing, and contextual summaries.

### Admin experience

**Crisp, dense, and operational.** Retain the same brand tokens while using more opaque reading surfaces, a static background, predictable controls, and minimal motion. The admin should feel related to the public site without inheriting its decorative ambience.

### Interaction principles

1. Immediate response for keyboard and high-frequency actions.
2. Motion only when it explains state, hierarchy, or spatial origin.
3. Mobile controls meet a 44px practical touch target.
4. Every error is connected programmatically to its field.
5. Albanian is the default interface language; English appears only where intentionally required.
6. Copy never promises an operational action the product cannot currently perform.

## Experience changes

| Before                                                       | After                                                                                                                 | Why                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Long native vehicle select with up to 50 entries in booking  | Searchable vehicle picker with thumbnail, category, seats, transmission, and price                                    | Reduces recognition effort and prevents choosing the wrong vehicle |
| One uninterrupted mobile booking form                        | Two visible sections on one page: “Udhëtimi juaj” and “Të dhënat tuaja,” plus a sticky/contextual reservation summary | Creates hierarchy without adding multi-step friction               |
| Fleet filter chips consume most of the first mobile viewport | Compact filter summary and button opening a bottom sheet; active filters remain visible as removable chips            | Gets users to vehicles sooner while keeping filters available      |
| Fleet offers filtering only                                  | Add make/model search and a restrained sort control for price/relevance                                               | Makes a 43-vehicle inventory faster to scan                        |
| Four equal contact cards with placeholder data               | Prioritize tap-to-call and email/WhatsApp actions, then location and opening hours; use only verified data            | Builds trust and makes the page actionable                         |
| Generic admin login card                                     | Restrained Alfa Rent staff login with brand mark, “staff only” context, and clear password interaction                | Connects the entry point to the product without overdesigning it   |
| Mixed Albanian and English system copy                       | Centralized Albanian interface strings for public and admin surfaces                                                  | Removes visible inconsistency and improves comprehension           |
| Unverified-looking English testimonials                      | Verified, consented, localized reviews—or remove the section until they exist                                         | Trust content must be real to add value                            |
| Blank waits on dynamic routes                                | Layout-matched, reduced-motion-safe loading skeletons                                                                 | Improves perceived performance and prevents layout uncertainty     |
| Decorative global animated background across app surfaces    | Static admin/login background; optional, localized ambience only in the public marketing hero                         | Improves focus, battery/GPU use, and product hierarchy             |

## Prioritized findings

| Priority | Category              | Evidence                                                                                                | Finding                                                                                                 | Proposed change                                                                                    |
| -------- | --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| P0       | Trust                 | `src/app/(website)/contact/page.tsx:14`, `src/components/shared/site-footer.tsx:40`                     | Phone and email are placeholders; contact cards are not actionable links                                | Replace with verified data and use `tel:`, `mailto:`, map, or WhatsApp actions as applicable       |
| P0       | Content               | `src/app/(website)/page.tsx:83`                                                                         | English testimonials look generic and conflict with the Albanian experience                             | Publish only verified, localized reviews; otherwise remove the block                               |
| P0       | Localization          | `src/components/dashboard/pagination.tsx:47`, `src/app/(website)/car/page.tsx:111`                      | Public pagination visibly mixes English with Albanian                                                   | Centralize and translate pagination labels and accessible names                                    |
| P0       | Accessibility         | `src/components/forms/booking-form.tsx:138`, `src/components/forms/login-form.tsx:35`                   | Visual validation messages are not consistently connected with `aria-invalid` and `aria-describedby`    | Add stable error IDs, field relationships, focus-to-first-error, and an error summary where useful |
| P0       | Motion                | `src/components/ui/button.tsx:6`, `src/components/ui/tabs.tsx:61`                                       | Shared primitives use `transition-all`                                                                  | Transition only named properties with the approved duration and easing tokens                      |
| P0       | Motion                | `src/app/(dashboard)/admin/command-palette.tsx:92`, `src/app/(dashboard)/admin/admin-shell.tsx:179`     | Keyboard-triggered UI states animate                                                                    | Make keyboard open/toggle immediate; retain restrained pointer-only feedback                       |
| P1       | Booking               | `src/app/(website)/booking/page.tsx:24`, `src/components/forms/booking-form.tsx:141`                    | Vehicle selection becomes a long native list on mobile                                                  | Introduce a searchable, informative vehicle picker                                                 |
| P1       | Booking               | `src/components/forms/booking-form.tsx:113`                                                             | Confirmation language can imply an operational follow-up that is not implemented in the current project | Match copy to the real workflow and show reference, response expectation, and a fallback contact   |
| P1       | Fleet                 | `src/components/forms/fleet-filters.tsx:46`                                                             | Mobile filters dominate the first screen                                                                | Move secondary controls into an accessible bottom sheet and expose active state compactly          |
| P1       | Touch                 | `src/components/ui/input.tsx:12`, `src/components/ui/button.tsx:33`                                     | Default control heights are small for public mobile use                                                 | Use 44px public/mobile controls while retaining a deliberate compact admin density                 |
| P1       | Admin                 | `src/app/(dashboard)/admin/vehicles/page.tsx:46`, `src/app/(dashboard)/admin/reservations/page.tsx:123` | Admin tables and actions contain hardcoded English                                                      | Centralize Albanian operational labels and status vocabulary                                       |
| P1       | Perceived performance | `src/app/(website)/page.tsx:26`, `src/app/(website)/car/page.tsx:20`                                    | Dynamic public routes have no route-specific loading composition                                        | Add page-shaped loading states for home, fleet, detail, and booking                                |
| P2       | Contact               | `src/app/(website)/contact/page.tsx:58`                                                                 | Four equal cards create little hierarchy                                                                | Promote the two primary contact actions and treat hours/location as supporting information         |
| P2       | Login                 | `src/app/login/page.tsx:37`                                                                             | Login is visually generic and detached from the brand                                                   | Add a restrained branded staff-entry composition                                                   |
| P2       | Admin motion          | `src/app/(dashboard)/admin/admin-shell.tsx:227`, `src/components/dashboard/confirm-dialog.tsx:47`       | Mobile drawer and confirm dialog lack consistent enter/exit and shared focus behavior                   | Use shared accessible overlay primitives and symmetric, interruptible state transitions            |

## Motion review

### Original verdict: **Block — resolved by implementation**

The original audit blocked motion approval until keyboard-triggered animations and shared `transition-all` usage were removed. Those foundation-level issues were resolved in the approved implementation.

| Before                                                          | After                                                                                                        | Why                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Command palette animates after `⌘K`                             | Open and close immediately for keyboard initiation                                                           | Keyboard actions are high-frequency and should feel instantaneous                |
| Sidebar width animates after `[` keyboard shortcut              | Toggle immediately from the keyboard; pointer interaction may use a restrained transition                    | Avoids latency and layout animation during an operational action                 |
| Buttons and tabs use `transition-all`                           | Name `background-color`, `border-color`, `color`, `box-shadow`, `opacity`, and `transform` only where needed | Prevents accidental animation of layout or future properties                     |
| Sheet uses generic `ease-in-out`                                | `240ms cubic-bezier(0.32, 0.72, 0, 1)` for spatial drawer movement; opacity-only under reduced motion        | Gives drawers a clear physical model without feeling sluggish                    |
| Hover transforms run without pointer-capability gating          | Apply hover motion only inside `(hover: hover) and (pointer: fine)`                                          | Avoids sticky/false hover behavior on touch devices                              |
| Confirm dialog enters but disappears without a coordinated exit | `160–200ms` enter and `120–160ms` exit, with opacity-only reduced-motion behavior                            | Makes an occasional consequential interaction coherent                           |
| Large ambient layers drift globally                             | Remove from admin/login; keep a static treatment or tightly scoped hero-only ambience                        | Decorative motion should not compete with reading or consume continuous GPU work |

### Proposed motion tokens

```css
--motion-fast: 120ms;
--motion-ui: 180ms;
--motion-panel: 240ms;
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

The implementation should consolidate these with the current tokens rather than creating a second parallel system.

## High-value animation opportunities

| Opportunity              | Trigger                           | Exact treatment                                                          | Reduced motion                          | Value                                                     |
| ------------------------ | --------------------------------- | ------------------------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| Availability result      | Quote becomes available           | `opacity 0→1`, `translateY(4px)→0`, `180ms var(--ease-out)`              | Opacity only                            | Clarifies that pricing state has updated                  |
| Booking success          | Reservation is accepted by the UI | Check state `scale(.97)→1` with opacity, `240ms var(--ease-out)`         | Opacity only                            | Gives restrained confirmation to a rare, important action |
| Mobile filter sheet      | User taps Filters                 | Translate from bottom, `240ms var(--ease-drawer)`; scrim opacity `180ms` | Immediate panel plus short opacity fade | Preserves spatial origin and keeps filters reachable      |
| Vehicle selection        | User chooses a vehicle in booking | Summary content crossfade, `160ms`, no layout bounce                     | Immediate content replacement           | Maintains context without spectacle                       |
| Route loading completion | Server content replaces skeleton  | Content opacity `0→1`, `120ms`                                           | Immediate                               | Softens async replacement without delaying use            |

### Animation candidates intentionally rejected

| Candidate                                             | Decision | Reason                                                                     |
| ----------------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| Command-palette open/close animation                  | Reject   | Keyboard-first, high-frequency action                                      |
| Admin page transitions                                | Reject   | Slows repeated operational navigation                                      |
| Chart drawing animations                              | Reject   | Data comprehension benefits from immediate stable values                   |
| Staggering every fleet card after filter/page changes | Reject   | Repeated list motion delays scanning and becomes irritating                |
| Global ambient background drift                       | Reject   | Decorative continuous motion adds paint/GPU cost and competes with content |

## Proposed implementation phases

### Phase 0 — Truth, language, and accessibility

- Replace or clearly mark all placeholder contact data.
- Remove or verify/localize testimonials.
- Translate public pagination and admin operational labels.
- Connect form errors to fields and improve error focus behavior.
- Establish public/mobile 44px controls and validate keyboard/focus order.

**Exit criteria:** no placeholder trust data ships; no visible mixed-language system copy remains in audited flows; automated and manual form accessibility checks pass.

### Phase 1 — Interaction and motion foundation

- Remove `transition-all` from shared primitives.
- Consolidate motion tokens and reduced-motion behavior.
- Make keyboard-triggered state changes immediate.
- Standardize dialog, sheet, drawer, popover, and menu transitions.
- Remove global ambient motion from admin/login.

**Exit criteria:** motion review changes from Block to Approve; no keyboard-initiated transition; every meaningful animation has a reduced-motion path.

### Phase 2 — Booking conversion journey

- Build the searchable vehicle picker.
- Introduce clear “trip” and “details” sections without forcing a wizard.
- Add a persistent/contextual summary with vehicle, dates, price basis, and estimated total where data permits.
- Align success messaging with the real operational workflow.

**Exit criteria:** a mobile user can select a vehicle, understand the quote, correct errors, and submit without navigating a long opaque option list.

### Phase 3 — Fleet discovery

- Move mobile filters into an accessible sheet.
- Add compact active-filter state, reset, search, and restrained sorting.
- Preserve the existing desktop inline controls and card visual language.
- Validate empty, loading, and filtered-result states.

**Exit criteria:** vehicles appear within the first mobile viewport; all filters remain keyboard/screen-reader usable; filtered state is always visible.

### Phase 4 — Contact, login, and admin cohesion

- Recompose contact information around primary actions and verified content.
- Add a restrained branded staff login.
- Localize admin vocabulary and align tables, empty states, destructive confirmations, and drawers.
- Keep admin backgrounds static and reading surfaces more opaque.

**Exit criteria:** public and admin surfaces feel related but appropriately distinct; repeated operational actions remain fast and unanimated.

### Phase 5 — Perceived performance and QA

- Add route-specific loading compositions.
- Test dark/light modes at mobile, tablet, laptop, and wide desktop sizes.
- Run keyboard-only, screen-reader spot checks, contrast checks, and reduced-motion/reduced-transparency checks.
- Review animation at normal speed and slow motion.
- Validate on touch and fine-pointer devices.

**Exit criteria:** no layout-breaking viewport, theme, focus, or motion defect remains in the critical public and admin journeys.

## Delivery approach after approval

After this proposal is accepted:

1. Convert each accepted finding into a self-contained implementation plan under `plans/`, with exact files, target components, dependencies, test cases, and acceptance criteria.
2. Implement in the phase order above, keeping each phase reviewable.
3. Visually verify public pages in both themes and the authenticated admin surfaces when an approved test session is available.
4. Do not combine unrelated refactors with the design work.

## Scope boundaries

- No rebrand, logo replacement, or wholesale palette change.
- No invented customer reviews, contact details, pricing rules, or operational guarantees.
- No multi-step booking wizard unless evidence from usability testing shows it is required.
- No decorative animation added solely to make the interface feel “alive.”
- No admin visual conclusions are based on an authenticated production session in this audit; admin findings were validated from the source and existing structure because credentials were not available.

## Approval decision

- [x] Approve the full proposal
- [ ] Approve with requested changes
- [ ] Approve selected phases only

The proposal was approved through the user’s “continue” instruction and implemented on the audit branch.
