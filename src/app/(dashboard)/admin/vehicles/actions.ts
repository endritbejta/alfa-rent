"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import {
  createVehicleSchema,
  updateVehicleSchema,
} from "@/lib/validations/vehicle";
import {
  createVehicle,
  deleteVehicle,
  updateVehicle,
} from "@/services/vehicle.service";
import { addVehicleImages, deleteVehicleImage } from "@/services/image.service";
import { addRepair, deleteRepair } from "@/services/fleet.service";
import { repairSchema } from "@/lib/validations/repair";

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

function imageFiles(formData: FormData): File[] {
  return formData
    .getAll("images")
    .filter((f): f is File => f instanceof File && f.size > 0);
}

export async function createVehicleAction(
  formData: FormData
): Promise<ActionResult> {
  await requireRole("ADMIN");
  let vehicleId: string;
  try {
    const input = createVehicleSchema.parse(parseVehicleFields(formData));
    const vehicle = await createVehicle(input);
    vehicleId = vehicle.id;
    await addVehicleImages(vehicle.id, imageFiles(formData));
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
    await updateVehicle(vehicleId, input);
    await addVehicleImages(vehicleId, imageFiles(formData));
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

export async function deleteVehicleImageAction(
  imageId: string
): Promise<ActionResult> {
  await requireRole("ADMIN");
  try {
    await deleteVehicleImage(imageId);
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
    const input = repairSchema.parse({
      date: formData.get("date"),
      cost: formData.get("cost"),
      description: formData.get("description"),
      notes: formData.get("notes") || undefined,
      reference: formData.get("reference") || undefined,
    });
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
