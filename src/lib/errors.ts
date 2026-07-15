import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import type { ApiFailure } from "@/types/api";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR", 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
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

  console.error("Unhandled error:", error);
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
