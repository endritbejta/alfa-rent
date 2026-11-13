import { z } from "zod";

/**
 * A routine service as staff enter it. Cost may be 0 — a service under
 * warranty costs the business nothing — unlike a repair, which always has a
 * bill. Matches the vehicle_services_cost_nonnegative CHECK.
 */
export const vehicleServiceSchema = z.object({
  /** A picked calendar day; "2026-05-01" coerces to 00:00 UTC. */
  date: z.coerce.date(),
  cost: z.coerce.number().min(0, "Cost cannot be negative").max(100000),
  mileage: z.coerce.number().int().min(0).max(2_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type VehicleServiceInput = z.infer<typeof vehicleServiceSchema>;

/** The form field names the drawer's service form posts. */
export const SERVICE_FIELD_NAMES = {
  date: "service-date",
  cost: "service-cost",
  mileage: "service-mileage",
  notes: "service-notes",
} as const satisfies Record<keyof VehicleServiceInput, string>;

/**
 * Reads a service out of FormData and validates it. Blank or missing optional
 * fields are absent, not "" or null: an empty mileage must not coerce to 0 km,
 * and FormData.get answers null for a field that was not posted at all.
 */
export function parseVehicleServiceFields(
  formData: FormData
): VehicleServiceInput {
  const value = (key: keyof typeof SERVICE_FIELD_NAMES) => {
    const raw = formData.get(SERVICE_FIELD_NAMES[key]);
    if (raw === null) return undefined;
    return typeof raw === "string" && raw.trim() === "" ? undefined : raw;
  };

  return vehicleServiceSchema.parse({
    date: value("date"),
    cost: value("cost"),
    mileage: value("mileage"),
    notes: value("notes"),
  });
}
