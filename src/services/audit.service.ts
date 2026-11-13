import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  PERSONAL_DATA_KEYS,
  type AuditAction,
  type AuditEntity,
  type AuditFields,
} from "@/lib/audit";

/**
 * Reading and erasing the audit trail. Writing it is `recordAudit` in
 * `@/lib/audit`, which every service calls inside its own transaction.
 */

export type AuditActor =
  | { kind: "staff"; name: string }
  /** The account that did it has since been removed. */
  | { kind: "removed" }
  | { kind: "system" };

export type AuditHistoryItem = {
  id: string;
  action: AuditAction;
  actor: AuditActor;
  before: AuditFields | null;
  after: AuditFields | null;
  reason: string | null;
  createdAt: Date;
};

/** Enough for any drawer; a record with a longer history is an outlier. */
const HISTORY_LIMIT = 50;

/** One record's history, newest first. */
export async function getAuditHistory(
  entity: AuditEntity,
  entityId: string
): Promise<AuditHistoryItem[]> {
  const rows = await prisma.auditEvent.findMany({
    where: { entity, entityId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: {
      id: true,
      action: true,
      system: true,
      before: true,
      after: true,
      reason: true,
      createdAt: true,
      actor: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action as AuditAction,
    actor: row.actor
      ? { kind: "staff", name: row.actor.name }
      : row.system
        ? { kind: "system" }
        : { kind: "removed" },
    before: (row.before as AuditFields | null) ?? null,
    after: (row.after as AuditFields | null) ?? null,
    reason: row.reason,
    createdAt: row.createdAt,
  }));
}

/**
 * Every customer id whose history now belongs to `customerId`: itself, and
 * every record merged into it, transitively (a record merged into one that
 * was later merged again). Their events still carry that person's details.
 */
async function mergedCustomerIds(
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<string[]> {
  const ids = new Set([customerId]);
  let frontier = [customerId];
  while (frontier.length > 0) {
    const merges = await tx.auditEvent.findMany({
      where: {
        action: "customer.merge",
        entity: "customer",
        entityId: { in: frontier },
      },
      select: { after: true },
    });
    frontier = [];
    for (const merge of merges) {
      const mergedIds = (merge.after as { mergedIds?: unknown } | null)
        ?.mergedIds;
      if (!Array.isArray(mergedIds)) continue;
      for (const id of mergedIds) {
        if (typeof id === "string" && !ids.has(id)) {
          ids.add(id);
          frontier.push(id);
        }
      }
    }
  }
  return [...ids];
}

/**
 * Erases a customer's personal data from the audit trail, as part of
 * anonymising them. Without this the log would quietly undo the erasure: an
 * old `customer.update` still says what their phone number was.
 *
 * Strips PERSONAL_DATA_KEYS from `before` / `after` of every event about the
 * customer (and records merged into them) and about their reservations, and
 * clears those events' reasons: free text staff typed, which may name them,
 * exactly like the reservation notes anonymising already clears. Who did
 * what, and when, survives.
 *
 * Must run in the anonymising transaction. The append-only trigger allows
 * this only while `alfa_rent.audit_scrub` is set, and only as a removal.
 */
export async function scrubCustomerAuditEvents(
  tx: Prisma.TransactionClient,
  customerId: string
): Promise<number> {
  const customerIds = await mergedCustomerIds(tx, customerId);
  const reservations = await tx.reservation.findMany({
    where: { customerId },
    select: { id: true },
  });
  const reservationIds = reservations.map((r) => r.id);
  const keys = [...PERSONAL_DATA_KEYS];

  // Transaction-local: it ends at commit or rollback whatever happens.
  await tx.$executeRaw`SELECT set_config('alfa_rent.audit_scrub', 'on', true)`;
  const scrubbed = await tx.$executeRaw`
    UPDATE audit_events SET
      "before" = NULLIF("before" - ${keys}::text[], '{}'::jsonb),
      "after"  = NULLIF("after"  - ${keys}::text[], '{}'::jsonb),
      "reason" = NULL
    WHERE (entity = 'customer' AND "entityId" = ANY(${customerIds}::text[]))
       OR (entity = 'reservation' AND "entityId" = ANY(${reservationIds}::text[]))
  `;
  await tx.$executeRaw`SELECT set_config('alfa_rent.audit_scrub', 'off', true)`;
  return scrubbed;
}
