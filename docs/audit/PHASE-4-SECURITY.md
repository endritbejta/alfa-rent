# Alfa Rent — Security Audit (Phase 4)

**Audit date:** 27 August 2026
**Method:** read-only. Static review plus **dynamic probing** — I executed the open-redirect
guard against real bypass inputs, and confirmed framework behaviour (Server Action CSRF,
Router Cache) against the installed Next.js 16 documentation rather than from memory.
**Status:** no code, config, schema or data was modified. No live system was attacked.

> **Scope note.** This is a defensive review of the owner's own application. Findings are
> written to be fixed, not exploited: no payloads, tooling or reproduction scripts beyond
> what is needed to identify the flaw.

---

## Executive summary

The security fundamentals here are **materially better than most applications of this
size**. Every mutation is authenticated and authorised server-side, every external input
is validated with Zod at the boundary, the ORM is used correctly throughout, secrets never
reach the client, and the one genuinely dangerous surface — direct-to-Cloudinary uploads —
is signature-verified with the URL rebuilt server-side.

There are **no confirmed remote-exploitable vulnerabilities against unauthenticated
attackers** other than the availability/resource issue in SEC-3.

The real risks are concentrated in three places: a **bypassable post-login redirect**, the
**absence of any way to manage or revoke staff accounts**, and two **unlimited public
database endpoints**. Everything else is hardening.

| Severity                           | Count  |
| ---------------------------------- | ------ |
| High                               | 1      |
| Medium                             | 5      |
| Low                                | 5      |
| Latent (payments off)              | 2      |
| Needs your environment             | 3      |
| **Verified sound — do not change** | **11** |

---

## 1. High

### SEC-1 · The post-login redirect guard is bypassable (open redirect → credential phishing)

|                   |                                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------------- |
| **Vulnerability** | Open redirect on `/login?callbackUrl=…`                                                                         |
| **Affected**      | [login/page.tsx:27-32](src/app/login/page.tsx:27) → [login-form.tsx:33](src/components/forms/login-form.tsx:33) |
| **Impact**        | Credential phishing against staff                                                                               |
| **Likelihood**    | Moderate — needs the victim to open a crafted link                                                              |
| **Severity**      | **High**                                                                                                        |
| **Confidence**    | Guard bypass **confirmed by execution**; final navigation **not** browser-verified (see below)                  |

The guard is a hand-rolled prefix check:

```js
callbackUrl?.startsWith("/") && !callbackUrl.startsWith("//")
  ? callbackUrl
  : "/admin/dashboard";
```

The WHATWG URL parser normalises backslashes to slashes and strips tab characters in
special schemes, so several inputs pass the check and still resolve off-origin. I ran them:

| Input              | Passes guard | Resolves to                 |
| ------------------ | ------------ | --------------------------- |
| `//evil.com`       | no           | _(app)_ — correctly blocked |
| `https://evil.com` | no           | _(app)_ — correctly blocked |
| `/\evil.com`       | **yes**      | **`https://evil.com/`**     |
| `/\/evil.com`      | **yes**      | **`https://evil.com/`**     |
| `/<TAB>/evil.com`  | **yes**      | **`https://evil.com/`**     |

**Why the framework's own protection does not apply here.** `LoginForm` calls
`signIn("credentials", { redirect: false })` and then `router.push(callbackUrl)` itself.
Auth.js's built-in same-origin redirect validation is therefore bypassed by design, leaving
this check as the only control.

**Attack scenario.** An attacker sends a staff member a link on the **genuine** domain —
`https://alfa-rent.vercel.app/login?callbackUrl=/\evil.com`. The victim sees the real login
page on the real domain, signs in successfully, and is then navigated to the attacker's
site, which shows a convincing "your session expired, please sign in again" form. The
victim has just been trained by a legitimate sign-in that this flow is normal.

**What I did not verify.** Whether Next 16's client router performs the cross-origin
navigation or refuses it. Completing that check needs a running app with a database, which
I did not have. The **guard bypass itself is confirmed**; treat the navigation as likely
until tested.

**Recommendation.** Parse rather than pattern-match, and pin to the admin area:

```js
function safeCallback(raw?: string) {
  try {
    const u = new URL(raw ?? "", "http://internal");
    return u.origin === "http://internal" && u.pathname.startsWith("/admin")
      ? u.pathname + u.search
      : "/admin/dashboard";
  } catch { return "/admin/dashboard"; }
}
```

Effort: trivial.

---

