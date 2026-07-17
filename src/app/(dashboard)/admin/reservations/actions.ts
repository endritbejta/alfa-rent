"use server";

import { revalidatePath } from "next/cache";
import type { ReservationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import {
  extendReservationSchema,
  updateReservationStatusSchema,
} from "@/lib/validations/reservation";
import {
  extendReservation,
  updateReservationStatus,
} from "@/services/reservation.service";

export type ActionResult = { error: string } | undefined;

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
