import { Prisma } from "@prisma/client";

/**
 * The staff audit trail (audit finding P2-7): who did what, when, and why.
 *
 * Every staff write records exactly one event, through `recordAudit`, using
 * the transaction client of the change itself. That is the whole guarantee:
 * if the change rolls back the event goes with it, and an event can never
 * describe a change that did not commit. There is deliberately no
 * fire-and-forget variant that takes the global client.
 *
 * The table is append-only at the database level; see the migration
 * 20261113180000_audit_events.
 */

/**
 * Every action that is recorded, `<entity>.<verb>`. The entity is the part
 * before the dot, so the two can never disagree.
 */
export const AUDIT_ACTIONS = [
  "reservation.create",
  "reservation.confirm",
  "reservation.cancel",
  "reservation.extend",
  "reservation.start",
  "reservation.complete",
  "reservation.recordPast",
  "reservation.lateCharge",
  "reservation.lateWaive",
  "reservation.earlyReturn",
  "customer.update",
  "customer.merge",
  "customer.anonymise",
  "vehicle.create",
  "vehicle.update",
  "vehicle.retire",
  "vehicle.delete",
  "vehicle.addRepair",
  "vehicle.deleteRepair",
  "staff.create",
  "staff.changeRole",
  "staff.deactivate",
  "staff.reactivate",
  "staff.resetPassword",
  "staff.signOutEverywhere",
  "staff.changeOwnPassword",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditEntity = AuditAction extends `${infer E}.${string}`
  ? E
  : never;

export function auditEntity(action: AuditAction): AuditEntity {
  return action.slice(0, action.indexOf(".")) as AuditEntity;
}

/** What an event may carry: plain JSON, already normalised. */
export type AuditValue = string | number | boolean | null;
export type AuditFields = Record<string, AuditValue | AuditValue[]>;

/**
 * Keys that hold a customer's personal data (or free text staff typed about
 * them, which may). Anonymisation strips exactly these from every earlier
 * event about the customer and their reservations. A field added to an event
 * that can identify a customer belongs here, or erasing them leaves it behind.
 */
export const PERSONAL_DATA_KEYS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "notes",
  "backfillNote",
  "lateWaiverReason",
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactPhone",
  "signerName",
] as const;

/**
 * Never written to an event under any name. Checked at write time, so a
 * careless `after: input` cannot leak a hash into a log that outlives it.
 */
const FORBIDDEN_KEYS = new Set([
  "password",
  "passwordHash",
  "temporaryPassword",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "sessionVersion",
  "token",
  "accessToken",
  "idempotencyKey",
]);

/**
 * JSON-safe and comparable. Money stays a string so "60.00" is not rounded
 * through a float; dates become ISO instants.
 */
export function normaliseAuditValue(value: unknown): AuditValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) {
    return (value as Prisma.Decimal).toFixed(2);
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value);
}

/**
 * Only what changed, as `before` / `after` pairs.
 *
 * Compares the keys of `after`: a field the caller did not touch is not part
 * of the change, even if `before` happens to hold it. Returns null when
 * nothing changed, so a save that changes nothing records nothing.
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: AuditFields; after: AuditFields } | null {
  const was: AuditFields = {};
  const now: AuditFields = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue; // Prisma: "leave unchanged".
    const a = normaliseAuditValue(before[key]);
    // A form posts money as a number; the row holds a Decimal. Compared
    // as money, or every save would "change" 60 to "60.00".
    const b =
      Prisma.Decimal.isDecimal(before[key]) && typeof after[key] === "number"
        ? new Prisma.Decimal(after[key]).toFixed(2)
        : normaliseAuditValue(after[key]);
    if (a !== b) {
      was[key] = a;
      now[key] = b;
    }
  }
  return Object.keys(now).length > 0 ? { before: was, after: now } : null;
}

/** Normalises every value and drops undefined ones. */
export function auditFields(fields: Record<string, unknown>): AuditFields {
  const out: AuditFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value)
      ? value.map(normaliseAuditValue)
      : normaliseAuditValue(value);
  }
  return out;
}

export type AuditEventInput = {
  /** The staff member. Null only for a system event with no person behind it. */
  actorId: string | null;
  action: AuditAction;
  entityId: string;
  before?: AuditFields | null;
  after?: AuditFields | null;
  reason?: string | null;
};

function assertNoForbiddenKeys(fields: AuditFields | null | undefined) {
  for (const key of Object.keys(fields ?? {})) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new Error(`Audit events must not record "${key}"`);
    }
  }
}

function json(fields: AuditFields | null | undefined) {
  return fields && Object.keys(fields).length > 0
    ? (fields as Prisma.InputJsonObject)
    : Prisma.DbNull;
}

/**
 * Records one event inside the caller's transaction.
 *
 * Takes the transaction client, never the global one: the event must commit
 * or roll back with the change it describes.
 */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  event: AuditEventInput
): Promise<void> {
  assertNoForbiddenKeys(event.before);
  assertNoForbiddenKeys(event.after);
  const reason = event.reason?.trim();
  await tx.auditEvent.create({
    data: {
      actorId: event.actorId,
      system: event.actorId === null,
      action: event.action,
      entity: auditEntity(event.action),
      entityId: event.entityId,
      before: json(event.before),
      after: json(event.after),
      reason: reason || null,
    },
  });
}
