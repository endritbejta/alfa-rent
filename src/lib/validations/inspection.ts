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
