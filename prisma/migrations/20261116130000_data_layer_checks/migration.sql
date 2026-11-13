-- Defence in depth at the data layer (audit finding P3-7).
--
-- The app validates every one of these rules, but the database enforced none
-- of them, so a script, a seed, a hurried manual query or a future bug could
-- write a row the app would then have to cope with. Each CHECK matches a rule
-- the app already applies, so no valid write changes.
--
--   reservations_return_not_before_pickup
--       Return day on or after pickup day, compared as calendar days the way
--       reservations_no_overlap compares them (daterange of ::date, '[]').
--       Since rentals became inclusive (20261113150000) a same-day rental is
--       valid: pickup day = return day. ::date on timestamp without time zone
--       does not depend on the session's time zone. Without this, a CONFIRMED
--       row with return < pickup makes daterange() raise inside the exclusion
--       constraint: an error, but not one that names the problem.
--   reservations_total_price_nonnegative
--       0 is allowed: nothing stops staff pricing a rental at zero.
--   reservations_late_days_nonnegative, reservations_late_charge_nonnegative
--       The late-return outcome (20261114120000). 0 days or 0.00 charged is
--       a waived or on-time return; NULL is "not resolved yet".
--   vehicles_price_per_day_positive
--       Matches createVehicleSchema (positive). A free car would book at 0.
--   payments_amount_positive
--       Matches the payment service; a zero or negative charge is never sent.
--   users_email_lowercase
--       Sign-in looks the address up lower-cased (verifyCredentials), so an
--       account stored with capitals could never sign in. Enforcing the
--       stored form, rather than also matching case-insensitively, keeps the
--       lookup a plain index hit and makes the unique index case-insensitive
--       in effect: Ana@x and ana@x can no longer be two accounts. Every
--       writer already lower-cases (staffEmailSchema, the seed).
--
-- Pre-check: the block below refuses to deploy, naming each rule and how many
-- rows break it, rather than failing on the first ADD CONSTRAINT. The same
-- queries, to run against production before deploying (each must return 0):
--
--   SELECT count(*) FROM reservations WHERE "returnDate"::date < "pickupDate"::date;
--   SELECT count(*) FROM reservations WHERE "totalPrice" < 0;
--   SELECT count(*) FROM reservations WHERE "lateDays" < 0;
--   SELECT count(*) FROM reservations WHERE "lateCharge" < 0;
--   SELECT count(*) FROM vehicles WHERE "pricePerDay" <= 0;
--   SELECT count(*) FROM payments WHERE amount <= 0;
--   SELECT count(*) FROM users WHERE email <> lower(email);
--
-- None of these is modelled in schema.prisma, which cannot express CHECKs, so
-- `prisma migrate dev`, `migrate reset` and `db push` would drop them like the
-- other unmodelled objects. prisma/migration-integrity.integration.test.ts
-- asserts each one. Written by hand like every migration here (see AGENTS.md).
DO $$
DECLARE
  problems text := '';
  n bigint;
BEGIN
  SELECT count(*) INTO n FROM reservations WHERE "returnDate"::date < "pickupDate"::date;
  IF n > 0 THEN problems := problems || format(' %s reservation(s) return before pickup;', n); END IF;
  SELECT count(*) INTO n FROM reservations WHERE "totalPrice" < 0;
  IF n > 0 THEN problems := problems || format(' %s reservation(s) with a negative total;', n); END IF;
  SELECT count(*) INTO n FROM reservations WHERE "lateDays" < 0;
  IF n > 0 THEN problems := problems || format(' %s reservation(s) with negative late days;', n); END IF;
  SELECT count(*) INTO n FROM reservations WHERE "lateCharge" < 0;
  IF n > 0 THEN problems := problems || format(' %s reservation(s) with a negative late charge;', n); END IF;
  SELECT count(*) INTO n FROM vehicles WHERE "pricePerDay" <= 0;
  IF n > 0 THEN problems := problems || format(' %s vehicle(s) priced at or below zero;', n); END IF;
  SELECT count(*) INTO n FROM payments WHERE amount <= 0;
  IF n > 0 THEN problems := problems || format(' %s payment(s) at or below zero;', n); END IF;
  SELECT count(*) INTO n FROM users WHERE email <> lower(email);
  IF n > 0 THEN problems := problems || format(' %s user email(s) with capitals;', n); END IF;

  IF problems <> '' THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Existing rows break the new CHECK constraints:' || problems,
      HINT = 'Correct those rows (the pre-check queries in this migration find them), then deploy again.';
  END IF;
END $$;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_return_not_before_pickup"
    CHECK ("returnDate"::date >= "pickupDate"::date),
  ADD CONSTRAINT "reservations_total_price_nonnegative"
    CHECK ("totalPrice" >= 0),
  ADD CONSTRAINT "reservations_late_days_nonnegative"
    CHECK ("lateDays" >= 0),
  ADD CONSTRAINT "reservations_late_charge_nonnegative"
    CHECK ("lateCharge" >= 0);

ALTER TABLE "vehicles"
  ADD CONSTRAINT "vehicles_price_per_day_positive"
    CHECK ("pricePerDay" > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive"
    CHECK (amount > 0);

ALTER TABLE "users"
  ADD CONSTRAINT "users_email_lowercase"
    CHECK (email = lower(email));
