# Backup and restore runbook

For the owner/operator of Alfa Rent. It says what has to be recoverable, where
the backups are, how to restore one **without touching production**, how to
prove the restore is sound, and how to cut the app over to it.

Read [What never to do](#8-what-never-to-do) before you start a real restore.

Closes audit finding P2-12 ("backup and restore are neither documented nor
tested"). Last rehearsed: see the [rehearsal log](#9-rehearsal-log).

---

## 1. What must be recovered

| Asset                                                                                   | Where it lives                   | Recovered how                                                                              |
| --------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| **Postgres database**: bookings, customers, fleet, repairs, inspections, staff accounts | Supabase project (production)    | Supabase backup / PITR, or the independent `pg_dump` ([§4](#4-independent-logical-backup)) |
| **Images**: vehicle gallery and rental-inspection photos                                | Cloudinary (`alfa-rent-a-car/…`) | Cloudinary's own backup, if enabled ([§1.1](#11-cloudinary-images)). Not in any DB backup  |
| **Configuration and secrets**: the Vercel environment variables                         | Vercel project settings          | Re-entered from the password manager ([§1.2](#12-vercel-environment))                      |
| **Code**                                                                                | GitHub `endritbejta/alfa-rent`   | Redeploy from `main`. Vercel keeps previous deployments, which can be promoted again       |

**The database is the system of record.** Everything else can be recreated or
lives with a vendor. The app is stateless: a Vercel deployment holds no data.

Supabase is used here only as a Postgres server. The app does not use
Supabase Auth, Storage, Realtime or Edge Functions. Everything the app owns
is in the `public` schema, so that is the only schema a backup has to carry.

### 1.1 Cloudinary images

The database stores each image's Cloudinary `publicId`, not the image itself.
A database restore does not bring back a deleted image, and a Cloudinary
outage does not touch the database.

- **Inspection photos are evidence** for damage disputes. Losing them is worse
  than losing a gallery photo, which can be retaken.
- **Operator to confirm:** whether Cloudinary's backup option is enabled for
  the product environment (Cloudinary console → Settings → Backups; it is a
  paid-plan feature). If it is not, either enable it or accept that a deleted
  or overwritten image is gone.
- **After a database restore to an earlier point:** images uploaded after
  that point are orphaned in Cloudinary (harmless), and images deleted after
  that point are referenced but missing. Those show as broken images; remove
  the row in the admin, or restore the asset from Cloudinary's backup.

### 1.2 Vercel environment

Vercel marks the variables Sensitive, so they cannot be read back
(`vercel env pull` returns empty strings, see `HANDOFF.md` §5). The source of
truth for every value must therefore be the **password manager**, not Vercel.

Variables to keep there (names from `.env.example`): `DATABASE_URL`,
`DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL`, `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`,
`STAFF_NOTIFICATION_EMAILS`, `CRON_SECRET`, the `NEXT_PUBLIC_CONTACT_*` values, `SITE_URL` /
`SITE_INDEXING` if set, and any `PAYMENT_*` values.

To recreate the Vercel project: import the repo, enter the variables
(Production scope for `DATABASE_URL` / `DIRECT_URL`, see README
"Deployment"), deploy. If `AUTH_SECRET` is lost, generate a new one; the only
cost is that every staff member is signed out.

---

## 2. Supabase backups

As described in Supabase's docs (`/docs/guides/platform/backups`) on
13 Nov 2026. Re-check the page if the plan changes.

|                 | Daily backups                                                    | Point-in-time recovery (PITR)                          |
| --------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| **Plans**       | Pro (7 days), Team (14 days), Enterprise (≤30)                   | Paid add-on on Pro, Team, Enterprise; any compute size |
| **Free plan**   | **None.** Supabase tells Free projects to export their own dumps | Not available                                          |
| **Granularity** | One snapshot per day                                             | To the second; WAL archived about every 2 minutes      |
| **Retention**   | As above, by plan                                                | 7, 14 or 28 days (chosen with the add-on)              |
| **Notes**       | Replaced by PITR when PITR is on                                 | Physical; not downloadable                             |

What it means here:

- **A Supabase restore replaces the live database in place**, and the project
  is offline while it runs. A bad migration is reverted that way, but so is
  every booking made since the restore point. That is why the procedure below
  restores into a **scratch target first**.
- On paid plans Supabase can also **restore to a new project** (a binary
  clone of the backup, leaving the source untouched). That is the preferred
  scratch target for a production restore.
- Backups exclude Storage objects (unused here) and custom-role passwords
  (unused here: the app connects as `postgres`).
- None of this helps if the project or the Supabase account itself is lost
  or deleted. That is what [§4](#4-independent-logical-backup) is for.

### 2.1 Operator checklist (to confirm in the Supabase dashboard)

I could not see the dashboard. Nothing below is assumed; tick each one and
record the answer and date in the [rehearsal log](#9-rehearsal-log).

- [ ] **Plan** of the production project (Organization → Billing): Free / Pro / Team / Enterprise. _Operator to confirm._
- [ ] **Daily backups are listed** (Project → Database → Backups), and the newest is from the last 24 h. _Operator to confirm._
- [ ] **Retention**: how many days of backups are listed. _Operator to confirm._
- [ ] **PITR**: on or off; if on, its retention window. _Operator to confirm._
- [ ] **Postgres version** of the project (Project → Settings → Infrastructure). The local `pg_dump` must be the same major version or newer. _Operator to confirm._
- [ ] **Region**, for the privacy notice (`src/lib/legal-facts.ts`) and for choosing where dumps are stored. _Operator to confirm._
- [ ] **Who has dashboard access** and whether they use 2FA: anyone with it can restore over production. _Operator to confirm._

If the project is on **Free**, there are no Supabase backups at all, and the
independent dump in §4 is the only backup that exists. Upgrading to Pro is
the cheapest way to get one.

---

## 3. RPO and RTO

Proposed targets. They are the business's decision, not engineering's; agree
them and record them here.

| Scenario                                | RPO (data you can lose)                                    | RTO (time to working app) |
| --------------------------------------- | ---------------------------------------------------------- | ------------------------- |
| Bad migration or bad bulk edit, PITR on | **≤ 5 minutes**                                            | **≤ 4 hours**             |
| Same, daily backups only (Pro)          | **≤ 24 hours**                                             | **≤ 4 hours**             |
| Supabase project or account lost        | **Age of the newest dump** (target ≤ 24 h, never > 7 days) | **≤ 1 business day**      |

Reasoning:

- **Volume is small.** A day is tens of bookings, not thousands, and every
  website booking request also reaches staff by email
  (`STAFF_NOTIFICATION_EMAILS`, `src/services/notification.service.ts`).
  Losing a day is painful but recoverable by re-entering from those emails and
  staff memory. Losing a week is not.
- **The database part is fast.** The local rehearsal restores in under a
  second; a production-sized database (megabytes, not gigabytes) should take
  minutes. The RTO is set by everything else: deciding to restore, confirming
  the restore point, verifying, changing Vercel env, redeploying, telling
  staff. Four hours during business hours is realistic for one operator.
- **PITR buys the RPO, not the RTO.** It is worth turning on if a day of lost
  bookings would cost more than the add-on; that is a cost call for the owner.
- **The account-loss RPO is set by how often §4 runs.** Weekly is the floor;
  daily is the target once it is automated.

---

## 4. Independent logical backup

A `pg_dump` the operator holds, independent of Supabase. It protects against
account loss, project deletion, and a Free plan with no backups.

**When:** at least weekly, **and before every production deploy that contains
a new migration** (anything new under `prisma/migrations/`). The Vercel
production build runs `prisma migrate deploy` (`scripts/vercel-build.sh`) and
there are no down-migrations, so that dump is the undo button.

### 4.1 Taking the dump

Use the **direct** connection (`DIRECT_URL`, port 5432), never the pooled
`DATABASE_URL` (port 6543, PgBouncer in transaction mode, which `pg_dump`
cannot use). Supabase's direct host is IPv6-only unless the IPv4 add-on is
enabled; if your network has no IPv6, use the **Session pooler** string from
the dashboard (Connect → Session pooler, also port 5432) instead.

Strip any `?pgbouncer=…&connection_limit=…` suffix: those are Prisma options
and `libpq` rejects them.

```bash
# Paste the URL at the prompt so it never lands in shell history.
read -rs PGURL
DUMP="alfa-rent-$(date -u +%Y%m%dT%H%MZ).dump"
pg_dump --format=custom \
  --schema=public --extension=btree_gist \
  --file="$DUMP" \
  "$PGURL"
unset PGURL
```

Why these flags (each one was checked in the rehearsal):

- `--format=custom`: compressed, and `pg_restore` can list and filter it.
- `--schema=public`: the app's tables only. A whole-database dump of a
  Supabase project also carries Supabase's own schemas (`auth`, `storage`,
  `realtime`, …), which collide with the ones a fresh project already has.
- **`--extension=btree_gist` is not optional.** With `--schema=public` alone,
  `pg_dump` leaves the extension out. Restoring that dump fails on
  `reservations_no_overlap` with _data type text has no default operator class
  for access method "gist"_, and without `--exit-on-error` `pg_restore` skips
  the constraint and carries on. The result is a database that accepts
  double bookings.
- Connect as `postgres`, the table owner. `pg_dump` run as a role subject to
  RLS would fail (or, with `--enable-row-security`, silently dump only the
  rows that role can see).

Check it is readable and complete before storing it:

```bash
pg_restore --list "$DUMP" | grep -E "EXTENSION - btree_gist|CONSTRAINT public reservations reservations_no_overlap|ROW SECURITY" | wc -l
# expect 14 today: the extension, the constraint, and one ROW SECURITY line
# per table (the 11 @@map tables in schema.prisma plus _prisma_migrations)
```

Use the exact file name (`$DUMP`), not a glob: with two dumps in the folder,
`pg_restore --list` refuses the second argument, and the pipe turns that
error into a misleading `0`.

### 4.2 Encryption, storage, retention

**The dump contains customer personal data**: names, phone numbers, emails,
ID and licence details, booking history, and staff password hashes. Treat it
like the production database.

- **Encrypt before it leaves the machine**, e.g.
  `gpg --symmetric --cipher-algo AES256 alfa-rent-….dump` (or `age -p`), then
  delete the plaintext. Keep the passphrase in the password manager, not
  next to the file.
- **Store it off Supabase and off the laptop**: an access-restricted bucket or
  drive in a region the privacy notice allows (§2.1 "Region"). Never in the
  repo, a shared folder, email, or chat.
- **Retention**: proposed 7 daily, 4 weekly, 3 monthly, then delete. It must
  not exceed the customer-data retention period the business sets in
  `src/lib/legal-facts.ts` (privacy notice, PR #26); a backup kept longer
  than the notice promises is a privacy breach in waiting.
- **Anonymisation and old backups.** `anonymiseCustomer`
  (`src/services/customer.service.ts`, PR #26) clears a customer's details in
  the live database, but older dumps still hold them. If you ever restore one,
  re-anonymise everyone anonymised after the dump was taken (see §6, step 4).
- Delete expired dumps for real (and from the bucket's version history).

---

## 5. Restore procedure (into a scratch target)

**Never restore over production first.** Restore somewhere disposable, prove
it is sound, then cut over (§7). Production stays untouched until the very
last step, so every step before it can be abandoned safely.

### 5.0 Decide and write down

- Why you are restoring, and the **restore point** (a timestamp, or a dump
  file name). Prisma stores timestamps in UTC; the dashboard shows its own
  time zone. Write the restore point in UTC.
- If the cause is a bad migration: **revert it on `main` first.** Otherwise
  the next production deploy re-applies it to the restored database.
- Tell staff to stop editing until told otherwise. There is no maintenance
  mode; bookings made after this point may need re-entering.

### 5.1 Choose the scratch target

| Source                        | Scratch target                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Supabase daily backup or PITR | Dashboard → Database → Backups → **Restore to a new project** (paid plans). Skip to §5.3 |
| An independent dump (§4)      | A **new, empty Supabase project** in the same region, or a local Postgres for a check    |

### 5.2 Restore a dump with `pg_restore`

On a fresh database the `public` schema already exists, and a
`--schema=public` dump tries to create it. Leave that one entry out with a
list file:

```bash
pg_restore --list alfa-rent-….dump | grep -v " SCHEMA - public " > restore.list

read -rs SCRATCH_URL   # direct URL of the SCRATCH project, never production
pg_restore --no-owner --no-privileges --exit-on-error \
  --use-list=restore.list --dbname="$SCRATCH_URL" alfa-rent-….dump
```

- **`--exit-on-error` always.** Without it, `pg_restore` logs errors, says
  _errors ignored on restore: N_, and leaves a half-restored database that
  looks fine.
- **`--no-owner`**: objects become owned by the role you connect as
  (`postgres` on Supabase). Without it, every `ALTER … OWNER TO` names the
  source role, and a non-superuser target fails with _must be able to SET
  ROLE_ (20 errors in the rehearsal). Supabase's `postgres` is not a
  superuser.
- **`--no-privileges`** drops `GRANT`/`REVOKE` only. It does **not** drop
  row-level security: `ENABLE ROW LEVEL SECURITY` is a separate dump entry
  and is restored either way (verified: 12/12 tables). This schema has no RLS
  policies (RLS is on with none, which denies Supabase's API roles); if
  policies are ever added, they too are restored regardless of this flag.
- **`btree_gist`** is created by the restore. It is a trusted extension, so
  a database owner without superuser can create it (verified with a
  non-superuser role).

**Re-apply the Data API lockout (Supabase targets only).** `--no-privileges`
means the restored tables pick up Supabase's default grants to `anon` and
`authenticated`. RLS still blocks them, but production has those grants
revoked too, and the restore should match. Run the `DO $security$ … $security$`
block from
`prisma/migrations/20260729134500_secure_public_schema_rls/migration.sql`
against the scratch database (SQL editor or `psql`), then check:

```sql
SELECT grantee, count(*) FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
GROUP BY grantee;
-- expect no rows
```

### 5.3 `prisma migrate status`

From a checkout of the commit production runs, with both URLs pointed at the
scratch database. Prisma, unlike `psql`, needs the user name in the URL.

```bash
DATABASE_URL="$SCRATCH_URL" DIRECT_URL="$SCRATCH_URL" npx prisma migrate status
# expect: "Database schema is up to date!"
```

If it lists migrations _not yet applied_, the backup predates them. That is
expected for an older restore point; `prisma migrate deploy` applies them, and
so will the production build after cutover. Do not use any other command
to fix it.

**`migrate status` is not a health check.** It only compares the
`_prisma_migrations` table with the folder. In the rehearsal it still said
"up to date" after the exclusion constraint, one table's RLS and one CHECK
had been dropped. That is what §5.4 is for.

### 5.4 Verify the four objects Prisma does not model

`schema.prisma` knows nothing about these, so nothing else will notice if a
restore loses them:

1. the `reservations_no_overlap` GiST exclusion constraint, the only real
   guarantee against double-booking;
2. the `btree_gist` extension it depends on;
3. row-level security on every table;
4. the two CHECK constraints on `rental_inspections`.

**Option A, the script** (read-only, exits non-zero if any is missing):

```bash
scripts/verify-restore.sh "$SCRATCH_URL"
```

It reads the expected table list from `prisma/schema.prisma`, so a table the
restore lost entirely fails the check. It keeps `sslmode` and the other
libpq options in the URL, drops only Prisma's own (`pgbouncer`,
`connection_limit`, …), and passes the password to `psql` through
`PGPASSWORD` rather than its command line.

```
ok    reservations_no_overlap exclusion constraint (x)
ok    btree_gist extension (1.7)
ok    row-level security on every table (12/12)
ok    rental_inspections CHECK constraints (rental_inspections_fuel_level_check, rental_inspections_mileage_check)

All four unmodelled objects are present.
```

**Option B, the integration test** (read-only; run this one file, never the
whole suite, whose other tests write rows):

```bash
DATABASE_URL="$SCRATCH_URL" npx vitest run --config vitest.integration.config.ts \
  prisma/migration-integrity.integration.test.ts
```

The suite refuses non-local hosts. For a scratch **Supabase** project, and
only for that, add `ALLOW_REMOTE_INTEGRATION_DB=I_KNOW_THIS_IS_DISPOSABLE`.
Never set it with a production URL.

**Option C, the SQL by hand** (Supabase SQL editor or `psql`):

```sql
-- 1. Exclusion constraint on reservations: expect one row, contype = 'x'
SELECT conname, contype FROM pg_constraint
WHERE conname = 'reservations_no_overlap' AND conrelid = 'public.reservations'::regclass;

-- 2. Extension: expect one row
SELECT extname, extversion FROM pg_extension WHERE extname = 'btree_gist';

-- 3. RLS: expect no rows (every public table has RLS on) ...
SELECT relname FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity;
-- ... and every table present: 12 today, the 11 @@map names in
-- schema.prisma plus _prisma_migrations. Fewer means a table was lost.
SELECT count(*) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r';

-- 4. CHECKs: expect both names
SELECT conname FROM pg_constraint
WHERE conrelid = 'rental_inspections'::regclass AND contype = 'c';
-- rental_inspections_fuel_level_check, rental_inspections_mileage_check
```

Optionally prove the constraint **enforces**, not just exists. This tries to
duplicate a confirmed booking and rolls back:

```sql
BEGIN;
INSERT INTO reservations (id, "vehicleId", "customerId", "pickupDate", "returnDate", status, "totalPrice", "updatedAt")
SELECT 'restore-drill-overlap', "vehicleId", "customerId", "pickupDate", "returnDate", 'CONFIRMED', 1, now()
FROM reservations WHERE status IN ('CONFIRMED', 'ACTIVE') LIMIT 1;
-- expect: ERROR: conflicting key value violates exclusion constraint "reservations_no_overlap"
ROLLBACK;
```

**If anything is missing:** do not cut over. Re-create it by running the
relevant statement from `prisma/migrations/` against the scratch database
(`20260715060451_reservation_no_overlap`, `20260725100000_add_rental_inspections`,
`20260729134500_secure_public_schema_rls`), then re-run §5.4.

---

## 6. Spot checks

Compare the scratch database with what you expect at the restore point (and,
if production is still readable, with production):

```sql
-- 1. Row counts, every table
SELECT relname AS table_name,
       (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname), false, true, '')))[1]::text::int AS row_count
FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;

-- 2. Newest reservation, and the newest change: should be just before the restore point
SELECT id, status, "pickupDate", "returnDate", "createdAt"
FROM reservations ORDER BY "createdAt" DESC LIMIT 1;
SELECT max("updatedAt") AS last_change, sum("totalPrice") AS total_booked FROM reservations;

-- 3. Last migration applied
SELECT migration_name, finished_at FROM _prisma_migrations
WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1;
```

Then:

1. **Staff access went back in time too.** The restored `users` rows are as
   they were at the restore point. Anyone deactivated, any password reset,
   any "sign out everywhere" (which bumps `sessionVersion`) after that point
   is undone, and because sessions are JWTs signed with `AUTH_SECRET`, a
   revoked session becomes valid again. If production is still readable,
   list what changed since:
   `SELECT email, role, active, "sessionVersion", "updatedAt" FROM users WHERE "updatedAt" > '<restore point UTC>';`
   Each of those must be re-applied after cutover (admin → Staff), and
   `AUTH_SECRET` is rotated in §7.5 whatever the cause.
2. Open a few bookings you know about and check dates, customer and price.
3. **Lost window (first pass):** list website requests from the staff
   notification emails sent after the restore point. Old production keeps
   accepting requests until the new deployment is live, so this list is
   finished in §7.6, not here.
4. **Re-anonymise.** If production is still readable, list customers
   anonymised after the restore point and anonymise them again in the
   restored database after cutover (admin → customer → Anonymise):
   `SELECT id FROM customers WHERE "anonymisedAt" > '<restore point UTC>';`

---

## 7. Cutting over

Only after §5.4 passes and §6 looks right.

1. **Vercel → Project → Settings → Environment Variables**, Production scope:
   - `DATABASE_URL` → the restored project's **pooled** URL (port 6543) with
     `?pgbouncer=true&connection_limit=1`;
   - `DIRECT_URL` → its **direct** URL (port 5432).
   - Save the new values in the password manager first.
2. **Redeploy production** (Deployments → latest production → Redeploy). The
   build runs `prisma migrate deploy` against the new `DIRECT_URL`, which
   applies any migrations newer than the restore point. **Write down the
   time (UTC) the new deployment went live**: requests before it went to the
   old database.
3. **Smoke test**: sign in to the admin, open the reservations list and the
   fleet calendar, open one vehicle page on the public site.
4. **Run §5.4 once more** against the now-live database (the build may have
   applied migrations).
5. **Rotate** what the incident calls for:
   - **always**: the old project's database password (or pause the old
     project once you are sure you no longer need it), so nothing can keep
     writing to it;
   - **always, for any restore to an earlier point**: `AUTH_SECRET`, then
     redeploy. It signs everyone out, which is the point: the restored
     `sessionVersion` values would otherwise accept sessions that were
     revoked after the restore point (§6.1). Then re-apply the staff
     changes from §6.1: deactivate, reset passwords, sign out everywhere;
   - **if the cause was a compromise**: also every staff password
     (admin → Staff → reset password, which forces a change at next
     sign-in; PR #24), `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`, and the
     Supabase dashboard members and their 2FA.
6. **Lost window (final):** list the staff notification emails from the
   restore point up to the go-live time from step 2, not just the §6.3
   list, and re-enter those bookings. Re-anonymise (§6.4). Tell staff they
   can work again.
7. Record the restore in the [rehearsal log](#9-rehearsal-log), real or not.

Restoring **in place** (Supabase "Restore" on the production project) skips
§7.1, but takes the site offline for the duration and cannot be rehearsed
first. It still needs the `AUTH_SECRET` rotation and staff re-application
from §7.5. Use it only if the scratch path is impossible, and only after
§5–§6 have been run on a scratch clone of the same backup.

---

## 8. What never to do

- **Never run `prisma migrate dev`, `prisma migrate reset` or `prisma db push`
  against a restored database** (or production). They rebuild the schema from
  `schema.prisma`, which does not model the exclusion constraint,
  `btree_gist`, RLS or the CHECKs, and drop all four. `migrate dev` may also
  offer to reset the database to "fix drift", which deletes all data. The
  only migration command is `prisma migrate deploy`.
- **Never run the seed** (`npm run db:seed`) against a restored database. It
  deletes all application data before inserting demo rows.
- **Never run the full integration suite** against anything but a local
  throwaway database; only `migration-integrity` is read-only.
- **Never restore over production as a first step.** Scratch first.
- **Never omit `--extension=btree_gist`** from a `--schema=public` dump, and
  never restore without `--exit-on-error` (see §4.1, §5.2).
- **Never store a dump unencrypted**, in the repo, or past its retention.
- **Never paste a database URL into chat, a ticket or a commit.** It contains
  the password.

---

## 9. Rehearsal log

Rehearse at least **twice a year**, after a Postgres major-version upgrade,
and after any migration that adds an object `schema.prisma` does not model.
The production rehearsal (a real Supabase backup restored to a new scratch
project, §5.1, then §5.3–§6) has **not been run yet**.

| Date        | Who                        | Source → target                                                  | Duration                                                    | Result                    |
| ----------- | -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| 13 Nov 2026 | Claude Code (for E. Bejta) | Local `alfa_rent` (PG 17.10, Homebrew) → local scratch databases | ~2 min end to end; dump 0.18 s (54 KB); restore 0.07–0.15 s | Pass, with findings below |
| _pending_   | _operator_                 | Supabase production backup → new scratch Supabase project        |                                                             |                           |

**13 Nov 2026, local rehearsal, details.** Source: 12 tables, 141
reservations, 39 customers, 49 vehicles, 16 migrations, about 10 MB. No
Supabase or production database was touched.

1. Baseline: `scripts/verify-restore.sh` passed on the source.
2. Full-database dump, restored as superuser with
   `--no-owner --no-privileges --exit-on-error`: all four objects present,
   row counts and the newest reservation identical, the overlap insert
   rejected by `reservations_no_overlap`, `prisma migrate status` up to date,
   `migration-integrity.integration.test.ts` 15/15.
3. Failure path: dropped the exclusion constraint, RLS on `repairs` and the
   mileage CHECK on the scratch copy. The script exited 1 naming all three;
   the integration test failed the same three; **`prisma migrate status`
   still said "Database schema is up to date!"**
4. Same dump restored as a **non-superuser** database owner (like Supabase's
   `postgres`): without `--no-owner`, 20 _must be able to SET ROLE_ errors,
   ignored unless `--exit-on-error` is set. With `--no-owner
--no-privileges` it succeeded, including `CREATE EXTENSION btree_gist`
   (trusted extension), and every check passed.
5. **`--schema=public` dump without `--extension`:** `btree_gist` was missing
   from the dump. Without `--exit-on-error` the restore "finished" with
   2 ignored errors and **no exclusion constraint**. The script caught it.
6. `--schema=public --extension=btree_gist` dump: needs the `CREATE SCHEMA
public` entry left out (`--use-list`) on a fresh database; then passed
   every check and matched row counts exactly. This is the procedure in §4–§5.
7. Surprise: Prisma needs the user name in the URL (`P1010` without it),
   `psql` does not.
8. Cleanup: all three scratch databases and the temporary role dropped, dump
   files deleted.
9. After review, the script was re-tested on a fresh local scratch copy. A
   dropped table (`payment_events`) now fails the RLS check (it previously
   passed as 11/11). A decoy `rental_inspections_mileage_check` on a table in
   another schema no longer satisfies the CHECK test. `sslmode=require` in
   the URL is honoured, while `pgbouncer`/`connection_limit` are dropped. A
   percent-encoded password reaches `psql` decoded, through `PGPASSWORD`,
   and not in its arguments. Server notices on stderr no longer break the
   parsing.

Template for the next entry: date · who · source and restore point · target ·
time from decision to verified scratch · time to cutover (if any) · §5.4
result · surprises · follow-ups.
