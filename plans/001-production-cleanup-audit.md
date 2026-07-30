# Alfa Rent Production Cleanup Audit

**Phase:** 1 — audit and plan only  
**Audit date:** 30 July 2026  
**Branch/worktree audited:** `codex/online-payment`, including the current uncommitted working-tree changes  
**Change policy:** No application code, assets, dependencies, configuration, or routes were changed during this audit.

## Executive summary

| Measure                                                    |                    Confirmed result |
| ---------------------------------------------------------- | ----------------------------------: |
| TypeScript/TSX source files audited                        |                                 165 |
| TypeScript/TSX LOC audited                                 |                              19,026 |
| Global CSS LOC audited                                     |                                 693 |
| Dead component modules                                     |                                   6 |
| Dead service modules                                       |                                   1 |
| Other dead functions                                       |                                   4 |
| Dead pages/layouts                                         |                                   0 |
| Unused public assets                                       |                                   5 |
| Unused packages                                            |                                   1 |
| Unused hooks                                               |                                   0 |
| Unused contexts/providers                                  |                                   0 |
| Conditionally unused API routes                            |                                   1 |
| Confirmed circular imports                                 |                                   0 |
| Stray debug statements                                     |                                   0 |
| Estimated safe code LOC removable                          |                           about 775 |
| Estimated safe tracked files removable                     |                                  13 |
| Safe-cleanup bundle reduction                              |                  approximately 0–1% |
| Potential route-level bundle reduction after boundary work | approximately 5–15%, to be measured |
| Technical debt                                             |                              Medium |

The codebase is in materially better condition than a typical pre-production
application. The type checker, linter, and test suite are clean. The main
cleanup opportunity is not broad decay: it is a compact group of unused UI
scaffolding, one obsolete dashboard service, several unused service helpers,
five default Next.js assets, and a small amount of dead global CSS.

The larger performance opportunity is architectural rather than deletion. The
admin shell eagerly imports the full reservation/customer/vehicle detail
drawer graph, which raises the client JavaScript floor of every admin route.
That should be handled separately from the safe deletion batch and measured
before and after.

## Audit method and safety constraints

The audit used:

- a full file and route inventory;
- a TypeScript import graph, including path aliases and relative imports;
- a reverse-reference scan for exported functions, hooks, providers, assets,
  environment variables, CSS selectors, and API URLs;
- a strongly connected component scan of the import graph for cycles;
- inspection of Next.js 16.2.11's installed documentation for route discovery,
  Server/Client Component boundaries, and the supported bundle analyzer;
- the existing production build manifests for directional route bundle data;
- `npm outdated` against the npm registry on 30 July 2026;
- fresh lint, typecheck, and unit-test runs.

Ordinary zero-inbound analysis was not used to classify Next.js entrypoints.
Files such as `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`,
`global-error.tsx`, `not-found.tsx`, and `proxy.ts` are framework-discovered
and were reviewed under Next.js rules instead.

Dynamic string references were searched before classifying files as dead. The
one route with no internal caller remains conditional because an external
consumer cannot be disproved from repository evidence alone.

## Baseline verification

| Check                                    | Result                    |
| ---------------------------------------- | ------------------------- |
| `npm run lint`                           | Passed                    |
| `npm run typecheck`                      | Passed                    |
| `npm run test -- --reporter=dot`         | 17 files, 82 tests passed |
| Latest production build in this worktree | Passed before this audit  |

No cleanup should proceed unless these remain the baseline gates.

## 1. Dead components

The following modules have no inbound imports, are not Next.js entrypoints,
are not referenced by string, and are not dynamically loaded:

| File                                  | LOC | Why removal is safe                                                            |
| ------------------------------------- | --: | ------------------------------------------------------------------------------ |
| `src/components/ui/badge.tsx`         |  51 | No imports or renders; status UI uses `StatusBadge` instead.                   |
| `src/components/ui/dropdown-menu.tsx` | 272 | No imports or renders; no dynamic references.                                  |
| `src/components/ui/select.tsx`        | 202 | No imports or renders; active filters use native controls or other primitives. |
| `src/components/ui/separator.tsx`     |  25 | No imports or renders.                                                         |
| `src/components/ui/sonner.tsx`        |  49 | No imports or renders; no `toast(...)` calls exist.                            |
| `src/components/ui/tabs.tsx`          |  82 | No imports or renders.                                                         |

**Confirmed removable component LOC: 681.**

No duplicate live components were proven. `VehicleCard` and the admin
`vehicle-grid` cards serve different public/admin contracts and interactions;
merging them would increase coupling without measurable value. Likewise, the
dashboard panels, cards, detail drawer, and modal primitives have distinct
semantics despite visual similarities.

