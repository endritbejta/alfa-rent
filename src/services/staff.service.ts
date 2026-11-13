import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_CHARACTERS,
  PASSWORD_PROBLEM_TEXT,
  passwordProblem,
} from "@/lib/password-policy";
import { recordAudit, type AuditAction, type AuditFields } from "@/lib/audit";

/**
 * The staff account lifecycle: adding people, changing what they may do,
 * locking them out, and passwords. Until this existed the only code that
 * wrote `users` was the destructive seed, so every one of these was a
 * hand-written UPDATE against production (audit finding P1-1).
 *
 * Revocation rides on `sessionVersion`. Every session carries the version it
 * was issued under and requireUser compares it on every request, so
 * incrementing it ends all of that person's sessions at their next click.
 * Deactivating, resetting a password and "sign out everywhere" all do it.
 *
 * Callers authorize; this module enforces the rules that hold whoever calls
 * it.
 */

/** The seed's cost. Each step doubles both a guess's price and a sign-in's. */
const BCRYPT_COST = 12;

/**
 * Every read that hands staff to someone selects these and nothing else. The
 * password hash never leaves this module: not to a page, not to an action's
 * return value.
 */
const STAFF_COLUMNS = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type StaffMember = Prisma.UserGetPayload<{
  select: typeof STAFF_COLUMNS;
}>;

/** Active people first, admins before employees, then by name. */
export function listStaff(): Promise<StaffMember[]> {
  return prisma.user.findMany({
    select: STAFF_COLUMNS,
    orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }],
  });
}

export async function createStaff(
  actorId: string,
  input: {
    name: string;
    email: string;
    role: Role;
    temporaryPassword: string;
  }
): Promise<StaffMember> {
  assertPasswordPolicy(input.temporaryPassword);
  const email = input.email.trim().toLowerCase();

  // Case-insensitive so that a legacy row stored with capitals still counts.
  // The unique index is what holds if two admins add the same address at the
  // same moment; this is only the early, readable answer.
  const taken = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw emailTaken();

  const password = await bcrypt.hash(input.temporaryPassword, BCRYPT_COST);
  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name.trim(),
          email,
          role: input.role,
          password,
          // The admin chose this password and knows it.
          mustChangePassword: true,
        },
        select: STAFF_COLUMNS,
      });
      // Never the temporary password, nor its hash.
      await recordAudit(tx, {
        actorId,
        action: "staff.create",
        entityId: created.id,
        after: { name: created.name, email, role: created.role },
      });
      return created;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw emailTaken();
    }
    throw error;
  }
}

/**
 * Promoting needs no lock: it can only add an admin. Demoting can remove the
 * last one, so it goes through the same lock and count as deactivating.
 *
 * Sessions are left alone. requireUser reads the role from the database on
 * every request, so a demotion takes effect at the next click without
 * signing anyone out.
 */
export async function changeStaffRole(
  actorId: string,
  userId: string,
  role: Role
): Promise<void> {
  if (role === "ADMIN") {
    await updateStaff(actorId, userId, "staff.changeRole", { role }, (was) => ({
      before: { role: was.role },
      after: { role },
    }));
    return;
  }
  if (actorId === userId) {
    throw new ConflictError("An admin cannot remove their own admin role", {
      key: "err.cannotDemoteSelf",
    });
  }
  await withLastAdminLock(async (tx) => {
    const was = await assertNotLastActiveAdmin(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    await recordAudit(tx, {
      actorId,
      action: "staff.changeRole",
      entityId: userId,
      before: { role: was.role },
      after: { role },
    });
  });
}

export async function deactivateStaff(
  actorId: string,
  userId: string
): Promise<void> {
  if (actorId === userId) {
    throw new ConflictError("An admin cannot deactivate their own account", {
      key: "err.cannotDeactivateSelf",
    });
  }
  await withLastAdminLock(async (tx) => {
    const was = await assertNotLastActiveAdmin(tx, userId);
    await tx.user.update({
      where: { id: userId },
      // Sign-in already refuses an inactive account; this ends the sessions
      // that are open right now.
      data: { active: false, sessionVersion: { increment: 1 } },
    });
    await recordAudit(tx, {
      actorId,
      action: "staff.deactivate",
      entityId: userId,
      before: { active: was.active },
      after: { active: false },
    });
  });
}

/**
 * Incremented here as well, although deactivation already did. An account
 * switched off by hand in SQL, as every one was before this page, kept its
 * version, so turning it back on would otherwise bring its old sessions back
 * to life.
 */
export async function reactivateStaff(
  actorId: string,
  userId: string
): Promise<void> {
  await updateStaff(
    actorId,
    userId,
    "staff.reactivate",
    { active: true, sessionVersion: { increment: 1 } },
    (was) => ({ before: { active: was.active }, after: { active: true } })
  );
}

/**
 * Not checked against the current password, unlike changeOwnPassword. The
 * admin never learns it, and refusing a "reset" to the same value would tell
 * them they had just guessed it, which is an oracle for a password the
 * employee may use elsewhere.
 */
export async function resetStaffPassword(
  actorId: string,
  userId: string,
  temporaryPassword: string
): Promise<void> {
  if (actorId === userId) {
    // Your own password goes through /account/password, which asks for the
    // current one. A reset from here would skip that check.
    throw new ConflictError("Change your own password from your account", {
      key: "err.resetOwnPassword",
    });
  }
  assertPasswordPolicy(temporaryPassword);
  const password = await bcrypt.hash(temporaryPassword, BCRYPT_COST);
  // The fact only: no password, no hash.
  await updateStaff(actorId, userId, "staff.resetPassword", {
    password,
    mustChangePassword: true,
    sessionVersion: { increment: 1 },
  });
}

/** For a lost phone, or a counter PC someone left signed in. */
export async function signOutStaffEverywhere(
  actorId: string,
  userId: string
): Promise<void> {
  await updateStaff(actorId, userId, "staff.signOutEverywhere", {
    sessionVersion: { increment: 1 },
  });
}

/**
 * The one way staff change their own password, and the way out of a
 * temporary one.
 *
 * The write is conditional on the hash it verified against, so an admin's
 * reset landing between the check and the write is not silently overwritten
 * by a password the admin knows nothing about.
 */
export async function changeOwnPassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  assertPasswordPolicy(newPassword);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true, active: true },
  });
  if (!user?.active) throw new UnauthorizedError();

  if (!(await bcrypt.compare(currentPassword, user.password))) {
    throw new ValidationError("The current password is not correct", {
      key: "err.currentPasswordWrong",
    });
  }
  // Against the hash rather than the string just typed, so it means what
  // bcrypt means by "the same password".
  if (await bcrypt.compare(newPassword, user.password)) {
    throw new ValidationError(
      "The new password must differ from the current one",
      { key: "err.passwordUnchanged" }
    );
  }

  const password = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, password: user.password, active: true },
      data: {
        password,
        mustChangePassword: false,
        // Ends every other session too. Whoever was signed in as this person
        // somewhere else no longer is.
        sessionVersion: { increment: 1 },
      },
    });
    if (count === 0) {
      throw new ConflictError("The password changed while this was open", {
        key: "err.passwordChangedElsewhere",
      });
    }
    // The fact only. A wrong current password is refused above and records
    // nothing: the rate limiter, not the audit trail, deals with guessing.
    await recordAudit(tx, {
      actorId: userId,
      action: "staff.changeOwnPassword",
      entityId: userId,
    });
  });
}

