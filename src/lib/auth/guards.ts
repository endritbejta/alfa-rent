/**
 * Server-side authorization guards for server actions and route handlers.
 * UI hiding is not access control — every mutation must call one of these
 * regardless of what the client renders. Thrown errors map to 401/403
 * through normalizeError.
 */
import { cache } from "react";
import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * Memoised per request, not across requests. The layout and the page each
 * call this, and several actions call it through requireRole, so the lookup
 * below was running two or three times to answer the same question about the
 * same request.
 *
 * React's cache() resets on every request, so the revalidation this exists
 * for still happens on the very next one — a deactivated user is still locked
 * out immediately. Outside a render it does not memoise at all, which only
 * means no saving, never a stale answer.
 */
export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError();

  // Proxy performs only the fast optimistic JWT check. Every protected
  // server read/action revalidates the user so deactivation, deletion, role
  // changes and session-version bumps take effect immediately.
  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      sessionVersion: true,
    },
  });
  if (
    !current?.active ||
    current.sessionVersion !== session.user.sessionVersion
  ) {
    throw new UnauthorizedError("Session is no longer valid");
  }
  return current;
});

/** ADMIN passes every role check; EMPLOYEE only its own. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== role) {
    throw new ForbiddenError();
  }
  return user;
}
