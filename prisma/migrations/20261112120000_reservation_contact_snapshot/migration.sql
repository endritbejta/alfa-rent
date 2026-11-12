-- A public booking whose email is already on file is linked to that customer,
-- and the customer record is deliberately never overwritten: the request is
-- unauthenticated, and anyone who knows an address could otherwise rewrite the
-- phone number staff call. But the name and phone the person typed were then
-- thrown away, so staff rang a stale number and never learned it had changed.
--
-- These columns keep what was submitted, on the reservation, without touching
-- the customer. Staff see both and decide; nothing copies them automatically.
--
-- Nullable: staff-made reservations and everything created before this have
-- no snapshot, and render exactly as they did.
--
-- Personal data. The anonymise action (audit P1-5) must clear these four
-- alongside the customer's own fields.
--
-- Additive only: reservations already has row level security enabled, and new
-- columns inherit it.
ALTER TABLE "reservations"
  ADD COLUMN "contactFirstName" TEXT,
  ADD COLUMN "contactLastName" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "contactPhone" TEXT;
