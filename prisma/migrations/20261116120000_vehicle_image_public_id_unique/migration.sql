-- One Cloudinary asset backs at most one gallery row (audit finding P3-1).
--
-- inspection_photos."publicId" has been unique since it was created;
-- vehicle_images never was, so one asset could be attached to two vehicles,
-- and removing it from either destroyed the image the other still showed.
-- The folder check in syncVehicleImages now keeps a receipt to its own
-- vehicle; this index is the guarantee that does not depend on that code.
--
-- Pre-check (must return no rows before this is deployed):
--   SELECT "publicId", count(*) FROM vehicle_images
--   GROUP BY 1 HAVING count(*) > 1;
--
-- Named as Prisma names a @unique, so schema.prisma models it and a future
-- diff sees nothing to change. Written by hand like every migration here
-- (see AGENTS.md).
CREATE UNIQUE INDEX "vehicle_images_publicId_key"
  ON "vehicle_images"("publicId");
