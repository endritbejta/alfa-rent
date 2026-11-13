import { z } from "zod";
import { ReservationStatus } from "@prisma/client";
import {
  atBusinessPickupTime,
  businessDay,
  rentalCalendarDay,
} from "@/lib/business-time";
import { idempotencyKeySchema } from "@/lib/idempotency";
import { rentalDays } from "@/lib/rental-dates";
import { CANCEL_REASON_MAX, CANCEL_REASON_MIN } from "@/lib/cancel-reason";
import { ValidationError } from "@/lib/errors";

export const MAX_RENTAL_DAYS = 365;
export const MAX_BOOKING_HORIZON_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pickup and return day both count, so returning on the pickup day is a
 * one-day rental; only a return day before the pickup day is invalid.
 */
const returnNotBeforePickup = (d: { pickupDate: Date; returnDate: Date }) =>
  rentalCalendarDay(d.returnDate) >= rentalCalendarDay(d.pickupDate);

/**
 * Any parseable date is accepted, then pinned to the business pickup time
 * of its calendar day (audit finding P3-3). The forms always sent T10:00Z,
 * but the public API took whatever instant arrived and stored it, so the
 * same days could be two different bookings to the idempotency check.
 */
const rentalDate = z.coerce.date().transform(atBusinessPickupTime);

const dateRange = {
  pickupDate: rentalDate,
  returnDate: rentalDate,
};

const withValidRange = <T extends { pickupDate: Date; returnDate: Date }>(
  schema: z.ZodType<T>
) =>
  schema
    .refine(returnNotBeforePickup, {
      message: "Return date cannot be before pickup date",
      path: ["returnDate"],
    })
    .refine((d) => rentalCalendarDay(d.pickupDate) >= businessDay(new Date()), {
      message: "Pickup date cannot be in the past",
      path: ["pickupDate"],
    })
    .refine(
      (d) =>
        d.pickupDate.getTime() <=
        Date.now() + MAX_BOOKING_HORIZON_DAYS * DAY_MS,
      {
        message: `Pickup date must be within ${MAX_BOOKING_HORIZON_DAYS} days`,
        path: ["pickupDate"],
      }
    )
    .refine(
      (d) =>
        !returnNotBeforePickup(d) ||
        rentalDays(d.pickupDate, d.returnDate) <= MAX_RENTAL_DAYS,
      {
        message: `Rental duration cannot exceed ${MAX_RENTAL_DAYS} days`,
        path: ["returnDate"],
      }
    );

export const availabilitySchema = withValidRange(
  z.object({ vehicleId: z.string().min(1), ...dateRange })
);

export const createBookingSchema = withValidRange(
  z.object({
    vehicleId: z.string().min(1),
    ...dateRange,
    customer: z.object({
      firstName: z.string().trim().min(1).max(50),
      lastName: z.string().trim().min(1).max(50),
      email: z.email(),
      phone: z.string().trim().min(6).max(25),
    }),
    notes: z.string().trim().max(1000).optional(),
  })
);

/**
 * A cancellation must say why, so "who cancelled this, and why?" has an
 * answer (audit P2-7). The service checks again for any other caller.
 */
export const updateReservationStatusSchema = z
  .object({
    status: z.enum(ReservationStatus),
    reason: z
      .string()
      .trim()
      .max(CANCEL_REASON_MAX)
      .nullish()
      .transform((v) => v || null),
  })
  .refine(
    (v) =>
      v.status !== "CANCELLED" || (v.reason?.length ?? 0) >= CANCEL_REASON_MIN,
    { message: "cancelReasonRequired", path: ["reason"] }
  );

/** The refusal both the action and the service give, in the reader's language. */
export function cancelReasonRequiredError(): ValidationError {
  return new ValidationError(
    `Give a reason for cancelling (at least ${CANCEL_REASON_MIN} characters)`,
    { key: "err.cancelReasonRequired", values: { count: CANCEL_REASON_MIN } }
  );
}

/**
 * Extending only ever moves the return date later; the service enforces
 * that, along with availability. No past-date
 * rule here — an ACTIVE rental's pickup is by definition already behind us.
 */
export const extendReservationSchema = z.object({
  returnDate: z.coerce.date(),
});

/**
 * Who a staff booking is for: someone already on file, or a new customer
 * entered on the spot. A new customer must leave a phone number — the walk-in
 * flow used to record a name only, so nobody could call them back. Email is
 * optional because plenty of phone customers do not give one.
 */
export const manualCustomerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), id: z.string().min(1) }),
  z.object({
    kind: z.literal("new"),
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().max(50).optional(),
    phone: z.string().trim().min(6).max(25),
    email: z
      .union([z.literal(""), z.string().trim().toLowerCase().pipe(z.email())])
      .optional()
      .transform((v) => v || undefined),
  }),
]);

/**
 * Admin "book on the phone" flow. Unlike the public form, staff choose the
 * initial request status. An active rental must go through the pickup
 * inspection, so it cannot be created directly from the calendar.
 */
export const manualReservationSchema = withValidRange(
  z.object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    customer: manualCustomerSchema,
    ...dateRange,
    status: z.enum(["PENDING", "CONFIRMED"]),
    notes: z.string().trim().max(1000).optional(),
    /** Names the submission so a retry returns the first one's result. */
    idempotencyKey: idempotencyKeySchema.optional(),
  })
);

/**
 * What the booking dialog asks before it commits: the price and whether
 * anything stands in the way. No past-date rule, so the preview can explain a
 * stale range instead of failing to parse it; the create path still has one.
 */
export const reservationPreviewSchema = z
  .object({ vehicleId: z.string().min(1), ...dateRange })
  .refine(returnNotBeforePickup, {
    path: ["returnDate"],
  });

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ManualReservationInput = z.infer<typeof manualReservationSchema>;
export type ReservationPreviewInput = z.infer<typeof reservationPreviewSchema>;
