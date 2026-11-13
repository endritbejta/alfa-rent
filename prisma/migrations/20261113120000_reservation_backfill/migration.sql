-- A rental recorded after the fact: it happened, but nobody pressed Start
-- (or Complete) while it did, so staff record it in one step once its whole
-- window has passed, without inspections. These columns are the audit
-- trace that it was entered that way: when, by whom, and why the
-- inspections are missing. The handover and return days themselves go in
-- "startedAt" / "completedAt" as for any rental.
--
-- Nullable: every existing rental was recorded as it happened. Written by
-- hand like every migration here: `migrate dev` would drop the objects
-- schema.prisma does not model (see AGENTS.md).
ALTER TABLE "reservations"
  ADD COLUMN "backfilledAt" TIMESTAMP(3),
  ADD COLUMN "backfilledById" TEXT,
  ADD COLUMN "backfillNote" TEXT;

-- SET NULL rather than RESTRICT: the trace keeps "backfilledAt" and the
-- note if the staff account is ever removed outright.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_backfilledById_fkey"
  FOREIGN KEY ("backfilledById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