## 2. Dead pages and route structure

No dead or duplicate page, layout, loading, error, or not-found route was
confirmed.

Important false positives that must remain:

- `src/app/global-error.tsx`
- `src/app/not-found.tsx`
- both route-group `layout.tsx` files
- both route-group `loading.tsx` files
- both route-group `error.tsx` files
- `src/proxy.ts`
- `src/app/(dashboard)/admin/page.tsx`, which intentionally redirects

The empty preview directories listed under folder cleanup contain no
`page.tsx`, so they expose no routes.

## 3. Unused assets

Five default scaffold assets in `public/` have no code, CSS, metadata, manifest,
or documentation references:

| Asset               | Bytes |
| ------------------- | ----: |
| `public/file.svg`   |   391 |
| `public/globe.svg`  | 1,035 |
| `public/next.svg`   | 1,375 |
| `public/vercel.svg` |   128 |
| `public/window.svg` |   385 |

All five are safe to delete. Their storage impact is small (3,314 bytes), but
removing them eliminates misleading scaffold residue.

`public/brand/alfa-logo-red.png` is live and tested. `src/app/favicon.ico` is a
Next.js metadata asset and must remain. There are no project `/assets` or
`/images` directories, and no unused video, font, JSON, mock-download, or logo
asset was found.

## 4. Hooks

No unused hook implementation was found.

`src/lib/use-focus-trap.ts` is consumed by the active detail drawer. The
`src/hooks` directory contains only `.gitkeep`; the placeholder directory can
be removed, but it does not represent dead hook logic.

## 5. Utilities, services, constants, and exports

### Completely dead module

`src/services/dashboard.service.ts` (38 LOC) has no inbound imports.
`getDashboardStats()` has been superseded by the active analytics/dashboard
data services. The entire file is safe to remove.

### Dead functions inside live modules

| Function              | File                               | Assessment                                                                                   |
| --------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `getVehicleBySlug`    | `src/services/vehicle.service.ts`  | Definition only. Public vehicle detail deliberately uses the restricted public-data service. |
| `getFleetCostSummary` | `src/services/fleet.service.ts`    | Definition only. Current analytics obtains its cost data elsewhere.                          |
| `sweepRateLimits`     | `src/lib/rate-limit.ts`            | Definition only; no cron, action, or opportunistic caller exists.                            |
| `businessYearStart`   | `src/lib/reservation-lifecycle.ts` | Definition only. Day, week, and month helpers are live.                                      |

These total about 39 additional executable LOC and can be removed in the safe
batch after one final reference check immediately before deletion.

### Export surface that can be narrowed

The following symbols are used only inside their declaring modules or not
imported elsewhere. Their implementations may still be live; the cleanup is
to remove unnecessary `export` modifiers, not delete the implementation:

- `ManualResult`
- the reservation action `ActionResult`
- `Stat`
- `ExistingImage`
- `VehicleFormValues`
- `UploadedImage`
- `AppError`
- `locales`
- `getLocale`
- `RateLimitResult`
- `BUSINESS_TIME_ZONE`
- validation schema helper exports used only locally
- `registrationFilters`
- `CustomerInput`
- `REGISTRATION_WARNING_DAYS`
- `RegistrationState`
- `AuthenticatedUser`

This is low-impact API-surface cleanup, but it should be a separate commit from
dead-code deletion because exported types can be useful to tests or future
module extraction.

## 6. Contexts and providers

No dead context or provider was found.

The following are all consumed and must stay:

- `ThemeProvider`
- `LocaleProvider`
- `ReservationDetailProvider`
- `NavigationScrollReset`
- the Auth.js route/provider boundary

There is one duplicate context hook alias:

- `useReservationDetail`
- `useDetailDrawer`

Both call `useContext(DetailContext)` and expose the same value. Standardize on
`useDetailDrawer`; this is a low-risk consolidation, not dead-context removal.

## 7. CSS and animation cleanup

### Confirmed dead CSS

- `.metric-num` is defined but never applied. Its only other occurrence is a
  comment in `stat-strip.tsx`.
- `.glass-l3` is defined and included in fallback selector groups but never
  applied by a component.
- reduced-motion selectors for `dropdown-menu-content`,
  `dropdown-menu-sub-content`, and `select-content` become dead when the
  unused dropdown/select modules are deleted.

This is approximately 15 CSS lines plus one stale comment.

### CSS that must remain

The drawer, overlay, and modal keyframes all have live animation utility
references. `.glass-l4`, `.glass-l5`, and `.glass-l6` are used by active
popover, drawer, dialog, and palette surfaces. The glass ladder is intentional,
not duplicate CSS. `tw-animate-css` is imported by the stylesheet and supports
live component animation utilities.

