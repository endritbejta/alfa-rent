ALTER TABLE "users"
  ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "customers_createdAt_idx" ON "customers"("createdAt");
CREATE INDEX "reservations_status_pickupDate_idx"
  ON "reservations"("status", "pickupDate");
CREATE INDEX "reservations_status_returnDate_idx"
  ON "reservations"("status", "returnDate");
CREATE INDEX "reservations_createdAt_idx" ON "reservations"("createdAt");