## 2. Medium

### SEC-2 · There is no way to create, deactivate or revoke a staff account

|                   |                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------- |
| **Vulnerability** | Missing account lifecycle controls; unbounded session lifetime                                |
| **Affected**      | [auth/config.ts:13-15](src/lib/auth/config.ts:13), `User.sessionVersion`, whole admin surface |
| **Impact**        | A stolen laptop or exfiltrated token stays valid, with no in-app remedy                       |
| **Severity**      | Medium · **Confidence:** confirmed                                                            |

Three facts compound:

1. **`session` sets only `strategy: "jwt"`** — no `maxAge`. Auth.js's default applies: **30
   days**, refreshed on activity, so an actively used token effectively never expires.
2. **`sessionVersion` has no writer anywhere in the application.** The schema comment says
   _"Incrementing this immediately invalidates every previously issued JWT"_ — the
   mechanism is built and correctly read by `requireUser()` on every request, but nothing
   in the app ever increments it.
3. **There is no staff-management UI at all.** The only way a `User` row is ever created is
   the destructive seed. Creating, deactivating or revoking staff requires direct database
   access.

**Attack scenario.** A staff laptop is stolen, or a session cookie is captured. The
business has no way to end that session without someone with production database
credentials running SQL. In the meantime the token grants full EMPLOYEE (or ADMIN) access
for up to 30 days of inactivity.

**Credit where due:** the _detection_ half is excellent — `requireUser()` re-reads the user
row on **every** protected request, so `active: false` takes effect immediately rather than
at token expiry. The gap is purely that nothing can set it.

**Recommendation.** (a) Set an explicit `session.maxAge` (an 8–12 hour working day is
appropriate for a counter application). (b) Add a minimal staff admin page — list, invite,
deactivate, and "sign out everywhere" (increment `sessionVersion`). This is the single
highest-value security feature the app is missing. Effort: medium.

### SEC-3 · Two unauthenticated database endpoints have no rate limit

|                   |                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Vulnerability** | Resource exhaustion / availability                                                                                      |
| **Affected**      | [api/vehicles/route.ts](src/app/api/vehicles/route.ts) · [api/availability/route.ts](src/app/api/availability/route.ts) |
| **Impact**        | Site-wide outage including staff sign-in                                                                                |
| **Severity**      | Medium · **Confidence:** confirmed                                                                                      |

Every other public entry point is limited — bookings 8/hour/IP, checkout 5/hour, upload
signatures 40–60 per 5 min. These two have none:

| Endpoint                      | Limiter  | Work per request                                                                                                               |
| ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/vehicles`           | **none** | Paged query + count; with `?q=` an unindexed `ILIKE '%…%'`; with `from`/`to` a correlated `reservations: { none: … }` subquery |
| `GET /api/availability`       | **none** | Vehicle lookup + reservation count + a second vehicle lookup for the quote                                                     |
| `POST /api/bookings`          | 8/hr/IP  | —                                                                                                                              |
| `POST /api/payments/checkout` | 5/hr     | —                                                                                                                              |

**Why it matters more than usual here.** Production runs through a pooler documented at
`connection_limit=1`, and **every page in the app is `force-dynamic` with no caching**. The
same single connection serves staff sign-in. Saturating it takes the dashboard down with
the storefront.

**Recommendation.** Apply the existing `consumeRateLimit` helper to both, generously
(these are legitimate browse endpoints). Independently, `/api/vehicles` has **no internal
caller** — the public pages call the service directly — so confirm no external consumer and
consider removing it. Effort: trivial.

### SEC-4 · Any employee can mint Cloudinary write credentials for an arbitrary id

|                   |                                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Vulnerability** | Missing object-level authorisation on a credential-issuing action                                                      |
| **Affected**      | [reservations/actions.ts:30-54](<src/app/(dashboard)/admin/reservations/actions.ts:30>) · `signInspectionUploadAction` |
| **Impact**        | Storage/bandwidth abuse; planted images in folders that look like evidence                                             |
| **Severity**      | Medium · **Confidence:** confirmed                                                                                     |

The action checks the role and the rate limit, then signs an upload for
`inspectionFolder(reservationId, type)` **without ever verifying that the reservation
exists, or that it is in a state where an inspection is permitted.**

Path traversal _is_ blocked — `assertSafeId` enforces `^[a-z0-9-]{8,64}$` — but any string
matching that pattern is accepted. An authenticated EMPLOYEE (the lower-privileged role)
can therefore obtain signed credentials to write into
`alfa-rent-a-car/inspections/<any-id>/pickup`, at 40 signatures per 5 minutes, each usable
for multiple uploads.

**Attack scenario.** A departing employee, or anyone with a compromised staff session,
fills the Cloudinary account with arbitrary images, incurring cost and burying genuine
inspection evidence among plausible-looking folders. Note that `recordRentalInspection`
_does_ verify the folder prefix at save time, so planted files cannot be attached to a real
inspection — but they are still stored and billed.

**Recommendation.** Load the reservation first and check it is in a state that expects this
inspection type, exactly as `recordRentalInspection` already does. The same applies to
`signVehicleUploadAction`, which accepts an arbitrary `vehicleId`/`draftId` (ADMIN-only, so
lower risk). Effort: small.

### SEC-5 · The Content-Security-Policy has no `script-src` or `default-src`

|                   |                                                   |
| ----------------- | ------------------------------------------------- |
| **Vulnerability** | Missing defence-in-depth (not itself exploitable) |
| **Affected**      | [next.config.ts:5-8](next.config.ts:5)            |
| **Severity**      | Medium as hardening · **Confidence:** confirmed   |

The policy is:

```
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

