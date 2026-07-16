import type { NextRequest } from "next/server";
import { ok, withErrorHandling } from "@/lib/api";
import { vehicleFilterSchema } from "@/lib/validations/vehicle";
import { getPublicVehicles } from "@/services/vehicle.service";

/**
 * Anonymous listing. Deliberately uses the public read, whose payload is an
 * explicit allowlist — the admin read carries plates, registration dates and
 * running costs that must never leave the building.
 */
export const GET = withErrorHandling(async (request: NextRequest) => {
  const filters = vehicleFilterSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  const page = await getPublicVehicles(filters);
  return ok({
    ...page,
    // Decimal does not survive JSON as a number; make the contract explicit.
    items: page.items.map((v) => ({
      ...v,
      pricePerDay: Number(v.pricePerDay),
    })),
  });
});
