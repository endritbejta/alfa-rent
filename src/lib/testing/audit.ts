import { prisma } from "@/lib/db/prisma";

/**
 * Integration-test helpers for the audit trail.
 *
 * Every staff write now records who did it, and `actorId` is a real foreign
 * key, so a test that drives a write needs a real user to stand behind it.
 * These make one and take it (and everything it recorded) away again, in the
 * create-and-delete-your-own-rows style the other integration tests follow.
 */
export async function createTestActor(label: string): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const user = await prisma.user.create({
    data: {
      name: `Test actor ${label}`,
      email: `actor-${label}-${suffix}@integration.test`,
      // Not a bcrypt hash, so nothing can ever sign in as this.
      password: "!",
      active: false,
    },
    select: { id: true },
  });
  return user.id;
}

/**
 * Deletes audit events, which the append-only trigger otherwise refuses.
 *
 * Only for tests and local clean-up. It disables the trigger for the length
 * of one transaction, which takes an exclusive lock and is DDL: exactly the
 * deliberate, visible step the migration says tampering requires.
 */
export async function purgeAuditEvents(where: {
  actorIds?: string[];
  entityIds?: string[];
}): Promise<void> {
  const or = [
    ...(where.actorIds?.length ? [{ actorId: { in: where.actorIds } }] : []),
    ...(where.entityIds?.length ? [{ entityId: { in: where.entityIds } }] : []),
  ];
  if (or.length === 0) return;
  await prisma.$transaction([
    prisma.$executeRaw`ALTER TABLE audit_events DISABLE TRIGGER audit_events_append_only`,
    prisma.auditEvent.deleteMany({ where: { OR: or } }),
    prisma.$executeRaw`ALTER TABLE audit_events ENABLE TRIGGER audit_events_append_only`,
  ]);
}

/** Removes a test actor and every event it recorded. */
export async function removeTestActor(id: string | undefined): Promise<void> {
  if (!id) return;
  await purgeAuditEvents({ actorIds: [id] });
  await prisma.user.deleteMany({ where: { id } });
}
