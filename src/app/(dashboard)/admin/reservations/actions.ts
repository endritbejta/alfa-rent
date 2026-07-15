"use server";

import { revalidatePath } from "next/cache";
import type { ReservationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { updateReservationStatusSchema } from "@/lib/validations/reservation";
import { updateReservationStatus } from "@/services/reservation.service";

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
