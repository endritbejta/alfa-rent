"use server";

import { revalidatePath, updateTag } from "next/cache";
import { after } from "next/server";
import { PUBLIC_VEHICLES_TAG } from "@/services/vehicle.service";
import type { ReservationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { TooManyRequestsError } from "@/lib/errors";
import { errorMessage } from "@/lib/errors-i18n";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  inspectionFolder,
  signUpload,
  type UploadSignature,
} from "@/lib/cloudinary";
import {
  cancelReasonRequiredError,
  extendReservationSchema,
  updateReservationStatusSchema,
} from "@/lib/validations/reservation";
import {
  inspectionTypeSchema,
  lateReturnFromForm,
  parseInspectionPhotos,
  pastRentalSchema,
  rentalInspectionSchema,
} from "@/lib/validations/inspection";
import {
  extendReservation,
  updateReservationStatus,
} from "@/services/reservation.service";
import { notifyCustomer } from "@/services/customer-notification.service";
import {
  getPickupMileage,
  recordPastRental,
  recordRentalInspection,
} from "@/services/inspection.service";

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
    return { error: await errorMessage(error) };
  }
}

/** Shown beside the return odometer field so staff see the starting figure. */
export async function getPickupMileageAction(
  reservationId: string
): Promise<number | null> {
  await requireRole("EMPLOYEE");
  return getPickupMileage(reservationId);
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
      lateStartConfirmed: formData.get("lateStartConfirmed") === "on",
      occurredOn: formData.get("occurredOn") || undefined,
      lateReturn: lateReturnFromForm(formData),
    });
    await recordRentalInspection(reservationId, user.id, input);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/vehicles");
  // A late return's charge is revenue.
  revalidatePath("/admin/analytics");
  // A pickup inspection marks the vehicle RENTED and a return releases it,
  // and the storefront shows that status.
  updateTag(PUBLIC_VEHICLES_TAG);
  return undefined;
}

/**
 * A rental that happened but was never started, recorded in one step once
 * it is over. Same level as the inspections it stands in for. The vehicle's
 * status is untouched, so the storefront's tag stays valid.
 */
export async function recordPastRentalAction(
  reservationId: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireRole("EMPLOYEE");
  try {
    const input = pastRentalSchema.parse({
      startedOn: formData.get("startedOn"),
      returnedOn: formData.get("returnedOn"),
      note: formData.get("note"),
      confirmed: formData.get("confirmed") === "on",
      lateReturn: lateReturnFromForm(formData),
    });
    await recordPastRental(reservationId, user.id, input);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/analytics");
  return undefined;
}

/**
 * Reservation handling is the employee's daily job — EMPLOYEE level.
 * The transition table in the service rejects invalid moves, and the DB
 * exclusion constraint has the final word on double-booked confirmations.
 */
export async function updateReservationStatusAction(
  reservationId: string,
  status: ReservationStatus,
  /** Required when cancelling; stored on the audit event. */
  reason?: string | null
): Promise<ActionResult> {
  const user = await requireRole("EMPLOYEE");
  let kind: "confirmed" | "cancelled";
  try {
    const parsed = updateReservationStatusSchema.safeParse({ status, reason });
    if (!parsed.success) {
      // The one refusal staff can act on gets its own translated sentence.
      if (parsed.error.issues.some((issue) => issue.path[0] === "reason")) {
        throw cancelReasonRequiredError();
      }
      throw parsed.error;
    }
    const input = parsed.data;
    await updateReservationStatus(
      reservationId,
      input.status,
      user.id,
      input.reason
    );
    // The service refuses every other target status.
    kind = input.status === "CONFIRMED" ? "confirmed" : "cancelled";
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  // Tell the customer after the response, so a slow mail provider never
  // holds up staff. The cancellation reason stays internal: it is not
  // passed on, and the email says only that the booking was cancelled.
  after(() => notifyCustomer(reservationId, kind));
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  return undefined;
}

/**
 * Keeping a car longer is a counter-side decision, so EMPLOYEE level like
 * the rest of reservation handling. Availability and the status rules are
 * enforced in the service.
 */
export async function extendReservationAction(
  reservationId: string,
  returnDate: string
): Promise<ActionResult> {
  const user = await requireRole("EMPLOYEE");
  try {
    const input = extendReservationSchema.parse({ returnDate });
    await extendReservation(reservationId, input.returnDate, user.id);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/calendar");
  return undefined;
}
