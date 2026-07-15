import type { NextRequest } from "next/server";
import { ok, withErrorHandling } from "@/lib/api";
import { createBookingSchema } from "@/lib/validations/reservation";
import { createReservation } from "@/services/reservation.service";

export const POST = withErrorHandling(async (request: NextRequest) => {
  const input = createBookingSchema.parse(await request.json());
  const reservation = await createReservation(input);
  return ok(
    {
      id: reservation.id,
      status: reservation.status,
      totalPrice: Number(reservation.totalPrice),
    },
    { status: 201 }
  );
});
