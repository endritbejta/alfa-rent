-- Routine services as rows, like repairs (audit finding P2-5c).
--
-- A vehicle used to hold only its *last* service, as columns on "vehicles"
-- ("lastServiceDate", "serviceCost"). The drawer's cost figures therefore
-- added a lifetime of repairs to the cost of one service: every earlier
-- service vanished from the car's costs the moment a newer one was recorded.
-- The owner decides which cars to keep, sell or reprice from those figures.
--
-- "date" is a calendar value stored at 00:00 "UTC", like repairs and rental
-- dates: a picked day, not an instant.
--
-- "createdById" is who recorded it. SET NULL so removing a staff account
-- neither fails nor takes the car's service history with it. NULL for the
-- backfilled rows below, which nobody entered through this table.
--
-- Written by hand like every migration here: `migrate dev` would drop the
-- objects schema.prisma does not model (see AGENTS.md).
CREATE TABLE "vehicle_services" (
  "id"          TEXT          NOT NULL,
  "vehicleId"   TEXT          NOT NULL,
  "date"        TIMESTAMP(3)  NOT NULL,
  "cost"        DECIMAL(10,2) NOT NULL,
  "mileage"     INTEGER,
  "notes"       TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "vehicle_services_pkey" PRIMARY KEY ("id"),
  -- 0 is allowed: a service under warranty, or one imported below whose cost
  -- was never recorded, costs nothing as far as the books know.
  CONSTRAINT "vehicle_services_cost_nonnegative" CHECK ("cost" >= 0),
  CONSTRAINT "vehicle_services_mileage_nonnegative" CHECK ("mileage" >= 0)
);

-- A car's history newest first, and "the last service" = its first row.
CREATE INDEX "vehicle_services_vehicleId_date_idx"
  ON "vehicle_services"("vehicleId", "date");

-- CASCADE like repairs: a car is only ever hard-deleted when it has no
-- history worth keeping (vehicles with rentals are retired instead).
ALTER TABLE "vehicle_services"
  ADD CONSTRAINT "vehicle_services_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_services"
  ADD CONSTRAINT "vehicle_services_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: one row per vehicle that has a recorded last service.
--
--   * Date set: that day, truncated to the calendar value the table stores
--     (the old column holds whatever time of day the seed or form wrote).
--   * Cost: the old "serviceCost", or 0 when it was never recorded. The
--     drawer already counted a missing cost as 0, so no figure moves.
--   * Cost set but no date: the cost is real and the figures counted it, so
--     it is kept, dated to the day the car was added (the only day the
--     system can vouch for) and labelled as such in "notes".
--
-- The id only has to be unique and stable; the app's cuids never start with
-- "svc_backfill_", so these cannot collide. A re-run (there is none:
-- migrate deploy applies a migration once) would hit the primary key.
INSERT INTO "vehicle_services" ("id", "vehicleId", "date", "cost", "notes")
SELECT
  'svc_backfill_' || v."id",
  v."id",
  date_trunc('day', COALESCE(v."lastServiceDate", v."createdAt")),
  COALESCE(v."serviceCost", 0),
  CASE WHEN v."lastServiceDate" IS NULL
    THEN 'Service date not recorded; dated to when the car was added.'
  END
FROM "vehicles" v
-- Parenthesised so the integration test can run this exact statement scoped
-- to its own vehicles by appending one more condition.
WHERE (v."lastServiceDate" IS NOT NULL OR v."serviceCost" IS NOT NULL);

-- "lastServiceDate" and "serviceCost" on vehicles are left in place, frozen:
-- nothing writes them from here on, and "last service" is read from the
-- newest row above. They are dropped by a later migration once the backfill
-- has been checked against production.

-- Match the existing Supabase security posture: only trusted server-side
-- Prisma access is allowed.
ALTER TABLE public."vehicle_services" ENABLE ROW LEVEL SECURITY;

DO $security$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.vehicle_services FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$security$;
