import { prisma } from "@/lib/db/prisma";
import {
  buildImageUrl,
  deleteImage,
  moveIntoVehicleFolder,
  verifyUploadSignature,
} from "@/lib/cloudinary";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  MAX_VEHICLE_IMAGES,
  type VehicleImageItem,
} from "@/lib/validations/image";

/**
 * Reconciles a vehicle's photos against the ordered list the media grid
 * submitted: entries that vanished are deleted, new uploads are recorded,
 * and array position becomes sortOrder.
 *
 * One ordered list rather than add/delete/reorder endpoints because the three
 * are a single operator intent — "the gallery should look like this" — and
 * splitting them let a half-applied reorder survive a failed save.
 *
 * Every item here originated in the browser, including the publicIds, so
 * nothing is trusted before `verifyUploadSignature` proves Cloudinary issued
 * it and the id is confirmed to belong to this vehicle.
 */
export async function syncVehicleImages(
  vehicleId: string,
  items: VehicleImageItem[]
): Promise<void> {
  if (items.length > MAX_VEHICLE_IMAGES) {
    throw new ValidationError(
      `At most ${MAX_VEHICLE_IMAGES} images per vehicle`
    );
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, images: { select: { id: true, publicId: true } } },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const ownedIds = new Set(vehicle.images.map((image) => image.id));
  const seen = new Set<string>();

  for (const item of items) {
    const key = item.kind === "existing" ? item.id : item.publicId;
    if (seen.has(key))
      throw new ValidationError("The same photo was added twice");
    seen.add(key);

    if (item.kind === "existing") {
      // An id from another vehicle would otherwise reassign its photo here.
      if (!ownedIds.has(item.id)) {
        throw new ValidationError("That photo does not belong to this vehicle");
      }
    } else if (!verifyUploadSignature(item)) {
      throw new ValidationError(
        "An upload could not be verified. Remove the photo and add it again."
      );
    }
  }

  const kept = new Set(
    items.flatMap((item) => (item.kind === "existing" ? [item.id] : []))
  );

  // Cloudinary first: if it fails the DB row survives and the operation can
  // be retried; the reverse order would strand an unreferenced asset.
  for (const image of vehicle.images) {
    if (kept.has(image.id)) continue;
    await deleteImage(image.publicId);
    await prisma.vehicleImage.delete({ where: { id: image.id } });
  }

  for (const [index, item] of items.entries()) {
    if (item.kind === "existing") {
      await prisma.vehicleImage.update({
        where: { id: item.id },
        data: { sortOrder: index },
      });
      continue;
    }

    // Photos added before the vehicle existed were parked in a draft folder.
    const asset = item.publicId.includes("/_drafts/")
      ? await moveIntoVehicleFolder(item.publicId, vehicleId)
      : {
          publicId: item.publicId,
          url: buildImageUrl(item.publicId, item.version),
        };

    await prisma.vehicleImage.create({
      data: {
        vehicleId,
        url: asset.url,
        publicId: asset.publicId,
        sortOrder: index,
      },
    });
  }
}
