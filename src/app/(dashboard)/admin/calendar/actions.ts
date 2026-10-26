"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { errorMessage } from "@/lib/errors-i18n";
import {
  manualReservationSchema,
  reservationPreviewSchema,
} from "@/lib/validations/reservation";
import {
  createManualReservation,
  previewManualReservation,
  type BookingPreview,
} from "@/services/reservation.service";

export type ManualResult = { ok: true } | { error: string };

export async function createManualReservationAction(
  input: unknown
): Promise<ManualResult> {
  await requireRole("EMPLOYEE");
  try {
    const parsed = manualReservationSchema.parse(input);
    await createManualReservation(parsed);
  } catch (error) {
    return { error: await errorMessage(error) };
  }
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/reservations");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/customers");
  return { ok: true };
}

/** Price and obstacles for the booking dialog, before anything is written. */
export async function previewManualReservationAction(
  input: unknown
): Promise<{ preview: BookingPreview } | { error: string }> {
  await requireRole("EMPLOYEE");
  try {
    const parsed = reservationPreviewSchema.parse(input);
    return { preview: await previewManualReservation(parsed) };
  } catch (error) {
    return { error: await errorMessage(error) };
  }
}
