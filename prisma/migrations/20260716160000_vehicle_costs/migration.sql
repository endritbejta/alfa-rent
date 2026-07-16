-- Amounts behind the dates, so a vehicle's total operational cost is real.
ALTER TABLE "vehicles"
  ADD COLUMN "registrationCost" DECIMAL(10,2),
  ADD COLUMN "serviceCost" DECIMAL(10,2);
