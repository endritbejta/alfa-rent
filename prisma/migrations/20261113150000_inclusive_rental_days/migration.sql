-- Rental days are inclusive: pickup day and return day both count, and the
-- car is the renter's for the whole return day. 25 → 26 Nov is two days, and
-- nobody else may pick the car up on the 26th.
--
-- The old constraint compared tsrange("pickupDate", "returnDate"), half-open
-- on the stored instants, so a pickup at 10:00 on another booking's return
-- day was legal. The new one compares the calendar days themselves,
-- inclusive at both ends. Rental dates are naive calendar values stored as
-- `timestamp without time zone`, so "pickupDate"::date is the branch day and
-- the cast is IMMUTABLE, as an exclusion constraint requires.
--
-- Only this constraint changes. btree_gist (still needed for
-- "vehicleId" WITH =), row-level security and the rental_inspections CHECK
-- constraints are untouched.
--
-- Existing CONFIRMED/ACTIVE bookings that hand the car over on the same day
-- would violate the new constraint. Refuse with the list rather than let
-- ADD CONSTRAINT fail with a bare 23P01; the whole migration runs in one
-- transaction, so the old constraint stays in place if this raises. The
-- same query is in the pull request for running against production first.
DO $$
DECLARE
  conflicts text;
BEGIN
  SELECT string_agg(
           format('%s (%s → %s) and %s (%s → %s) on vehicle %s',
                  a.id, a."pickupDate"::date, a."returnDate"::date,
                  b.id, b."pickupDate"::date, b."returnDate"::date,
                  a."vehicleId"),
           E'\n')
    INTO conflicts
    FROM reservations a
    JOIN reservations b
      ON a."vehicleId" = b."vehicleId"
     AND a.id < b.id
     AND daterange(a."pickupDate"::date, a."returnDate"::date, '[]')
      && daterange(b."pickupDate"::date, b."returnDate"::date, '[]')
   WHERE a.status IN ('CONFIRMED', 'ACTIVE')
     AND b.status IN ('CONFIRMED', 'ACTIVE');

  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Bookings share a calendar day and would break the inclusive no-overlap rule',
      DETAIL = conflicts,
      HINT = 'Move or cancel one booking of each pair, then deploy again.';
  END IF;
END $$;

ALTER TABLE "reservations" DROP CONSTRAINT "reservations_no_overlap";

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_no_overlap"
EXCLUDE USING gist (
  "vehicleId" WITH =,
  daterange("pickupDate"::date, "returnDate"::date, '[]') WITH &&
)
WHERE (status IN ('CONFIRMED', 'ACTIVE'));