const PASSWORD_PROBLEM_LOG = {
  tooShort: `Passwords need at least ${PASSWORD_MIN_CHARACTERS} characters`,
  tooLong: `Passwords can be at most ${PASSWORD_MAX_BYTES} bytes`,
} as const;

function assertPasswordPolicy(password: string): void {
  const problem = passwordProblem(password);
  if (problem) {
    throw new ValidationError(
      PASSWORD_PROBLEM_LOG[problem],
      PASSWORD_PROBLEM_TEXT[problem]
    );
  }
}

function emailTaken() {
  return new ConflictError("Another staff account already uses this email", {
    key: "err.staffEmailTaken",
  });
}

/**
 * One change to one account and its audit event, together.
 *
 * `describe` turns the row as it was into the event's before/after; without
 * it the event records only that the action happened, which is all a
 * password reset or a sign-out should say.
 */
async function updateStaff(
  actorId: string,
  userId: string,
  action: AuditAction,
  data: Prisma.UserUpdateManyMutationInput,
  describe?: (was: { role: Role; active: boolean }) => {
    before: AuditFields;
    after: AuditFields;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const was = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, active: true },
    });
    if (!was) throw new NotFoundError("Staff");
    // updateMany for the count, so a stale id says "staff account", not
    // "record", even if the row vanished since the read.
    const { count } = await tx.user.updateMany({
      where: { id: userId },
      data,
    });
    if (count === 0) throw new NotFoundError("Staff");
    await recordAudit(tx, {
      actorId,
      action,
      entityId: userId,
      ...describe?.(was),
    });
  });
}

/**
 * Serialises every change that could leave the business with no active
 * admin, and with it nobody able to reach this page.
 *
 * Two admins demoting each other at the same moment would each count the
 * other as the admin who remains, and both would succeed. Under this lock the
 * second one counts again only after the first has committed, sees nobody
 * left, and is refused.
 *
 * A transaction-scoped advisory lock rather than SERIALIZABLE: there is no
 * retry loop to write, and Postgres releases it at commit or rollback
 * whatever happens in between.
 */
const LAST_ADMIN_LOCK = "alfa-rent:staff:last-active-admin";

function withLastAdminLock(
  run: (tx: Prisma.TransactionClient) => Promise<void>
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    // $executeRaw rather than $queryRaw: the function returns void, which
    // Prisma cannot deserialise as a column.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${LAST_ADMIN_LOCK}))`;
    await run(tx);
  });
}

/** Call only while holding LAST_ADMIN_LOCK, or the count can be stale. */
async function assertNotLastActiveAdmin(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<{ role: Role; active: boolean }> {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (!target) throw new NotFoundError("Staff");
  if (target.role !== "ADMIN" || !target.active) return target;

  const otherActiveAdmins = await tx.user.count({
    where: { role: "ADMIN", active: true, id: { not: userId } },
  });
  if (otherActiveAdmins === 0) {
    throw new ConflictError("At least one active admin must remain", {
      key: "err.lastActiveAdmin",
    });
  }
  return target;
}
