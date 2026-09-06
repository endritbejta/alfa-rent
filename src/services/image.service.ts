import { prisma } from "@/lib/db/prisma";
import {
  buildImageUrl,
  deleteImage,
  moveIntoVehicleFolder,
  verifyUploadSignature,
} from "@/lib/cloudinary";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { reportError } from "@/lib/observability";
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
  const removed = vehicle.images.filter((image) => !kept.has(image.id));

  /*
   * Cloudinary before the database, deliberately: if a destroy fails the row
   * survives and the operator can retry, where the reverse order would leave
   * an asset nothing points at. What changed is that the calls no longer wait
   * on each other — replacing eight photos used to be up to thirty-two
   * strictly sequential round trips, alternating between Cloudinary and
   * Postgres.
   *
   * allSettled rather than all: one destroy failing should not keep the other
   * seven rows, whose assets are already gone.
   */
  const destroyed = await Promise.allSettled(
    removed.map((image) => deleteImage(image.publicId))
  );
  const goneIds = removed
    .filter((_, i) => destroyed[i]?.status === "fulfilled")
    .map((image) => image.id);

  // Drafts were parked in a folder of their own before the vehicle existed.
  // Nothing has been written yet, so a failure here is safe to throw on.
  const moved: string[] = [];
  const assets = await Promise.all(
    items.map(async (item) => {
      if (item.kind === "existing") return null;
      if (!item.publicId.includes("/_drafts/")) {
        return {
          publicId: item.publicId,
          url: buildImageUrl(item.publicId, item.version),
        };
      }
      const asset = await moveIntoVehicleFolder(item.publicId, vehicleId);
      moved.push(asset.publicId);
      return asset;
    })
  );

  /*
   * One transaction for every row change, so a failure can no longer leave a
   * gallery in a state no single save produced — some photos removed, some
   * positions rewritten, some new rows in. The Cloudinary calls are finished
   * before it opens: holding a transaction across network I/O against a pooler
   * capped at one connection is worse than the problem it solves.
   */
  try {
    await prisma.$transaction([
      prisma.vehicleImage.deleteMany({ where: { id: { in: goneIds } } }),
      ...items.flatMap((item, index) =>
        item.kind === "existing"
          ? [
              prisma.vehicleImage.update({
                where: { id: item.id },
                data: { sortOrder: index },
              }),
            ]
          : []
      ),
      prisma.vehicleImage.createMany({
        data: items.flatMap((item, index) => {
          const asset = assets[index];
          return item.kind === "existing" || !asset
            ? []
            : [
                {
                  vehicleId,
                  url: asset.url,
                  publicId: asset.publicId,
                  sortOrder: index,
                },
              ];
        }),
      }),
    ]);
  } catch (error) {
    // Anything renamed out of the draft folder now sits in the vehicle's
    // folder with nothing pointing at it. The gallery itself is untouched,
    // which is the property worth keeping.
    reportError(error, {
      scope: "sync-vehicle-images",
      vehicleId,
      strandedPublicIds: moved,
    });
    throw error;
  }

  const failed = removed.length - goneIds.length;
  if (failed > 0) {
    throw new ValidationError(
      failed === 1
        ? "One photo could not be removed. Save again to finish."
        : `${failed} photos could not be removed. Save again to finish.`
    );
  }
}
