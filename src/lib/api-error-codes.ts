/**
 * Every `code` an API error response can carry.
 *
 * Kept apart from lib/errors.ts, which pulls in Prisma and the error
 * reporter, so the storefront's client code can import the list: it
 * translates each code into the customer's language (lib/public-error.ts),
 * and a code missing from its table is a type error rather than an English
 * sentence on screen.
 */
export const API_ERROR_CODES = [
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "IDEMPOTENCY_KEY_REUSED",
  "UNSUPPORTED_MEDIA_TYPE",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_ERROR",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];
