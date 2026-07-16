"use server";

import { requireUser } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { getReservationDetail } from "@/services/reservation.service";
import { getVehicleDetail } from "@/services/fleet.service";
import { getCustomerById } from "@/services/customer.service";

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

export type VehicleDetail = Awaited<ReturnType<typeof getVehicleDetail>>;

export async function getVehicleDetailAction(
  id: string
): Promise<{ data: VehicleDetail } | { error: string }> {
  await requireUser();
  try {
    return { data: await getVehicleDetail(id) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}

export type CustomerDetail = Awaited<ReturnType<typeof getCustomerById>>;

export async function getCustomerDetailAction(
  id: string
): Promise<{ data: CustomerDetail } | { error: string }> {
  await requireUser();
  try {
    return { data: await getCustomerById(id) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}
