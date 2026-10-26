import { z } from "zod";

/**
 * Staff-edited customer details. The same limits the public booking form
 * applies, so a record edited here is never one the storefront would refuse.
 *
 * `notes` is nullish and lands as `null` when cleared: Prisma reads
 * `undefined` in an update as "leave unchanged", which would make clearing a
 * note silently do nothing.
 */
export const customerSchema = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  // Lower-cased like findOrCreateCustomerByEmail, so the unique index sees
  // one address however staff typed it.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().min(6).max(25),
  notes: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => v || null),
});

export type CustomerFormInput = z.infer<typeof customerSchema>;

export const customerSearchSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .catch(undefined);

export const mergeCustomersSchema = z
  .object({
    keepId: z.string().min(1),
    mergeIds: z.array(z.string().min(1)).min(1).max(20),
  })
  .refine((v) => !v.mergeIds.includes(v.keepId), {
    message: "The record you keep cannot also be merged away",
    path: ["mergeIds"],
  });

export type MergeCustomersInput = z.infer<typeof mergeCustomersSchema>;

/**
 * Placeholder contact details the old walk-in flow wrote. A merge or an edit
 * prefers any real value over these.
 */
export const WALK_IN_EMAIL = /^walkin\..+@alfarent\.local$/;
export const MISSING_PHONE = "-";

/**
 * The national number, so "+383 44 123 456", "00383 44 123 456" and
 * "044 123 456" compare equal: digits only, without the international prefix,
 * Kosovo's country code or the trunk zero. Mirrored in SQL by
 * NORMALIZED_PHONE_SQL in customer.service.ts; keep the two in step.
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^(00)?(383)?0*/, "");
}

/** A query that is plausibly a phone number rather than a name with digits. */
export function looksLikePhone(query: string): boolean {
  return /^[\d\s+()./-]+$/.test(query) && normalizePhone(query).length >= 4;
}
