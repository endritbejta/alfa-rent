import type { NextRequest } from "next/server";
import { z } from "zod";
import { ok, withErrorHandling } from "@/lib/api";
import { TooManyRequestsError } from "@/lib/errors";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { createPaymentCheckout } from "@/services/payment.service";

const checkoutSchema = z.object({
  reservationId: z.string().min(1).max(64),
  accessToken: z.string().min(32).max(128),
});

const CHECKOUTS_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

export const POST = withErrorHandling(async (request: NextRequest) => {
  const { reservationId, accessToken } = checkoutSchema.parse(
    await request.json()
  );
  const { allowed, retryAfter } = await consumeRateLimit(
    `payment-checkout:${reservationId}:${clientIp(request.headers)}`,
    CHECKOUTS_PER_HOUR,
    WINDOW_SECONDS
  );
  if (!allowed) {
    throw new TooManyRequestsError(
      "Too many payment attempts. Please wait before trying again.",
      retryAfter
    );
  }

  return ok(await createPaymentCheckout(reservationId, accessToken), {
    status: 201,
  });
});
