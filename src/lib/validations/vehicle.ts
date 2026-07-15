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

export const createVehicleSchema = z.object({
  brand: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(80),
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
});

export const updateVehicleSchema = createVehicleSchema.partial();

export type VehicleFilterInput = z.infer<typeof vehicleFilterSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
