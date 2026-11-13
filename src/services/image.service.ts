import { prisma } from "@/lib/db/prisma";
import {
  buildImageUrl,
  deleteImage,
  moveIntoVehicleFolder,
  verifyUploadSignature,
} from "@/lib/cloudinary";
import {
  isDraftUpload,
  isVehicleGalleryUpload,
} from "@/lib/cloudinary/folders";
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
 * it and its folder shows it was uploaded for this vehicle (or for the draft
 * of a vehicle being created).
 */
export async function syncVehicleImages(
  vehicleId: string,
  items: VehicleImageItem[]
): Promise<void> {
  if (items.length > MAX_VEHICLE_IMAGES) {
    throw new ValidationError(
      `At most ${MAX_VEHICLE_IMAGES} images per vehicle`,
      { key: "err.tooManyPhotos", values: { count: MAX_VEHICLE_IMAGES } }
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
      throw new ValidationError("The same photo was added twice", {
        key: "err.duplicatePhoto",
      });
    seen.add(key);

    if (item.kind === "existing") {
      // An id from another vehicle would otherwise reassign its photo here.
      if (!ownedIds.has(item.id)) {
        throw new ValidationError(
          "That photo does not belong to this vehicle",
          { key: "err.photoNotThisVehicle" }
        );
      }
    } else if (!isVehicleGalleryUpload(item.publicId, vehicleId)) {
      // Signed by Cloudinary, but for something else: another vehicle's
      // gallery or an inspection. Attaching it would let this gallery
      // destroy an image that one still shows.
      throw new ValidationError("That photo does not belong to this vehicle", {
        key: "err.photoNotThisVehicle",
      });
    } else if (!verifyUploadSignature(item)) {
      throw new ValidationError(
        "An upload could not be verified. Remove the photo and add it again.",
        { key: "err.uploadUnverified" }
      );
    }
  }

  const kept = new Set(
    items.flatMap((item) => (item.kind === "existing" ? [item.id] : []))
  );
  const removed = vehicle.images.filter((image) => !kept.has(image.id));

  // Drafts were parked in a folder of their own before the vehicle existed.
  // Nothing has been written yet, so a failure here is safe to throw on.
  const moved: string[] = [];
  const assets = await Promise.all(
    items.map(async (item) => {
      if (item.kind === "existing") return null;
      if (!isDraftUpload(item.publicId)) {
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
      prisma.vehicleImage.deleteMany({
        where: { id: { in: removed.map((image) => image.id) } },
      }),
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

  /*
   * Database first, hosted files second — the order deleteVehicle settled on,
   * for the same reason. The transaction above can fail after the checks
   * passed: two tabs saving the same gallery race, and the loser's update hits
   * a row the winner already removed. Destroying first left that loser's rows
   * in place pointing at images that no longer existed, which nothing could
   * repair. This way a failed save changes nothing anywhere.
   *
   * What it costs is that a destroy failing now strands an asset with no row
   * pointing at it. That is invisible to customers, costs a little storage,
   * and is recoverable from the report below; a broken gallery was none of
   * those. So a failed destroy does not fail the save: the gallery the
   * operator asked for is exactly what was committed.
   *
   * allSettled rather than all: one destroy failing should not stop the rest.
   */
  const destroyed = await Promise.allSettled(
    removed.map((image) => deleteImage(image.publicId))
  );
  const stranded = removed
    .filter((_, i) => destroyed[i]?.status === "rejected")
    .map((image) => image.publicId);
  if (stranded.length > 0) {
    const firstFailure = destroyed.find((r) => r.status === "rejected");
    reportError(
      firstFailure?.status === "rejected"
        ? firstFailure.reason
        : new Error("Cloudinary destroy failed"),
      {
        scope: "sync-vehicle-images-destroy",
        vehicleId,
        strandedPublicIds: stranded,
      }
    );
  }
}
