import { NextResponse } from "next/server";
import {
  ForbiddenError,
  normalizeError,
  TooManyRequestsError,
  UnsupportedMediaTypeError,
} from "@/lib/errors";
import type { ApiSuccess } from "@/types/api";

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

/**
 * Refuses a public write that a browser could have been made to send from
 * another site.
 *
 * `request.json()` parses a body whatever its Content-Type. A `text/plain`
 * POST, which browsers send cross-origin with no preflight, was therefore
 * processed in full: any web page could make each of its visitors file a
 * booking request, every one under that visitor's own IP and so its own
 * rate-limit bucket.
 *
 * Either check alone stops that in current browsers:
 * - `Sec-Fetch-Site: cross-site` is refused outright. Same-origin and
 *   same-site requests pass, as do clients that send no such header (curl,
 *   server-to-server).
 * - The body must be declared as JSON. That makes a cross-origin request
 *   preflighted, and the preflight fails because no CORS headers are sent.
 *
 * Call it first, before the rate limiter or anything else that writes, so a
 * refused request costs nothing and spends nobody's quota.
 */
export function assertSameSiteJson(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ForbiddenError("Cross-site requests are not accepted");
  }
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    throw new UnsupportedMediaTypeError();
  }
}

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
