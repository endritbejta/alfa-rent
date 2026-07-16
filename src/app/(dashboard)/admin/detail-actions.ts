"use server";

import { requireUser } from "@/lib/auth/guards";
import { normalizeError } from "@/lib/errors";
import { getReservationDetail } from "@/services/reservation.service";
import { getVehicleDetail } from "@/services/fleet.service";
import { getCustomerById } from "@/services/customer.service";

type RawReservation = Awaited<ReturnType<typeof getReservationDetail>>;

/**
 * Prisma Decimal is not serializable across the server/client boundary, so
 * money is converted to numbers before it leaves the action.
 */
export type ReservationDetail = Omit<
  RawReservation,
  "totalPrice" | "vehicle" | "customer"
> & {
  totalPrice: number;
  vehicle: Omit<RawReservation["vehicle"], "pricePerDay"> & {
    pricePerDay: number;
  };
  customer: Omit<RawReservation["customer"], "reservations"> & {
    reservations: (Omit<
      RawReservation["customer"]["reservations"][number],
      "totalPrice"
    > & { totalPrice: number })[];
  };
};

function plainReservation(r: RawReservation): ReservationDetail {
  return {
    ...r,
    totalPrice: Number(r.totalPrice),
    vehicle: { ...r.vehicle, pricePerDay: Number(r.vehicle.pricePerDay) },
    customer: {
      ...r.customer,
      reservations: r.customer.reservations.map((h) => ({
        ...h,
        totalPrice: Number(h.totalPrice),
      })),
    },
  };
}

/**
 * Drawer data is fetched on demand rather than shipped with every list —
 * the summary widgets stay light, the detail arrives when asked for.
 */
export async function getReservationDetailAction(
  id: string
): Promise<{ data: ReservationDetail } | { error: string }> {
  await requireUser();
  try {
    return { data: plainReservation(await getReservationDetail(id)) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}

type RawVehicleDetail = Awaited<ReturnType<typeof getVehicleDetail>>;

export type VehicleDetail = Omit<RawVehicleDetail, "vehicle"> & {
  vehicle: Omit<
    RawVehicleDetail["vehicle"],
    | "pricePerDay"
    | "registrationCost"
    | "serviceCost"
    | "repairs"
    | "reservations"
  > & {
    pricePerDay: number;
    registrationCost: number | null;
    serviceCost: number | null;
    repairs: (Omit<RawVehicleDetail["vehicle"]["repairs"][number], "cost"> & {
      cost: number;
    })[];
    reservations: (Omit<
      RawVehicleDetail["vehicle"]["reservations"][number],
      "totalPrice"
    > & { totalPrice: number })[];
  };
};

function plainVehicle(d: RawVehicleDetail): VehicleDetail {
  return {
    ...d,
    vehicle: {
      ...d.vehicle,
      pricePerDay: Number(d.vehicle.pricePerDay),
      registrationCost:
        d.vehicle.registrationCost === null
          ? null
          : Number(d.vehicle.registrationCost),
      serviceCost:
        d.vehicle.serviceCost === null ? null : Number(d.vehicle.serviceCost),
      repairs: d.vehicle.repairs.map((r) => ({ ...r, cost: Number(r.cost) })),
      reservations: d.vehicle.reservations.map((r) => ({
        ...r,
        totalPrice: Number(r.totalPrice),
      })),
    },
  };
}

export async function getVehicleDetailAction(
  id: string
): Promise<{ data: VehicleDetail } | { error: string }> {
  await requireUser();
  try {
    return { data: plainVehicle(await getVehicleDetail(id)) };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}

type RawCustomerDetail = Awaited<ReturnType<typeof getCustomerById>>;

export type CustomerDetail = Omit<RawCustomerDetail, "reservations"> & {
  reservations: (Omit<
    RawCustomerDetail["reservations"][number],
    "totalPrice"
  > & { totalPrice: number })[];
};

export async function getCustomerDetailAction(
  id: string
): Promise<{ data: CustomerDetail } | { error: string }> {
  await requireUser();
  try {
    const customer = await getCustomerById(id);
    return {
      data: {
        ...customer,
        reservations: customer.reservations.map((r) => ({
          ...r,
          totalPrice: Number(r.totalPrice),
        })),
      },
    };
  } catch (error) {
    return { error: normalizeError(error).body.error.message };
  }
}
