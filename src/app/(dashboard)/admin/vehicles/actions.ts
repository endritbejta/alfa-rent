"use server";

import { revalidatePath } from "next/cache";
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
  updateVehicleSchema,
} from "@/lib/validations/vehicle";
import { parseVehicleImagesField } from "@/lib/validations/image";
import {
  createVehicle,
  deleteVehicle,
  updateVehicle,
} from "@/services/vehicle.service";
import { syncVehicleImages } from "@/services/image.service";
import { addRepair, deleteRepair } from "@/services/fleet.service";
import { parseRepairFields } from "@/lib/validations/repair";

export type ActionResult = { error: string } | undefined;

/** Vehicle management is ADMIN-only; EMPLOYEE manages reservations. */

function parseVehicleFields(formData: FormData) {
  return {
    brand: formData.get("brand"),
    model: formData.get("model"),
    plate: formData.get("plate") || undefined,
    year: Number(formData.get("year")),
    category: formData.get("category"),
    transmission: formData.get("transmission"),
    fuelType: formData.get("fuelType"),
    seats: Number(formData.get("seats")),
    pricePerDay: Number(formData.get("pricePerDay")),
    description: formData.get("description"),
    status: formData.get("status") ?? undefined,
    registrationDate: formData.get("registrationDate") || undefined,
    registrationExpiry: formData.get("registrationExpiry") || undefined,
    lastServiceDate: formData.get("lastServiceDate") || undefined,
    nextServiceDate: formData.get("nextServiceDate") || undefined,
    serviceNotes: formData.get("serviceNotes") || undefined,
  };
}

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
  let vehicleId: string;
  try {
    const input = createVehicleSchema.parse(parseVehicleFields(formData));
    const images = parseVehicleImagesField(formData.get("images"));
    const vehicle = await createVehicle(input);
    vehicleId = vehicle.id;
    await syncVehicleImages(vehicle.id, images);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/vehicles");
  redirect(`/admin/vehicles/${vehicleId}/edit?created=1`);
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
  redirect("/admin/vehicles");
}

export async function deleteVehicleAction(
  vehicleId: string
): Promise<ActionResult> {
  await requireRole("ADMIN");
  try {
    await deleteVehicle(vehicleId);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/vehicles");
  return undefined;
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
