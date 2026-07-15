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

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
