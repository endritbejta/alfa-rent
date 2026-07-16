import { z } from "zod";
import {
  VehicleCategory,
  VehicleStatus,
  Transmission,
  FuelType,
} from "@prisma/client";
import { paginationSchema } from "./common";

export const vehicleFilterSchema = paginationSchema.extend({
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

export const createVehicleSchema = z.object({
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(80),
  plate: z
    .string()
    .trim()
    .max(15)
    .optional()
    .transform((v) => (v ? v.toUpperCase() : undefined)),
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
  registrationDate: z.coerce.date().optional(),
  registrationExpiry: z.coerce.date().optional(),
  lastServiceDate: z.coerce.date().optional(),
  nextServiceDate: z.coerce.date().optional(),
  serviceNotes: z.string().trim().max(1000).optional(),
});

export const updateVehicleSchema = createVehicleSchema.partial();

export type VehicleFilterInput = z.infer<typeof vehicleFilterSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