No CSS modules exist, so there are no orphaned module files. A static scan
cannot prove every generated Tailwind utility, but no suspicious hand-built
global selector beyond those above was found.

## 8. Duplicate logic

These are real consolidation candidates, but none should be mixed into the
safe deletion commit:

1. **Currency formatting.** Four local `eur` implementations exist. Two use
   whole-number locale formatting and two use `toFixed(2)`. Introduce one
   `formatEur(value, { precision, locale })` helper while preserving each
   screen's current precision.
2. **Date locale selection.** `locale === "sq" ? sq : enUS` and the same
   `date-fns/locale` imports are repeated across dashboard, reservation,
   customer, vehicle, calendar, repair, picker, and public listing modules.
   Add a typed `getDateLocale(locale)` helper.
3. **Seeded note translation.** The exact string
   `"Repeat customer, prefers automatic."` is recognized and translated in
   three components. Centralize this in `localizeCustomerNote`.
4. **Vehicle category labels.** Category-to-translation mapping is repeated
   across the form and fleet filters, while a few detail/table surfaces still
   print the raw enum. A shared mapping would remove duplication and prevent
   localization drift.
5. **Dashboard queries.** The admin layout fetches pending/registration
   summaries on every admin request, and the dashboard/reservations pages query
   overlapping data again. Use a request-scoped cached overview or a shared
   query result after confirming freshness requirements.

No repeated API wrapper was found. The API routes consistently use the shared
response/error utilities.

## 9. Package and dependency audit

### Unused package

`sonner` is the only confirmed unused production dependency. Its sole import is
inside the dead `src/components/ui/sonner.tsx` module, and no toast call exists.
Remove the component and package together, then regenerate `package-lock.json`.

`react-dom` is not directly imported but is required by the React/Next runtime
and must not be removed. Tooling dependencies such as Prisma, Tailwind,
TypeScript, ESLint, Prettier, Husky, lint-staged, `tsx`, and Vitest are used
through scripts/configuration even when they do not appear in application
imports.

### Available updates verified on 30 July 2026

Patch/minor candidates:

- `@hookform/resolvers` 5.4.0 → 5.5.7
- `@tailwindcss/postcss` 4.3.2 → 4.3.3
- `eslint-config-next` 16.2.11 → 16.2.12
- `lint-staged` 17.0.8 → 17.2.0
- `lucide-react` 1.24.0 → 1.28.0
- `next` 16.2.11 → 16.2.12
- `prettier` 3.9.5 → 3.9.6
- `prettier-plugin-tailwindcss` 0.8.0 → 0.8.1
- `react` / `react-dom` 19.2.4 → 19.2.8
- `react-hook-form` 7.81.0 → 7.83.0
- `tailwindcss` 4.3.2 → 4.3.3

Updates requiring deliberate migration:

- `@types/node` 20 → 26 is a runtime-target/type-platform decision, not a
  routine cleanup. The project engine is Node 20+, so keep v20 until the
  production runtime target changes.
- `typescript` 5.9.3 → 7.0.2 is a major compiler migration and must be isolated.
- `next-auth` reports 4.24.15 as “latest,” but this project intentionally uses
  5.0.0-beta.32. That result is a different release line and would be a
  downgrade/rewrite, not an update.

Dependency upgrades should be a separate reviewable batch from dead-code
deletion. Pair Next with `eslint-config-next`, and React with `react-dom`.

## 10. Bundle and Client Component analysis

The existing production manifests show the following directional raw client
chunk totals. These are uncompressed unique chunk sums per route, include
shared framework/runtime code, and are not equivalent to transfer size:

| Route                       | Raw client chunks |
| --------------------------- | ----------------: |
| `/admin/vehicles/[id]/edit` |         867.2 KiB |
| `/admin/vehicles/new`       |         862.3 KiB |
| `/admin/vehicles`           |         796.9 KiB |
| `/admin/reservations`       |         772.2 KiB |
| `/admin/calendar`           |         770.1 KiB |
| `/admin/customers`          |         761.7 KiB |
| `/admin/analytics`          |         756.2 KiB |
| `/admin/dashboard`          |         753.8 KiB |
| `/booking`                  |         705.8 KiB |
| `/login`                    |         484.0 KiB |
| `/car/[slug]`               |         367.7 KiB |
| `/car`                      |         273.9 KiB |

The largest raw generated chunks are approximately 288 KiB, 288 KiB, and
228 KiB. A supported `next experimental-analyze` run should be used during the
implementation phase to attribute these precisely and record compressed
before/after measurements.

