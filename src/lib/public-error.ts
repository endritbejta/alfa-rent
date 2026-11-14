import type { ApiErrorCode } from "@/lib/api-error-codes";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * What the storefront tells a customer when the booking or availability API
 * refuses a request, in the language they are reading (audit P3-4).
 *
 * The API answers in English by design — logs and API callers read that —
 * and the booking form used to show its message word for word, so a
 * customer reading Albanian got "vehicleId: Too small: expected string to
 * have >=1 characters". This reads only the machine-readable parts of the
 * error (`code`, `reason`, `field`, numeric `params`) and never the message,
 * so an error this table does not know becomes the generic sentence rather
 * than English text.
 *
 * Client-safe: no Prisma, no server-only imports.
 */

/** A form field the booking form can mark, by its react-hook-form name. */
export type BookingField =
  "from" | "to" | "firstName" | "lastName" | "email" | "phone";

export type PublicErrorText = {
  key: TranslationKey;
  values?: Record<string, number>;
  /** Set when the message belongs under one field of the booking form. */
  field?: BookingField;
};

const GENERIC: PublicErrorText = { key: "publicError.generic" };

/**
 * One sentence per code, for when nothing more specific is known. A Record
 * over every code, so adding a code to lib/api-error-codes.ts without
 * deciding what a customer reads is a type error.
 */
export const CODE_MESSAGES = {
  VALIDATION_ERROR: "publicError.invalid",
  NOT_FOUND: "publicError.vehicleGone",
  CONFLICT: "publicError.conflict",
  // Never sent to the storefront's routes; a session-free caller has no
  // session to renew, so the generic sentence is the honest one.
  UNAUTHORIZED: "publicError.generic",
  // The cross-site refusal (lib/api.ts) and the 415 for a non-JSON body:
  // the storefront's own fetch never trips either, so a customer who sees
  // one has an extension or proxy in the way, and a reload is the fix.
  FORBIDDEN: "publicError.blocked",
  UNSUPPORTED_MEDIA_TYPE: "publicError.blocked",
  RATE_LIMITED: "publicError.rateLimited",
  IDEMPOTENCY_KEY_REUSED: "err.idempotencyKeyReused",
  SERVICE_UNAVAILABLE: "publicError.unavailable",
  INTERNAL_ERROR: "publicError.generic",
} as const satisfies Record<ApiErrorCode, TranslationKey>;

/**
 * The refusals one code covers more than one of, by the `reason` the API
 * gives (an ErrorText key without its `err.` prefix). Only those the public
 * booking path can raise; any other reason falls back to its code.
 */
export const REASON_MESSAGES = {
  alreadyBooked: "publicError.alreadyBooked",
  notBookable: "publicError.notBookable",
  // Already written for customers, with the cap in {count}.
  pendingLimitContact: "err.pendingLimitContact",
  pendingLimitVehicle: "err.pendingLimitVehicle",
} as const satisfies Record<string, TranslationKey>;

/** The date rules in validations/reservation.ts, by their params.reason. */
export const DATE_RULE_MESSAGES = {
  returnBeforePickup: { key: "booking.rangeError", field: "to" },
  pickupInPast: { key: "publicError.pickupInPast", field: "from" },
  pickupTooFar: { key: "publicError.pickupTooFar", field: "from" },
  rentalTooLong: { key: "publicError.rentalTooLong", field: "to" },
} as const satisfies Record<
  string,
  { key: TranslationKey; field: BookingField }
>;

/**
 * Any other validation failure, by the input path the API names. The form
 * checks the same rules before sending, so these are reached only when the
 * two disagree, but each still lands under its own field.
 */
export const FIELD_MESSAGES = {
  "customer.firstName": { key: "booking.required", field: "firstName" },
  "customer.lastName": { key: "booking.required", field: "lastName" },
  "customer.email": { key: "booking.validEmail", field: "email" },
  "customer.phone": { key: "booking.validPhone", field: "phone" },
  pickupDate: { key: "publicError.dateInvalid", field: "from" },
  returnDate: { key: "publicError.dateInvalid", field: "to" },
} as const satisfies Record<
  string,
  { key: TranslationKey; field: BookingField }
>;

/** Paths with no field of their own on the form, said in a summary. */
const SUMMARY_FIELDS: Record<string, TranslationKey> = {
  vehicleId: "publicError.vehicleInvalid",
};

const own = <T extends object>(table: T, key: unknown): key is keyof T =>
  typeof key === "string" && Object.hasOwn(table, key);

function numbers(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1])
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * The translated message for an API error body's `error` (or anything at
 * all: a malformed body is the generic sentence).
 */
export function publicErrorText(error: unknown): PublicErrorText {
  if (!error || typeof error !== "object") return GENERIC;
  const { code, reason, field, params } = error as Record<string, unknown>;
  const values = numbers(params);

  if (code === "VALIDATION_ERROR") {
    if (own(DATE_RULE_MESSAGES, reason)) {
      return { ...DATE_RULE_MESSAGES[reason], values };
    }
    if (own(FIELD_MESSAGES, field)) {
      const rule = FIELD_MESSAGES[field];
      // A name past the 50-character limit is not "required".
      if (
        reason === "too_big" &&
        (rule.field === "firstName" || rule.field === "lastName")
      ) {
        return { key: "publicError.nameTooLong", field: rule.field };
      }
      return { ...rule };
    }
    if (own(SUMMARY_FIELDS, field)) return { key: SUMMARY_FIELDS[field] };
    return { key: CODE_MESSAGES.VALIDATION_ERROR };
  }

  if (own(REASON_MESSAGES, reason)) {
    return { key: REASON_MESSAGES[reason], values };
  }
  if (own(CODE_MESSAGES, code)) return { key: CODE_MESSAGES[code] };
  return GENERIC;
}
