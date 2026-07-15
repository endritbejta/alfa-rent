"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { manualReservationSchema } from "@/lib/validations/reservation";
import { createManualReservation } from "@/services/reservation.service";

export type ManualResult = { ok: true } | { error: string };

export async function createManualReservationAction(
  input: unknown
): Promise<ManualResult> {
  await requireRole("EMPLOYEE");
  try {
    const parsed = manualReservationSchema.parse(input);
    await createManualReservation(parsed);
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
  revalidatePath("/admin/calendar");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
