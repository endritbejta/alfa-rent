-- Registration plate: the identifier staff use to distinguish two
-- otherwise identical vehicles. Nullable so existing rows stay valid.
ALTER TABLE "vehicles" ADD COLUMN "plate" TEXT;

CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");
