import type { NextRequest } from "next/server";
import { ok, withErrorHandling } from "@/lib/api";
import { TooManyRequestsError } from "@/lib/errors";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { createBookingSchema } from "@/lib/validations/reservation";
import { createReservation } from "@/services/reservation.service";

/**
 * Generous enough that a family comparing dates never notices, tight enough
 * that a script cannot fill the pending queue staff work from. Each request
 * writes a customer and a reservation, so this is the cheapest way to make
 * the app do expensive things.
 */
const BOOKINGS_PER_HOUR = 8;
const WINDOW_SECONDS = 60 * 60;

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { allowed, retryAfter } = await consumeRateLimit(
    `bookings:${clientIp(request.headers)}`,
    BOOKINGS_PER_HOUR,
    WINDOW_SECONDS
  );
  if (!allowed) {
    throw new TooManyRequestsError(
      "You have sent several booking requests recently. Please call us if it is urgent.",
      retryAfter
    );
  }

  const input = createBookingSchema.parse(await request.json());
  const { reservation, paymentAccessToken } = await createReservation(input);
  return ok(
    {
      id: reservation.id,
      status: reservation.status,
      totalPrice: Number(reservation.totalPrice),
      paymentAccessToken,
    },
    { status: 201 }
  );
});
