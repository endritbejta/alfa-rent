-- When a customer's personal data was scrubbed at their request (or at the
-- end of the retention period), and therefore that the record must not be
-- edited, merged or booked against again.
--
-- Nullable: every existing customer is a real, identifiable one. Written by
-- hand like every migration here: `migrate dev` would drop the objects
-- schema.prisma does not model (see AGENTS.md).
ALTER TABLE "customers" ADD COLUMN "anonymisedAt" TIMESTAMP(3);
