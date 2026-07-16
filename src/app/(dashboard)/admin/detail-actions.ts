"use server";

import { requireUser } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { getReservationDetail } from "@/services/reservation.service";

export type ReservationDetail = Awaited<
  ReturnType<typeof getReservationDetail>
>;

/**
 * Drawer data is fetched on demand rather than shipped with every list —
 * the summary widgets stay light, the detail arrives when asked for.
 */
export async function getReservationDetailAction(
  id: string
): Promise<{ data: ReservationDetail } | { error: string }> {
  await requireUser();
  try {
    return { data: await getReservationDetail(id) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}