Those four directives are genuinely useful — they block base-tag injection, form
hijacking, clickjacking and plugin content. But with **no `default-src` and no
`script-src`, script execution is entirely unrestricted**, so the CSP contributes nothing
against XSS.

**Being precise about this:** I found **no XSS vector** — no `dangerouslySetInnerHTML`, no
`innerHTML`, no `eval`, no `new Function`, no user-controlled `href`/`src`, and React
escapes all rendered content. So this is a missing safety net, not a live hole. It is
listed as medium because the app handles staff credentials and customer PII, where a
second layer is warranted.

**Recommendation.** Add a nonce-based `script-src` (Next 16 supports nonces via the proxy)
plus `default-src 'self'` and `img-src 'self' https://res.cloudinary.com data:`. Do it
behind a report-only rollout first — a strict CSP interacts with Next's inline bootstrap
scripts and Google Fonts, and getting it wrong breaks the app. Effort: medium.

### SEC-6 · Any employee can read per-vehicle profitability, though only admins can edit vehicles

|                   |                                                                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Vulnerability** | Read/write privilege asymmetry                                                                                                                 |
| **Affected**      | [detail-actions.ts:106-115](<src/app/(dashboard)/admin/detail-actions.ts:106>) → [fleet.service.ts:155-171](src/services/fleet.service.ts:155) |
| **Severity**      | Medium — **but this may be intended**; verify before treating as a defect                                                                      |
| **Confidence**    | Code behaviour confirmed; business intent unknown                                                                                              |

`getVehicleDetailAction` guards with `requireUser()` only — any active staff member. It
returns a `costs` block containing registration cost, servicing cost, lifetime and
year-to-date repair spend, revenue earned, cost per month/year, and **net profit per
vehicle**.

Every _write_ to a vehicle requires `requireRole("ADMIN")`, and the file that defines them
carries the comment _"Vehicle management is ADMIN-only; EMPLOYEE manages reservations."_
The read path does not follow that rule. Compounding it, Phase 2 established this drawer is
reachable only through the ⌘K palette — so it is an effectively hidden capability.

**Recommendation.** Decide the intent and encode it. If employees should not see fleet
economics, change the guard to `requireRole("ADMIN")` and split the payload so the
identity/gallery portion stays employee-visible. If they should, add a comment saying so —
right now the asymmetry reads as an oversight.

---

## 3. Low

