import { z } from "zod";

export const MAX_INSPECTION_PHOTOS = 6;
export const inspectionTypeSchema = z.enum(["PICKUP", "RETURN"]);

export const inspectionPhotoReceiptSchema = z.object({
  publicId: z.string().min(1).max(300),
  version: z.number().int().positive(),
  signature: z.string().min(1).max(200),
});

export const rentalInspectionSchema = z
  .object({
    type: inspectionTypeSchema,
    mileage: z.coerce
      .number()
      .int("Mileage must be a whole number")
      .min(0)
      .max(2_000_000),
    fuelLevel: z.coerce.number().int().min(0).max(100),
    exteriorNotes: z.string().trim().max(1000).optional(),
    interiorNotes: z.string().trim().max(1000).optional(),
    damageFound: z.coerce.boolean(),
    damageNotes: z.string().trim().max(1500).optional(),
    signerName: z.string().trim().min(2).max(100),
    customerAcknowledged: z.literal(true, {
      error: "Customer acknowledgement is required",
    }),
    photos: z.array(inspectionPhotoReceiptSchema).max(MAX_INSPECTION_PHOTOS),
    /**
     * Ticked by staff when the pickup day has already passed: a handover
     * recorded late must be a deliberate act, not a stray click.
     */
    lateStartConfirmed: z.boolean().optional(),
    /**
     * The business day the handover or return actually happened, when it is
     * recorded after the fact. The service bounds it: never in the future,
     * never before the pickup day (or, for a return, the handover).
     */
    occurredOn: z.iso.date().optional(),
  })
  .superRefine((input, context) => {
    if (input.damageFound && !input.damageNotes) {
      context.addIssue({
        code: "custom",
        path: ["damageNotes"],
        message: "Describe the damage that was found",
      });
    }
  });

export type RentalInspectionInput = z.infer<typeof rentalInspectionSchema>;

/**
 * A rental recorded after the fact in one step: the days it went out and
 * came back, and why there are no inspections. No mileage and no photos —
 * nobody has a three-week-old odometer reading — so the reason is required
 * instead, and the confirmation says this is being entered late.
 */
export const pastRentalSchema = z.object({
  startedOn: z.iso.date(),
  returnedOn: z.iso.date(),
  note: z.string().trim().min(5).max(500),
  confirmed: z.literal(true),
});

export type PastRentalInput = z.infer<typeof pastRentalSchema>;

export function parseInspectionPhotos(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Malformed inspection photo payload");
  }
  return z
    .array(inspectionPhotoReceiptSchema)
    .max(MAX_INSPECTION_PHOTOS)
    .parse(decoded);
}
