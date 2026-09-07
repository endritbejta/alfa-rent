import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { ApiFailure } from "@/types/api";
import { reportError } from "@/lib/observability";
import type { TranslationKey } from "@/lib/i18n/translations";

/**
 * A value to interpolate into an error message. Wrap it in `phrase()` when it
 * is itself something the app translates — a status, a category — so it comes
 * out in the reader's language rather than as PENDING or SEDAN.
 */
export type ErrorValue = string | number | { key: TranslationKey };

export const phrase = (key: TranslationKey): ErrorValue => ({ key });

/**
 * What an error says, in a form that can be said in either language.
 *
 * The service layer has no locale — it runs before anything knows who is
 * asking — so it names the message instead of writing it, and the boundary
 * that answers the request resolves it. Every message used to be an English
 * literal rendered verbatim, so an Albanian operator got
 * "Cannot change a COMPLETED reservation to CONFIRMED" in an otherwise fully
 * translated interface.
 *
 * The English sentence stays on the error as `message`: it is what the logs
 * and the public JSON API carry, and it is the fallback for the throw sites
 * that have not been given a key yet.
 */
export type ErrorText = {
  key: TranslationKey;
  values?: Record<string, ErrorValue>;
};

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    /** Names the message so it can be read in the operator's language. */
    public readonly text?: ErrorText
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, text?: ErrorText) {
    super(message, "VALIDATION_ERROR", 400, text);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, text?: ErrorText) {
    super(message, "CONFLICT", 409, text);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, "UNAUTHORIZED", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, "FORBIDDEN", 403);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message = "Too many requests. Please wait a moment and try again.",
    /** Seconds until the caller may retry — mirrored into Retry-After. */
    public readonly retryAfter = 60
  ) {
    super(message, "RATE_LIMITED", 429);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "This service is not available yet") {
    super(message, "SERVICE_UNAVAILABLE", 503);
  }
}

/**
 * Map any thrown value to a response-ready shape. The generic fallback
 * deliberately hides internals: raw error messages can leak schema or
 * infrastructure details.
 */
export function normalizeError(error: unknown): {
  status: number;
  body: ApiFailure;
} {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: {
        success: false,
        error: { message: error.message, code: error.code },
      },
    };
  }

  if (error instanceof ZodError) {
    const first = error.issues[0];
    const path = first?.path.join(".");
    return {
      status: 400,
      body: {
        success: false,
        error: {
          message: path
            ? `${path}: ${first.message}`
            : (first?.message ?? "Invalid input"),
          code: "VALIDATION_ERROR",
        },
      },
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return normalizeError(
        new ConflictError("A record with this value already exists")
      );
    }
    if (error.code === "P2025") {
      return normalizeError(new NotFoundError("Record"));
    }
    if (error.code === "P2003") {
      return normalizeError(
        new ConflictError("Operation violates a data relationship")
      );
    }
  }

  // The reservations_no_overlap exclusion constraint is raised by Postgres,
  // not modeled by Prisma, so it surfaces as an unknown request error.
  if (
    error instanceof Error &&
    error.message.includes("reservations_no_overlap")
  ) {
    return normalizeError(
      new ConflictError("Vehicle is already booked for the selected dates")
    );
  }

  reportError(error, { scope: "normalize-error" });
  return {
    status: 500,
    body: {
      success: false,
      error: {
        message: "An unexpected error occurred",
        code: "INTERNAL_ERROR",
      },
    },
  };
}
