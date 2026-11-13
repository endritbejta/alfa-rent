import type { VehicleStatus } from "@prisma/client";

/**
 * Operational states that may appear in the storefront and accept a future
 * reservation request. RENTED remains listable because availability is
 * date-based; SERVICE and INACTIVE are never customer-bookable.
 */
export const PUBLIC_BOOKABLE_VEHICLE_STATUSES = [
  "AVAILABLE",
  "RENTED",
] as const satisfies readonly VehicleStatus[];

export function isPublicBookableVehicleStatus(status: VehicleStatus): boolean {
  return (
    PUBLIC_BOOKABLE_VEHICLE_STATUSES as readonly VehicleStatus[]
  ).includes(status);
}

/**
 * Statuses an operator may choose directly, on create or edit.
 *
 * `RENTED` is absent on purpose: it means "a rental is out", which is a fact
 * about a reservation, not an attribute someone types in. Only the pickup
 * handover sets it, and only the return clears it.
 */
export const OPERATOR_SETTABLE_STATUSES = [
  "AVAILABLE",
  "SERVICE",
  "INACTIVE",
] as const satisfies readonly VehicleStatus[];
