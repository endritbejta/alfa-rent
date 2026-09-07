import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(12),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/**
 * Reads `?page` from a URL without throwing.
 *
 * A hand-edited or stale link — `?page=0`, `?page=abc`, a truncated one — used
 * to throw a ZodError out of a server component, which the route error
 * boundary rendered as the generic "something went wrong" card. An unreadable
 * page number should land you on page 1, not on a crash screen.
 *
 * This mirrors the per-field `.catch()` on adminVehicleFilterSchema and its
 * stated reason. It is a separate helper rather than a `.catch()` on the
 * schema above so that `GET /api/vehicles`, which parses the same shape, keeps
 * rejecting a malformed request instead of silently serving page 1.
 */
export function parsePageParam(raw: unknown): number {
  return z.coerce.number().int().min(1).catch(1).parse(raw);
}
