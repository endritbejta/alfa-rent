import { z } from "zod";
import { ReservationStatus } from "@prisma/client";
import { businessDay, rentalCalendarDay } from "@/lib/reservation-lifecycle";

export const MAX_RENTAL_DAYS = 365;
export const MAX_BOOKING_HORIZON_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;

const dateRange = {
  pickupDate: z.coerce.date(),
  returnDate: z.coerce.date(),
};

const withValidRange = <T extends { pickupDate: Date; returnDate: Date }>(
  schema: z.ZodType<T>
) =>
  schema
    .refine((d) => d.returnDate > d.pickupDate, {
      message: "Return date must be after pickup date",
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
        d.returnDate.getTime() - d.pickupDate.getTime() <=
        MAX_RENTAL_DAYS * DAY_MS,
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

export const updateReservationStatusSchema = z.object({
  status: z.enum(ReservationStatus),
});

/**
 * Extending only ever moves the return date later; the service enforces
 * that, along with availability and the registration ceiling. No past-date
 * rule here — an ACTIVE rental's pickup is by definition already behind us.
 */
export const extendReservationSchema = z.object({
  returnDate: z.coerce.date(),
});

/**
 * Admin "book on the phone" flow. Unlike the public form, staff choose the
 * initial request status and identify the customer by name only. An active
 * rental must go through the pickup inspection, so it cannot be created
 * directly from the calendar.
 */
export const manualReservationSchema = withValidRange(
  z.object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    customerName: z.string().trim().min(2, "Customer name is required").max(80),
    ...dateRange,
    status: z.enum(["PENDING", "CONFIRMED"]),
    notes: z.string().trim().max(1000).optional(),
  })
);

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ManualReservationInput = z.infer<typeof manualReservationSchema>;
