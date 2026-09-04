import { z } from "zod";
import {
  VehicleCategory,
  VehicleStatus,
  Transmission,
  FuelType,
} from "@prisma/client";
import { paginationSchema } from "./common";

export const vehicleFilterSchema = paginationSchema.extend({
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["newest", "price-asc", "price-desc"]).optional(),
  category: z.enum(VehicleCategory).optional(),
  transmission: z.enum(Transmission).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  // When both dates are present, results exclude vehicles with a
  // blocking reservation overlapping the range.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * Admin-only fleet filters. Kept separate from the public schema so a
 * visitor cannot craft a URL that surfaces retired or off-road vehicles.
 */
export const registrationFilters = [
  "valid",
  "due",
  "expired",
  "missing",
] as const;
export type RegistrationFilter = (typeof registrationFilters)[number];

/**
 * Every field falls back on its own via `.catch`, so one unreadable param
 * drops just that filter instead of failing the parse and quietly handing
 * back an unfiltered fleet.
 */
export const adminVehicleFilterSchema = vehicleFilterSchema.extend({
  brand: z.string().trim().min(1).max(50).optional().catch(undefined),
  status: z.enum(VehicleStatus).optional().catch(undefined),
  registration: z.enum(registrationFilters).optional().catch(undefined),
  category: z.enum(VehicleCategory).optional().catch(undefined),
  transmission: z.enum(Transmission).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  // A real page size: the admin list paginates, so this no longer has to
  // grow with the fleet. The public cap of 50 is a payload guard for
  // anonymous traffic; staff may page a little larger.
  perPage: z.coerce.number().int().min(1).max(100).catch(24),
});

export type AdminVehicleFilterInput = z.infer<typeof adminVehicleFilterSchema>;

/**
 * Optional columns are `nullish`, not `optional`.
 *
 * Prisma reads `undefined` in an update as "leave this column unchanged", so a
 * schema that turned a cleared field into `undefined` made clearing silently
 * do nothing: the form redirected as though it had saved and the old value was
 * still there on reload. `null` is what actually writes NULL. On create the two
 * behave identically, so one schema still serves both.
 */
export const createVehicleSchema = z.object({
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(80),
  plate: z
    .string()
    .trim()
    .max(15)
    .nullish()
    .transform((v) => (v ? v.toUpperCase() : null)),
  year: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 1),
  category: z.enum(VehicleCategory),
  transmission: z.enum(Transmission),
  fuelType: z.enum(FuelType),
  seats: z.number().int().min(1).max(20),
  pricePerDay: z.number().positive().max(10000),
  description: z.string().trim().min(10).max(2000),
  status: z.enum(VehicleStatus).default("AVAILABLE"),
  registrationDate: z.coerce.date().nullish(),
  registrationExpiry: z.coerce.date().nullish(),
  lastServiceDate: z.coerce.date().nullish(),
  nextServiceDate: z.coerce.date().nullish(),
  serviceNotes: z.string().trim().max(1000).nullish(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export type VehicleFilterInput = z.infer<typeof vehicleFilterSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

/**
 * Emptied optional fields become `null`, not `undefined`.
 *
 * Prisma reads `undefined` in an update as "leave unchanged", so mapping a
 * cleared field to `undefined` meant clearing a plate, a service date or the
 * service notes appeared to save — the form redirected, the value came back on
 * reload. `null` is what writes NULL. The schema accepts both, so create is
 * unaffected.
 *
 * `status` stays `undefined` when absent: it is not nullable, and a missing
 * status means "unchanged", not "clear it".
 */
export function parseVehicleFields(formData: FormData) {
  const cleared = (key: string) => formData.get(key) || null;

  return {
    brand: formData.get("brand"),
    model: formData.get("model"),
    plate: cleared("plate"),
    year: Number(formData.get("year")),
    category: formData.get("category"),
    transmission: formData.get("transmission"),
    fuelType: formData.get("fuelType"),
    seats: Number(formData.get("seats")),
    pricePerDay: Number(formData.get("pricePerDay")),
    description: formData.get("description"),
    status: formData.get("status") ?? undefined,
    registrationDate: cleared("registrationDate"),
    registrationExpiry: cleared("registrationExpiry"),
    lastServiceDate: cleared("lastServiceDate"),
    nextServiceDate: cleared("nextServiceDate"),
    serviceNotes: cleared("serviceNotes"),
  };
}