### Main contributors and opportunities

1. **Global admin detail drawer graph.** `AdminShell` imports
   `ReservationDetailProvider`, which imports reservation, customer, vehicle,
   inspection, extension, image, date, and drawer UI. Every admin route
   therefore pays for the complete detail system. Split the lightweight
   context/dispatcher from dynamically loaded drawer bodies.
2. **Vehicle editor.** The new/edit routes legitimately include the media grid,
   drag-and-drop packages, form validation, and date controls. This is
   route-local, not dead weight. Lazy-loading the media workspace may improve
   first interaction, but only if UX measurements justify it.
3. **Booking and login forms.** React Hook Form, Zod, resolver, and date-picker
   code explain much of these route-specific totals. Rewriting the login form
   for bundle size alone is not currently justified.
4. **Unnecessary Client boundaries.** `AreaChart` became a Client Component
   solely to call `useI18n`, despite its own comment describing it as
   server-rendered. Pass its accessible label from the server and remove the
   boundary. `src/components/ui/table.tsx` is also purely presentational and
   can lose `"use client"`.
5. **Client module count.** 60 of 165 TypeScript/TSX files currently declare
   `"use client"`; six of those are dead UI modules. Most remaining boundaries
   are justified by state, effects, browser APIs, contexts, or interactive
   primitives.

Named imports are used for Lucide, date-fns, DnD, and other large libraries.
There is no whole-library import pattern likely to defeat tree shaking.
Namespace React imports in UI primitives are type/rendering style choices, not
evidence of shipping the entire React package twice.

Safe deletion alone will have almost no shipped-bundle effect because unused
modules are not in the route graph. The 5–15% route-level opportunity estimate
depends on boundary splitting and must not be claimed until analyzer output
confirms it.

## 11. Import hygiene

- ESLint reports zero unused imports.
- No duplicate imports were found.
- No incorrect alias paths were found.
- No circular imports were found.
- No active dynamic imports exist.
- No suspicious CommonJS `require()` exists in application code.
- React namespace imports are present in several UI primitives but are valid
  and tree-shaken.

## 12. Console statements and work markers

Six intentional console calls exist:

- two progress logs and one fatal error log in `prisma/seed.ts`;
- one unhandled server-error fallback in `src/lib/errors.ts`;
- one error report in each website/admin error boundary.

There are no stray browser debug logs, `console.warn`, `debugger`, `TODO`, or
`FIXME` markers. Removing the error logs would reduce production visibility.
The production improvement is to connect the error paths to structured
reporting, not silence them.

## 13. Environment variables

Confirmed live:

- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- all four `NEXT_PUBLIC_CONTACT_*` values
- seed credentials
- `NODE_ENV`

`NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` is documented in `.env.example` and the
README but never read. It is obsolete and safe to remove from both documents.
The server-side Cloudinary name remains required.

Cloudinary configuration currently relies on non-null assertions rather than
central startup validation. A typed server-only environment parser would turn
deployment misconfiguration into an immediate, descriptive startup failure.
That is production hardening, not dead-code deletion.

## 14. API layer

The active browser calls are:

- `POST /api/bookings`
- `GET /api/availability`

The Auth.js catch-all route is framework-consumed.

`GET /api/vehicles` has no internal caller; public pages call the public vehicle
service directly as Server Components. Its implementation is secure and uses
an explicit public allowlist, so there is no urgency to remove it. It is a
**conditional candidate only**: confirm that no mobile app, partner integration,
monitor, or documented consumer calls it before deletion. Repository evidence
cannot prove the absence of external clients.

No dead API wrapper or duplicate fetch layer was confirmed.

## 15. Folder and documentation cleanup

Empty/placeholder source folders:

- `src/app/__preview/vehicle`
- `src/app/preview-vehicle`
- `src/hooks` (contains only `.gitkeep`)

They can be removed. The preview directories are not tracked and therefore may
produce no Git diff; removing `src/hooks/.gitkeep` is the tracked cleanup.

Root documentation includes `AUDIT_REPORT.md`, `PERFORMANCE_AUDIT.md`,
`HANDOFF.md`, `README.md`, and the design proposal under `plans/`. The first
three contain historical findings and operational context. They overlap, but
deleting them without deciding which facts are still authoritative would be
unsafe. Consolidate current operational instructions into README/one handoff,
archive dated audits under `docs/audits/`, then remove only facts proven stale.

Editor and hook configuration (`.vscode`, `.claude`, `.husky`) is tracked and
actively useful; it is not production runtime code but is not dead.

## 16. Type-safety findings

Strengths:

