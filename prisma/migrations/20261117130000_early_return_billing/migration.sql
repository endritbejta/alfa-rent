-- Early returns: a car that comes back before its booked return day is
-- billed by an explicit staff choice — the days actually used, or the full
-- booking — instead of always the full booked total.
--
-- The mirror of the late-return columns (20261114120000), and kept the same
-- way: the booked dates never move, and totalPrice stays "the amount
-- charged", which every revenue, spend and earnings figure already reads.
-- What changes it is recorded beside it, so nothing is lost:
--
--   dailyRate           the rate the booking was priced at. Needed because
--                       neither the car's rate today nor totalPrice / days is
--                       that number: car rates change, an extension charges
--                       its added days at the rate of that day, and every
--                       booking made before 20261113150000 was priced on the
--                       old exclusive day count (13 → 16 Nov = 3 days, not 4).
--   bookedTotal         the booked amount when the car came back: the
--                       original, kept even when totalPrice ends up lower.
--   actualDays          rental days from the booked pickup day to the actual
--                       return day, inclusive like every rental day count.
--   earlyReturnBilling  ACTUAL_DAYS or FULL_BOOKING; null unless early.
--
-- Backfill
--   dailyRate, every row: the booked amount (total less any late charge)
--   over the days it was priced for. Rows created before the inclusive-days
--   migration finished were priced on the old rule — started 24-hour
--   periods, at least one — and the rest on the inclusive count; the
--   migration's own finished_at tells them apart. An extended booking whose
--   extension was charged at a different rate gets the average, the only
--   rate its row can still give.
--   bookedTotal, completed rows: totalPrice less any late charge. Every
--   completion so far kept the full booked total, so that is its original.
--   actualDays is left null on old rows: their return days were not
--   recorded as rental days, and guessing would put a number on screen that
--   nobody measured.
--
-- No totalPrice changes, so no revenue figure, customer spend or vehicle
-- earnings moves when this deploys.
--
-- The CHECKs are not modelled in schema.prisma (it cannot express them), so
-- `prisma migrate dev`, `migrate reset` and `db push` would drop them like
-- the other unmodelled objects. prisma/migration-integrity.integration.test.ts
-- asserts each one. Written by hand, like every migration here (AGENTS.md).

CREATE TYPE "EarlyReturnBilling" AS ENUM ('ACTUAL_DAYS', 'FULL_BOOKING');

ALTER TABLE "reservations"
  ADD COLUMN "dailyRate" DECIMAL(10,2),
  ADD COLUMN "bookedTotal" DECIMAL(10,2),
  ADD COLUMN "actualDays" INTEGER,
  ADD COLUMN "earlyReturnBilling" "EarlyReturnBilling";

-- finished_at is timestamptz; createdAt is a UTC instant stored without a
-- zone. No row for the migration (a database that never ran it) means every
-- row is on the inclusive count.
WITH inclusive AS (
  SELECT finished_at AT TIME ZONE 'UTC' AS since
  FROM "_prisma_migrations"
  WHERE migration_name = '20261113150000_inclusive_rental_days'
    AND finished_at IS NOT NULL
    AND rolled_back_at IS NULL
  ORDER BY finished_at
  LIMIT 1
),
priced AS (
  SELECT r.id,
         GREATEST(r."totalPrice" - COALESCE(r."lateCharge", 0), 0) AS booked,
         CASE
           WHEN r."createdAt" < (SELECT since FROM inclusive) THEN
             GREATEST(1, CEIL(EXTRACT(EPOCH FROM (r."returnDate" - r."pickupDate")) / 86400))
           ELSE r."returnDate"::date - r."pickupDate"::date + 1
         END AS days
  FROM "reservations" r
)
UPDATE "reservations" r
SET "dailyRate" = ROUND(p.booked / p.days, 2)
FROM priced p
WHERE r.id = p.id;

UPDATE "reservations"
SET "bookedTotal" = GREATEST("totalPrice" - COALESCE("lateCharge", 0), 0)
WHERE status = 'COMPLETED';

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_daily_rate_nonnegative"
    CHECK ("dailyRate" >= 0),
  ADD CONSTRAINT "reservations_booked_total_nonnegative"
    CHECK ("bookedTotal" >= 0),
  ADD CONSTRAINT "reservations_actual_days_positive"
    CHECK ("actualDays" >= 1),
  -- Early and late are opposite sides of the return day: never both. An
  -- early return records what it was billed against, and never charges more
  -- than the booking (ACTUAL_DAYS) or anything but it (FULL_BOOKING).
  ADD CONSTRAINT "reservations_early_return_consistent"
    CHECK (
      "earlyReturnBilling" IS NULL OR (
        "actualDays" IS NOT NULL
        AND "bookedTotal" IS NOT NULL
        AND "lateDays" IS NULL
        AND "lateResolution" IS NULL
        AND (
          ("earlyReturnBilling" = 'ACTUAL_DAYS' AND "totalPrice" <= "bookedTotal")
          OR ("earlyReturnBilling" = 'FULL_BOOKING' AND "totalPrice" = "bookedTotal")
        )
      )
    );
