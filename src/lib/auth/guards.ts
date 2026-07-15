import type { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
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
  return session.user;
}

/** ADMIN passes every role check; EMPLOYEE only its own. */
export async function requireRole(role: Role) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== role) {
    throw new ForbiddenError();
  }
  return user;
}