- TypeScript `strict` mode is enabled.
- No explicit `any`, `@ts-ignore`, or lint-disable escape was found.
- The type checker is clean.

Targeted hardening:

- Cloudinary environment assertions are unsafe at deployment boundaries;
  replace them with central validated configuration.
- A few non-null assertions in rate-limit and media upload code follow local
  guards but can be expressed with narrower types.
- `allowJs` is enabled even though there is no JavaScript application source.
  Consider disabling it in an isolated config change.
- `noUnusedLocals` and `noUnusedParameters` are not enabled. ESLint catches
  ordinary unused imports, but enabling the compiler options would prevent some
  future dead internal declarations. Trial this separately because tests and
  generated types may surface findings.

No redundant null-check pattern was significant enough to justify a refactor.

## 17. Next.js-specific review

- Route groups are valid and do not affect URL paths.
- Layout, loading, error, global-error, not-found, metadata, and Auth.js route
  conventions match the installed Next.js 16 documentation.
- Dynamic/admin pages have legitimate cookie/session/database reasons to avoid
  static rendering.
- `next/image` is used for live image surfaces; the favicon follows file-based
  metadata conventions.
- Root fonts use `next/font`.
- `src/proxy.ts` is the Next.js 16 request boundary and is active; it is not
  unused middleware.
- Server Components are the default for pages; client boundaries are mostly
  localized to interactive code.
- There are currently no dynamic imports. The detail-drawer graph is the one
  high-value candidate.
- `/api/vehicles` is the only conditionally unused route.

## Phase 2 — prioritized cleanup plan

No plan item below has been executed.

### Batch A — Safe deletion

1. Delete the six dead UI modules.
2. Delete `src/services/dashboard.service.ts`.
3. Remove the four dead functions from live modules.
4. Delete the five unused scaffold SVGs.
5. Remove `src/hooks/.gitkeep` and local empty preview directories.
6. Remove `.metric-num`, `.glass-l3`, their stale comment/reference fragments,
   and reduced-motion selectors belonging only to deleted controls.
7. Remove `sonner` and refresh the lockfile.
8. Remove `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` from `.env.example` and README.
9. Re-run import/reference scans, lint, typecheck, tests, and production build.

Estimated effect:

- 13 tracked files deleted;
- about 775 code/CSS LOC deleted, plus lockfile churn;
- one production dependency removed;
- five public assets removed;
- 0–1% shipped bundle reduction;
- low runtime risk and moderate maintainability improvement.

Recommended commit boundaries:

1. dead UI + `sonner`;
2. dead services/functions;
3. assets/folders/CSS/env documentation.

### Batch B — Low/medium-risk consolidation

1. Standardize the detail context hook name.
2. Narrow unnecessary module exports.
3. Add shared currency, date-locale, seeded-note, and vehicle-category helpers,
   migrating one concern per commit with focused tests.
4. Remove unnecessary Client Component boundaries from `AreaChart` and
   `table.tsx`.
5. Apply compatible patch/minor dependency updates in small related groups.
6. Run the supported Next bundle analyzer and save before/after measurements.
7. Consolidate/archive overlapping root audit and handoff documents.

Estimated effect:

- roughly 80–180 net LOC reduction;
- no intended UI/API behavior change;
- small direct bundle gain;
- moderate consistency and localization-maintenance improvement;
- medium review risk because formatting and translations cross screens.

### Batch C — High-risk, measured architecture work

1. Split the admin detail context/dispatcher from dynamically loaded drawer
   content and action-specific bodies.
2. Deduplicate overlapping layout/dashboard/reservation database queries with
   request-scoped caching after defining freshness semantics.
3. Decide whether `GET /api/vehicles` has external consumers; deprecate before
   removal if it does.
4. Add central typed environment validation.
5. Evaluate route-local lazy loading for the vehicle media editor only after
   interaction and bundle measurements.
6. Treat TypeScript 7, Node type-target changes, or an Auth.js release-line
   migration as separate engineering projects.

Estimated effect:

- no reliable LOC reduction target; this is boundary/data-flow work;
- potential 5–15% raw route-client-chunk reduction;
- fewer duplicate database queries on affected admin requests;
- high regression risk around shared admin interactions, authentication,
  freshness, and external API contracts.

## Required approval gate

Phase 1 is complete. No deletion, dependency change, consolidation, or
architecture work should begin until this report is approved.

If approved, execute **Batch A only** first, keep its commits atomic, and stop
for review with:

- exact deleted files and LOC;
- dependency and lockfile diff;
- analyzer/build comparison;
- lint/typecheck/test/build results;
- a note confirming that public routes, admin login, localization, and booking
  behavior remain intact.