| #          | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Detail |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **SEC-7**  | **`deleteRepairAction` does not verify the repair belongs to the vehicle.** [vehicles/actions.ts:155-167](<src/app/(dashboard)/admin/vehicles/actions.ts:155>) passes `repairId` straight to `prisma.repair.delete({ where: { id } })`; `vehicleId` is used only to build the revalidate path. Impact is bounded — the caller is already ADMIN and can delete any repair through the UI anyway — so this is a **defence-in-depth gap, not privilege escalation**. It becomes real the moment a role is added between EMPLOYEE and ADMIN.                                                                                                              |
| **SEC-8**  | **Vehicle images verify the signature but not the folder; inspection photos verify both.** [image.service.ts:57](src/services/image.service.ts:57) checks only `verifyUploadSignature(item)`, while [inspection.service.ts:97](src/services/inspection.service.ts:97) additionally requires `publicId.startsWith(folder + "/")`. An ADMIN could therefore attach _any_ signed asset in the account — including another rental's inspection photos, which may show damage, plates or a customer signature — to a **public** vehicle listing. The correct check already exists 40 lines away.                                                           |
| **SEC-9**  | **Public bookings are not email-verified, so a real customer's record can be polluted.** `findOrCreateCustomerByEmail` deliberately never updates an existing customer ([customer.service.ts:15-24](src/services/customer.service.ts:15) — a good decision, since the path is anonymous). The consequence is that anyone who knows a customer's email can attach fabricated reservations to that customer's record, which staff then see in their history. Mitigated by the 8/hour IP limit and by staff confirming by phone before anything is committed. Inherent to booking-without-an-account; worth accepting knowingly rather than by accident. |
| **SEC-10** | **A payment capability token is minted and transmitted for every public booking, then discarded.** [reservation.service.ts:163,192](src/services/reservation.service.ts:163) creates a 256-bit token and returns it in the 201 body; the form stores it in React state and **never uses it** (payments are off). An unnecessary secret on the wire, in browser memory and in any proxy log, protecting nothing.                                                                                                                                                                                                                                       |
| **SEC-11** | **The generic 500 path logs the entire error object.** [errors.ts:125](src/lib/errors.ts:125) `console.error("Unhandled error:", error)` fires only for unrecognised errors — which is exactly when the object is most verbose. A `PrismaClientKnownRequestError.meta` can carry field names and values (e.g. the conflicting customer email). These land in Vercel logs with no documented retention or redaction policy, which is a GDPR consideration for a business holding EU customer PII.                                                                                                                                                      |

---

## 4. Latent — cannot be exploited until payments are enabled

Payments are inert four ways (no adapter registered, flag off, provider unset, no UI
caller). Fix before registering a bank adapter.

- **SEC-L1 · The webhook endpoint has no rate limit and no authenticity check of its own.**
  [api/payments/webhook/route.ts](src/app/api/payments/webhook/route.ts) reads the body,
  size-caps it, and delegates _all_ verification to `provider.parseAndVerifyWebhook`. That
  is a correct design — signature verification belongs to the adapter — but it means the
  endpoint's entire security depends on an adapter that does not exist yet. The 256 KB
  guard also runs _after_ `request.text()` has already buffered the body, so it cannot
  prevent the allocation it exists to bound.
- **SEC-L2 · The checkout limiter key embeds an unvalidated `reservationId`**
  (`payment-checkout:<reservationId>:<ip>`), and nothing ever prunes `rate_limits`, so
  random ids mint unbounded rows in a table with no cleanup job.

---

## 5. Needs your environment to resolve

| #        | Question                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Why it matters |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **NV-1** | **Does Vercel replace or append to a client-supplied `x-forwarded-for`?** [rate-limit.ts:68-72](src/lib/rate-limit.ts:68) takes the **left-most** value. The comment asserts _"A spoofed header only ever splits an attacker's own bucket"_ — true **only if the platform overwrites the header**. If Vercel appends the real client IP instead, the left-most value is attacker-controlled and **the login brute-force limiter can be bypassed entirely** by rotating the header. This is the single highest-impact unknown in this audit. **Test:** send a request with a fabricated `x-forwarded-for` and inspect what the handler reads. If it is attacker-controlled, switch to the platform-provided client IP. |
| **NV-2** | **Has the credential-rotation incident recorded in `HANDOFF.md` §6.1 been completed?** The handoff states that production database and signing secrets were previously disclosed and must be treated as compromised until rotation is independently verified. Nothing in the repository can confirm this either way. If not done, it outranks every finding above.                                                                                                                                                                                                                                                                                                                                                    |
| **NV-3** | **Are there dependency CVEs?** — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### On `npm audit`

I have **not run it**, because the prior audit declined it on the grounds that it discloses
this private project's full dependency inventory to the public registry, and you have not
authorised it.

One factual correction worth your consideration: **`npm ci` has already fetched every
package at every version from the registry** during this audit, so the registry already
holds that request log. The marginal disclosure from `npm audit` is close to nil. There is
no genuinely offline alternative — every advisory source requires a network fetch.

What I do know locally: `npm ci` reported that vulnerabilities exist and suggested
`npm audit fix`, but the count and severity were in the part of the log I did not capture.

Two related observations that need no network:

- **`overrides` already pins `postcss@8.5.19` and `sharp@0.35.0`** — evidence that
  transitive advisories have been handled deliberately before. Good practice.
