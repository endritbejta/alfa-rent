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
