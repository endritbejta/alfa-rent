"use server";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_VEHICLES_TAG } from "@/services/vehicle.service";
import type { ReservationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError, TooManyRequestsError } from "@/lib/errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  inspectionFolder,
  signUpload,
  type UploadSignature,
} from "@/lib/cloudinary";
import {
  extendReservationSchema,
  updateReservationStatusSchema,
} from "@/lib/validations/reservation";
import {
  inspectionTypeSchema,
  parseInspectionPhotos,
  rentalInspectionSchema,
} from "@/lib/validations/inspection";
import {
  extendReservation,
  updateReservationStatus,
} from "@/services/reservation.service";
import { recordRentalInspection } from "@/services/inspection.service";

export type ActionResult = { error: string } | undefined;

export async function signInspectionUploadAction(
  reservationId: string,
  type: "PICKUP" | "RETURN"
): Promise<{ signature: UploadSignature } | { error: string }> {
  try {
    const user = await requireRole("EMPLOYEE");
    const safeType = inspectionTypeSchema.parse(type);
    const limit = await consumeRateLimit(
      `inspection-upload:${user.id}`,
      40,
      300
    );
    if (!limit.allowed) {
      throw new TooManyRequestsError(
        "Too many inspection uploads. Please wait a moment and try again.",
        limit.retryAfter
      );
    }
    return {
      signature: signUpload(inspectionFolder(reservationId, safeType)),
    };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}

export async function recordRentalInspectionAction(
  reservationId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("EMPLOYEE");
  try {
    const input = rentalInspectionSchema.parse({
      type: formData.get("type"),
      mileage: formData.get("mileage"),
      fuelLevel: formData.get("fuelLevel"),
      exteriorNotes: formData.get("exteriorNotes") || undefined,
      interiorNotes: formData.get("interiorNotes") || undefined,
      damageFound: formData.get("damageFound") === "on",
      damageNotes: formData.get("damageNotes") || undefined,
      signerName: formData.get("signerName"),
      customerAcknowledged: formData.get("customerAcknowledged") === "on",
      photos: parseInspectionPhotos(formData.get("photos")),
    });
    await recordRentalInspection(reservationId, user.id, input);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/vehicles");
  // A pickup inspection marks the vehicle RENTED and a return releases it,
  // and the storefront shows that status.
  updateTag(PUBLIC_VEHICLES_TAG);
  return undefined;
}

/**
 * Reservation handling is the employee's daily job — EMPLOYEE level.
 * The transition table in the service rejects invalid moves, and the DB
 * exclusion constraint has the final word on double-booked confirmations.
 */
export async function updateReservationStatusAction(
  reservationId: string,
  status: ReservationStatus
): Promise<ActionResult> {
  await requireRole("EMPLOYEE");
  try {
    const input = updateReservationStatusSchema.parse({ status });
    await updateReservationStatus(reservationId, input.status);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  return undefined;
}

/**
 * Keeping a car longer is a counter-side decision, so EMPLOYEE level like
 * the rest of reservation handling. Availability, the registration ceiling
 * and the status rules are all enforced in the service.
 */
export async function extendReservationAction(
  reservationId: string,
  returnDate: string
): Promise<ActionResult> {
  await requireRole("EMPLOYEE");
  try {
    const input = extendReservationSchema.parse({ returnDate });
    await extendReservation(reservationId, input.returnDate);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  return undefined;
}