- **`next-auth@5.0.0-beta.32` is a beta release line handling production authentication.**
  This is a deliberate, documented choice (v4 would be a downgrade, not an upgrade), but
  betas carry a real risk: security fixes may not be backported, and moving within the beta
  line can bring breaking changes. Worth an explicit decision and a watch on the release
  notes rather than leaving it implicit.

**Say the word and I will run `npm audit` and fold the results in.**

---

## 6. Verified sound — do not change these

Each was actively probed. Several are the reason the risk list above is as short as it is.

1. **No XSS vector exists.** No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or
   `new Function` anywhere in 19k lines. Every `src` is a Cloudinary URL **rebuilt
   server-side** from a verified `public_id`; every `href` is an internal route or
   deployment config.
2. **No SQL injection surface.** Prisma throughout; exactly one raw query
   ([rate-limit.ts:28](src/lib/rate-limit.ts:28)) and it uses a tagged template, so values
   are parameterised. No `$queryRawUnsafe`/`$executeRawUnsafe` anywhere.
3. **CSRF is covered.** I confirmed from the installed docs that Next compares the Origin
   of every Server Action against the host and allows only same-origin unless
   `allowedOrigins` is set — which this project does not set. The two public POST route
   handlers take `application/json` (not a CORS-simple request) and carry no user
   authority. Auth.js's own routes carry CSRF tokens.
4. **Authorisation is layered three deep and complete.** The proxy gates `/admin/*`
   optimistically, the admin layout calls `requireUser()`, every page calls a guard, and
   **all 16 server actions call a guard** — I enumerated them. `requireUser()` re-reads the
   user row on every request, so deactivation and role changes take effect immediately
   rather than at token expiry.
5. **Password verification is careful.** bcrypt hashes; a dummy compare against a fixed
   hash when the email is unknown, so response timing does not reveal account existence;
   one generic error for every failure mode including rate-limiting.
6. **The login limiter is keyed by IP, not email — deliberately.** An email-keyed limiter
   would let an attacker lock real staff out of their own accounts. Only failures count and
   success clears the window. The reasoning is documented at
   [auth/index.ts:9-18](src/lib/auth/index.ts:9). **Correct; do not "improve" it.**
7. **The direct-upload design is sound.** The signature covers `folder` _and_
   `transformation`, so a caller cannot retarget the upload or skip the server-side resize;
   the response signature over `(public_id, version)` is re-derived server-side; and the
   stored URL is **rebuilt from the verified id**, never taken from the client.
   `assertSafeId` blocks path traversal into other folders.
8. **Secrets never reach the client.** Zero `process.env` reads in client components. Only
   four `NEXT_PUBLIC_` variables exist, all non-sensitive contact details. `.env*` is
   gitignored and no `.env` is tracked. No hardcoded credential anywhere. _(The bcrypt hash
   at [user.service.ts:29](src/services/user.service.ts:29) is the timing-equalisation
   dummy, not a real credential.)_
9. **The payment capability token is implemented correctly** — SHA-256 hash stored,
   compared with `timingSafeEqual`, and an unknown reservation returns the **identical**
   404 as a bad token, so the endpoint cannot enumerate booking references.
10. **Row-level security is enabled on all 10 tables with zero policies** (deny by default
    for Supabase's `anon`/`authenticated` roles), plus privilege and default-privilege
    revokes, with a test that derives the table list from the schema so a new model cannot
    be forgotten. Genuine defence in depth.
11. **Error responses do not leak internals.** `normalizeError` maps known errors to curated
    messages and everything else to a generic 500. Zod failures expose a field path only.
    The seed refuses to run without an explicit destructive acknowledgement and two
    distinct 16-character passwords.

---

## 7. Priority

1. **NV-2** — confirm the credential rotation is complete. Outranks everything if not.
2. **NV-1** — determine whether the rate limiter is header-bypassable. One test; decides
   whether brute-force protection exists at all.
3. **SEC-1** — the redirect guard. Trivial fix, real phishing value.
4. **SEC-3** — rate-limit the two open endpoints. Trivial fix, prevents an availability
   incident that would also take staff login down.
5. **SEC-2** — session `maxAge` now; staff management as a proper piece of work.
6. **SEC-4**, **SEC-6**, then the low findings and the CSP rollout.

---

_End of Phase 4. No code was modified. Phase 5 (Frontend / UX / Accessibility) has not begun._
