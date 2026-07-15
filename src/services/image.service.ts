import { prisma } from "@/lib/db/prisma";
import { deleteImage, uploadVehicleImage } from "@/lib/cloudinary";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { VehicleImage } from "@prisma/client";

const MAX_FILES = 8;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Uploads run sequentially, and the DB row is written immediately after
 * each upload — a failure mid-batch leaves earlier images fully recorded
 * instead of orphaned in Cloudinary.
 */
export async function addVehicleImages(
  vehicleId: string,
  files: File[]
): Promise<VehicleImage[]> {
  if (files.length === 0) return [];
  if (files.length > MAX_FILES) {
    throw new ValidationError(`At most ${MAX_FILES} images per upload`);
  }
  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new ValidationError(
        `Unsupported image type: ${file.type || "unknown"}. Use JPEG, PNG, WebP, or AVIF.`
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError(`Each image must be under 5 MB`);
    }
  }

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, _count: { select: { images: true } } },
  });
  if (!vehicle) throw new NotFoundError("Vehicle");

  const created: VehicleImage[] = [];
  let sortOrder = vehicle._count.images;
  for (const file of files) {
    const uploaded = await uploadVehicleImage(file, vehicleId);
    created.push(
      await prisma.vehicleImage.create({
        data: {
          vehicleId,
          url: uploaded.url,
          publicId: uploaded.publicId,
          sortOrder: sortOrder++,
        },
      })
    );
  }
  return created;
}

export async function deleteVehicleImage(imageId: string): Promise<void> {
  const image = await prisma.vehicleImage.findUnique({
    where: { id: imageId },
  });
  if (!image) throw new NotFoundError("Image");

  // Cloudinary first: if it fails the DB row survives and the operation
  // can be retried; the reverse order would strand an unreferenced asset.
  await deleteImage(image.publicId);
  await prisma.vehicleImage.delete({ where: { id: imageId } });
}

/** Removes all Cloudinary assets for a vehicle (used before hard delete). */
export async function deleteAllVehicleImages(vehicleId: string): Promise<void> {
  const images = await prisma.vehicleImage.findMany({ where: { vehicleId } });
  for (const image of images) {
    await deleteImage(image.publicId);
  }
  await prisma.vehicleImage.deleteMany({ where: { vehicleId } });
}
