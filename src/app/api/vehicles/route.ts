import type { NextRequest } from "next/server";
import { ok, withErrorHandling } from "@/lib/api";
import { vehicleFilterSchema } from "@/lib/validations/vehicle";
import { getVehicles } from "@/services/vehicle.service";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const filters = vehicleFilterSchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  return ok(await getVehicles(filters));
});
