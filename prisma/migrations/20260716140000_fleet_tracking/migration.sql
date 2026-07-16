-- Registration + routine service tracking on the vehicle itself.
ALTER TABLE "vehicles"
  ADD COLUMN "registrationDate" TIMESTAMP(3),
  ADD COLUMN "registrationExpiry" TIMESTAMP(3),
  ADD COLUMN "lastServiceDate" TIMESTAMP(3),
  ADD COLUMN "nextServiceDate" TIMESTAMP(3),
  ADD COLUMN "serviceNotes" TEXT;

CREATE INDEX "vehicles_registrationExpiry_idx" ON "vehicles"("registrationExpiry");

-- Repairs: unplanned costs, kept apart from routine servicing.
CREATE TABLE "repairs" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "cost" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "repairs_vehicleId_date_idx" ON "repairs"("vehicleId", "date");

ALTER TABLE "repairs" ADD CONSTRAINT "repairs_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
