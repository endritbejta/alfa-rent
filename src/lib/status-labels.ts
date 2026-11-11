import type { ReservationStatus, Role, VehicleStatus } from "@prisma/client";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * What each lifecycle state is called, in one place.
 *
 * This map existed three times over — the badge, the reservations page and
 * the status filter each kept their own copy — and a fourth was about to be
 * written for the error messages that name a status. A status added to the
 * schema now fails to compile until it is named once, rather than in four
 * places or, worse, three.
 */
export const RESERVATION_STATUS_KEYS = {
  PENDING: "vehicle.pending",
  CONFIRMED: "vehicle.confirmed",
  ACTIVE: "vehicle.active",
  COMPLETED: "vehicle.completed",
  CANCELLED: "vehicle.cancelled",
} as const satisfies Record<ReservationStatus, TranslationKey>;

export const VEHICLE_STATUS_KEYS = {
  AVAILABLE: "vehicle.available",
  RENTED: "vehicle.rented",
  SERVICE: "vehicle.maintenance",
  INACTIVE: "vehicle.inactive",
} as const satisfies Record<VehicleStatus, TranslationKey>;

export const STATUS_KEYS = {
  ...VEHICLE_STATUS_KEYS,
  ...RESERVATION_STATUS_KEYS,
} as const satisfies Record<VehicleStatus | ReservationStatus, TranslationKey>;

/** A staff role as staff read it, rather than the enum's ADMIN. */
export const ROLE_KEYS = {
  ADMIN: "staff.roleAdmin",
  EMPLOYEE: "staff.roleEmployee",
} as const satisfies Record<Role, TranslationKey>;
