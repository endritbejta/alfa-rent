CREATE TYPE "InspectionType" AS ENUM ('PICKUP', 'RETURN');

CREATE TABLE "rental_inspections" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "type" "InspectionType" NOT NULL,
  "mileage" INTEGER NOT NULL,
  "fuelLevel" INTEGER NOT NULL,
  "exteriorNotes" TEXT,
  "interiorNotes" TEXT,
  "damageFound" BOOLEAN NOT NULL DEFAULT false,
  "damageNotes" TEXT,
  "signerName" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "rental_inspections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rental_inspections_fuel_level_check"
    CHECK ("fuelLevel" >= 0 AND "fuelLevel" <= 100),
  CONSTRAINT "rental_inspections_mileage_check"
    CHECK ("mileage" >= 0)
);

CREATE TABLE "inspection_photos" (
  "id" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rental_inspections_reservationId_type_key"
  ON "rental_inspections"("reservationId", "type");
CREATE INDEX "rental_inspections_createdById_idx"
  ON "rental_inspections"("createdById");
CREATE UNIQUE INDEX "inspection_photos_publicId_key"
  ON "inspection_photos"("publicId");
CREATE INDEX "inspection_photos_inspectionId_sortOrder_idx"
  ON "inspection_photos"("inspectionId", "sortOrder");

ALTER TABLE "rental_inspections"
  ADD CONSTRAINT "rental_inspections_reservationId_fkey"
  FOREIGN KEY ("reservationId") REFERENCES "reservations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rental_inspections"
  ADD CONSTRAINT "rental_inspections_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inspection_photos"
  ADD CONSTRAINT "inspection_photos_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "rental_inspections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
