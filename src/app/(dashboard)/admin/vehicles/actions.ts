"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError, TooManyRequestsError } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  draftFolder,
  signUpload,
  vehicleFolder,
  type UploadSignature,
} from "@/lib/cloudinary";
import {
  createVehicleSchema,
  parseVehicleFields,
  updateVehicleSchema,
} from "@/lib/validations/vehicle";
import { parseVehicleImagesField } from "@/lib/validations/image";
import {
  createVehicle,
  deleteVehicle,
  PUBLIC_VEHICLES_TAG,
  updateVehicle,
  type VehicleRemoval,
} from "@/services/vehicle.service";
import { syncVehicleImages } from "@/services/image.service";
import { addRepair, deleteRepair } from "@/services/fleet.service";
import { parseRepairFields } from "@/lib/validations/repair";
import { reportError } from "@/lib/observability";

export type ActionResult = { error: string } | undefined;
export type RemovalResult = { error: string } | { removal: VehicleRemoval };

/** Vehicle management is ADMIN-only; EMPLOYEE manages reservations. */

/**
 * Mints a short-lived Cloudinary signature so the browser can upload the
 * file directly. Uploading through this action instead would cap the whole
 * form at Vercel's 4.5 MB request body limit — under two phone photos.
 *
 * Rate limited per user: a signature is the credential that permits a write
 * to our Cloudinary account, and issuing them is otherwise unmetered.
 */
export async function signVehicleUploadAction(
  target: { vehicleId: string } | { draftId: string }
): Promise<{ signature: UploadSignature } | { error: string }> {
  try {
    const user = await requireRole("ADMIN");
    const limit = await consumeRateLimit(`upload-sign:${user.id}`, 60, 300);
    if (!limit.allowed) {
      throw new TooManyRequestsError(
        "Too many uploads. Please wait a moment and try again.",
        limit.retryAfter
      );
    }

    const folder =
      "vehicleId" in target
        ? vehicleFolder(target.vehicleId)
        : draftFolder(target.draftId);

    return { signature: signUpload(folder) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}

export async function createVehicleAction(
  formData: FormData
): Promise<ActionResult> {
  await requireRole("ADMIN");

  let input: ReturnType<typeof createVehicleSchema.parse>;
  let images: ReturnType<typeof parseVehicleImagesField>;
  try {
    input = createVehicleSchema.parse(parseVehicleFields(formData));
    images = parseVehicleImagesField(formData.get("images"));
  } catch (error) {
    // Nothing has been written yet, so the operator can correct the form and
    // submit again without creating anything.
    return { error: normalizeError(error).body.error.message };
  }

  let vehicle: Awaited<ReturnType<typeof createVehicle>>;
  try {
    vehicle = await createVehicle(input);
  } catch (error) {
    // Still nothing created — a duplicate plate belongs on the form, not on
    // the error boundary.
    return { error: normalizeError(error).body.error.message };
  }

  /*
   * The gallery cannot join that insert: syncVehicleImages makes Cloudinary
   * calls, and holding a database transaction open across network I/O against
   * a pooler capped at one connection is worse than the problem it solves.
   *
   * So the vehicle exists from here on, whatever happens next — and reporting
   * a photo failure as though nothing had been created is what let an operator
   * hit Save again and get a *second* vehicle. A plateless one has a random
   * slug suffix, so no unique constraint stopped it.
   *
   * Instead: keep the vehicle, take them to it, and carry the reason the
   * photos did not attach. The vehicle is real; the gallery is the part that
   * needs another go, and the edit page is where that is done.
   */
  let photosAttached = true;
  try {
    await syncVehicleImages(vehicle.id, images);
  } catch (error) {
    photosAttached = false;
    // The specific reason goes to the error report, not into the URL: a
    // querystring is admin-visible text, and the operator's actionable
    // information is "the photos are not on yet", which the page states.
    reportError(error, {
      scope: "create-vehicle-images",
      vehicleId: vehicle.id,
      imageCount: images.length,
    });
  }

  revalidatePath("/admin/vehicles");
  updateTag(PUBLIC_VEHICLES_TAG);
  redirect(
    `/admin/vehicles/${vehicle.id}/edit${photosAttached ? "?created=1" : "?photos=failed"}`
  );
}

export async function updateVehicleAction(
  vehicleId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireRole("ADMIN");
  try {
    const input = updateVehicleSchema.parse(parseVehicleFields(formData));
    const images = parseVehicleImagesField(formData.get("images"));
    await updateVehicle(vehicleId, input);
    await syncVehicleImages(vehicleId, images);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/vehicles");
  updateTag(PUBLIC_VEHICLES_TAG);
  // The list is where the operator lands, so that is where the save is
  // confirmed — a redirect leaves no client behind to say it.
  redirect("/admin/vehicles?saved=1");
}

export async function deleteVehicleAction(
  vehicleId: string
): Promise<RemovalResult> {
  await requireRole("ADMIN");
  let removal: VehicleRemoval;
  try {
    removal = await deleteVehicle(vehicleId);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/vehicles");
  updateTag(PUBLIC_VEHICLES_TAG);
  return { removal };
}

export async function addRepairAction(
  vehicleId: string,
  formData: FormData
): Promise<ActionResult> {
  await requireRole("ADMIN");
  try {
    const input = parseRepairFields(formData);
    await addRepair(vehicleId, input);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath(`/admin/vehicles/${vehicleId}/edit`);
  revalidatePath("/admin/vehicles");
  return undefined;
}

export async function deleteRepairAction(
  vehicleId: string,
  repairId: string
): Promise<ActionResult> {
  await requireRole("ADMIN");
  try {
    await deleteRepair(repairId);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath(`/admin/vehicles/${vehicleId}/edit`);
  return undefined;
}
