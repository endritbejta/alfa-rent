import { NextResponse } from "next/server";
import { normalizeError, TooManyRequestsError } from "@/lib/errors";
import type { ApiSuccess } from "@/types/api";

export function ok<T>(
  data: T,
  init?: ResponseInit
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ success: true as const, data }, init);
}

/**
 * Wrap a route handler so every thrown error — Zod, Prisma, AppError —
 * becomes a consistent { success: false, error } response with the right
 * HTTP status. Route handlers stay thin: parse, call service, return ok().
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const { status, body } = normalizeError(error);
      // A 429 without Retry-After tells a client nothing about when to
      // come back, so well-behaved ones hammer anyway.
      const headers =
        error instanceof TooManyRequestsError
          ? { "Retry-After": String(error.retryAfter) }
          : undefined;
      return NextResponse.json(body, { status, headers });
    }
  };
}
