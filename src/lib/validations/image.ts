import { z } from "zod";

/** Mirrors MAX_FILES in image.service.ts. */
export const MAX_VEHICLE_IMAGES = 8;

/**
 * One entry in the media grid, in display order.
 *
 * The grid submits the whole ordered list on save, so a single payload
 * expresses add, remove and reorder together — a saved image the operator
 * dropped is simply absent. Existing images arrive by id; freshly uploaded
 * ones carry the Cloudinary receipt, which the service verifies before
 * trusting it.
 */
const keptImage = z.object({
  kind: z.literal("existing"),
  id: z.string().min(1),
});

const uploadedImage = z.object({
  kind: z.literal("uploaded"),
  publicId: z.string().min(1).max(300),
  version: z.number().int().positive(),
  signature: z.string().min(1).max(200),
});

export const vehicleImageItemSchema = z.discriminatedUnion("kind", [
  keptImage,
  uploadedImage,
]);

export const vehicleImagesSchema = z
  .array(vehicleImageItemSchema)
  .max(MAX_VEHICLE_IMAGES, `At most ${MAX_VEHICLE_IMAGES} images per vehicle`);

export type VehicleImageItem = z.infer<typeof vehicleImageItemSchema>;

/** The grid posts JSON through a hidden field; parse defensively. */
export function parseVehicleImagesField(raw: FormDataEntryValue | null) {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error("Malformed image payload");
  }
  return vehicleImagesSchema.parse(decoded);
}
