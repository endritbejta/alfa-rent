-- Late returns (audit finding P2-4): a car that comes back after its booked
-- return day used to close at the booked price, the extra days unbilled and
-- invisible. Staff now settle it at the return, either charging the extra
-- days at the car's current rate or waiving them with a reason.
--
-- The booked dates are deliberately left alone. Moving "returnDate" to the
-- actual return would have to pass reservations_no_overlap, and the overdue
-- days are exactly the ones most likely to run into the car's next booking.
-- So the outcome is recorded beside the booking instead:
--
--   "lateDays"          days past the booked return day (inclusive count)
--   "lateCharge"        what was added to "totalPrice" for them; 0.00 when
--                       waived. "totalPrice" always includes it.
--   "lateResolution"    CHARGED or WAIVED
--   "lateWaiverReason"  why it was waived; staff free text, cleared by
--                       anonymisation like the other reservation notes
--
-- All nullable and additive: every existing rental, and every on-time one,
-- has nothing to settle. Written by hand like every migration here:
-- `migrate dev` would drop the objects schema.prisma does not model (see
-- AGENTS.md).
CREATE TYPE "LateReturnResolution" AS ENUM ('CHARGED', 'WAIVED');

ALTER TABLE "reservations"
  ADD COLUMN "lateDays" INTEGER,
  ADD COLUMN "lateCharge" DECIMAL(10,2),
  ADD COLUMN "lateResolution" "LateReturnResolution",
  ADD COLUMN "lateWaiverReason" TEXT;
