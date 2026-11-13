import { after, type NextRequest } from "next/server";
import { assertSameSiteJson, ok, withErrorHandling } from "@/lib/api";
import { TooManyRequestsError } from "@/lib/errors";
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENT_REPLAY_HEADER,
  idempotencyKeySchema,
} from "@/lib/idempotency";
import { clientIp, consumeRateLimit } from "@/lib/rate-limit";
import { createBookingSchema } from "@/lib/validations/reservation";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";
import { createReservation } from "@/services/reservation.service";
import { notifyStaffOfBookingRequest } from "@/services/notification.service";
import { notifyCustomer } from "@/services/customer-notification.service";

/**
 * Generous enough that a family comparing dates never notices, tight enough
 * that a script cannot fill the pending queue staff work from. Each request
 * writes a customer and a reservation, so this is the cheapest way to make
 * the app do expensive things.
 */
const BOOKINGS_PER_HOUR = 8;
const WINDOW_SECONDS = 60 * 60;

export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameSiteJson(request);

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

  // Optional, so existing callers keep working; malformed is a 400 rather
  // than silently ignored, since a client that sends one is relying on it.
  const header = request.headers.get(IDEMPOTENCY_HEADER);
  const idempotencyKey =
    header === null ? undefined : idempotencyKeySchema.parse(header);

  // The language the storefront was showing, kept for every later email to
  // this customer. A caller without the cookie (the public API) gets none,
  // and its emails use the default language.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale) ? cookieLocale : undefined;

  const input = createBookingSchema.parse(await request.json());
  const { reservation, paymentAccessToken, replayed } = await createReservation(
    input,
    { idempotencyKey, locale }
  );
  // After the response: the customer's confirmation never waits on, or fails
  // because of, the mail provider. sendEmail reports its own failures. A
  // replay is a booking staff and the customer were already told about.
  if (!replayed) {
    after(() => notifyStaffOfBookingRequest(reservation.id));
    after(() => notifyCustomer(reservation.id, "received"));
  }
  return ok(
    {
      id: reservation.id,
      status: reservation.status,
      totalPrice: Number(reservation.totalPrice),
      paymentAccessToken,
    },
    {
      // The same answer the first attempt got, marked as a repeat so a
      // client can tell (Stripe's header name; there is no standard one).
      status: 201,
      headers: replayed ? { [IDEMPOTENT_REPLAY_HEADER]: "true" } : undefined,
    }
  );
});
