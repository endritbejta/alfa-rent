import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

/**
 * Server-side authorization guards for server actions and route handlers.
 * UI hiding is not access control — every mutation must call one of these
 * regardless of what the client renders. Thrown errors map to 401/403
 * through normalizeError.
 */
export async function requireUser() {
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
}

/** ADMIN passes every role check; EMPLOYEE only its own. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== role) {
    throw new ForbiddenError();
  }
  return user;
}
