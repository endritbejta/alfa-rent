import { z } from "zod";

export const repairSchema = z.object({
  date: z.coerce.date(),
  cost: z.coerce
    .number()
    .positive("Cost must be greater than zero")
    .max(100000),
  description: z.string().trim().min(3, "Describe the repair").max(200),
  notes: z.string().trim().max(1000).optional(),
  reference: z.string().trim().max(60).optional(),
});

export type RepairInput = z.infer<typeof repairSchema>;

/**
 * The form field names this panel posts, in one place.
 *
 * They are `repair-` prefixed because RepairsPanel renders inside
 * VehicleForm's `<form>` — HTML forbids nesting a second one — so an
 * unprefixed `description` was a second field of that name in a single form,
 * and only DOM order decided which value a vehicle save read. The ids were
 * duplicated too, which pointed the panel's own `<label>` at the vehicle's
 * textarea.
 *
 * Keeping the names here rather than inline in the action means the markup and
 * the reader cannot drift apart silently, the way they could when the same
 * contract was written out in three separate files.
 */
export const REPAIR_FIELD_NAMES = {
  date: "repair-date",
  cost: "repair-cost",
  description: "repair-description",
  notes: "repair-notes",
  reference: "repair-reference",
} as const satisfies Record<keyof RepairInput, string>;

/** Reads a repair out of the vehicle form's FormData and validates it. */
export function parseRepairFields(formData: FormData): RepairInput {
  const value = (key: keyof typeof REPAIR_FIELD_NAMES) =>
    formData.get(REPAIR_FIELD_NAMES[key]);

  return repairSchema.parse({
    date: value("date"),
    cost: value("cost"),
    description: value("description"),
    notes: value("notes") || undefined,
    reference: value("reference") || undefined,
  });
}
