import { z } from "zod";
import { ReservationStatus } from "@prisma/client";

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
    .refine((d) => d.pickupDate.getTime() > Date.now() - 24 * 60 * 60 * 1000, {
      message: "Pickup date cannot be in the past",
      path: ["pickupDate"],
    });

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
 * Admin "book on the phone" flow. Unlike the public form, staff choose the
 * initial status directly and identify the customer by name only; the
 * past-date restriction is dropped so a walk-in that already started can be
 * logged as ACTIVE.
 */
export const manualReservationSchema = z
  .object({
    vehicleId: z.string().min(1, "Choose a vehicle"),
    customerName: z.string().trim().min(2, "Customer name is required").max(80),
    ...dateRange,
    status: z.enum(["PENDING", "CONFIRMED", "ACTIVE"]),
    notes: z.string().trim().max(1000).optional(),
  })
  .refine((d) => d.returnDate > d.pickupDate, {
    message: "Return date must be after pickup date",
    path: ["returnDate"],
  });

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ManualReservationInput = z.infer<typeof manualReservationSchema>;
