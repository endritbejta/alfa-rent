import type { NextRequest } from "next/server";
import { ok, withErrorHandling } from "@/lib/api";
import { availabilitySchema } from "@/lib/validations/reservation";
import { checkAvailability, getQuote } from "@/services/reservation.service";

export const GET = withErrorHandling(async (request: NextRequest) => {
  const input = availabilitySchema.parse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  const { available } = await checkAvailability(input);
  const totalPrice = available ? await getQuote(input) : null;
  return ok({ available, totalPrice: totalPrice ? Number(totalPrice) : null });
});
