-- Prevent double-booking at the database level: no two CONFIRMED/ACTIVE
-- reservations for the same vehicle may have overlapping date ranges.
-- Application-level checks alone cannot guarantee this under concurrency.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
ADD CONSTRAINT "reservations_no_overlap"
EXCLUDE USING gist (
  "vehicleId" WITH =,
  tsrange("pickupDate", "returnDate") WITH &&
)
WHERE (status IN ('CONFIRMED', 'ACTIVE'));
