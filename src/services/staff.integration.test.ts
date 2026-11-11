import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors";
import { verifyCredentials } from "@/services/user.service";
import {
  changeOwnPassword,
  changeStaffRole,
  createStaff,
  deactivateStaff,
  listStaff,
  reactivateStaff,
  resetStaffPassword,
  signOutStaffEverywhere,
} from "@/services/staff.service";

/**
 * The staff lifecycle against a real database: the rules that keep the
 * business from locking itself out, and the sessionVersion bumps that make
 * revoking access actually revoke it.
 *
 * Every row here carries the suffix in its id and email, and is deleted
 * afterwards.
 */
const suffix = randomUUID().slice(0, 8);
const id = (who: string) => `staff-${who}-${suffix}`;
const email = (who: string) => `staff-${who}-${suffix}@example.test`;

const PASSWORD = "integration passphrase";
const NEW_PASSWORD = "a brand new passphrase";
// Rows made here directly use a cheap hash so setup stays fast; everything
// the service hashes itself is checked for cost 12 below.
let hash: string;

beforeAll(async () => {
  hash = await bcrypt.hash(PASSWORD, 4);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: suffix } } });
  await prisma.$disconnect();
});

function seed(who: string, data: Partial<Prisma.UserCreateInput> = {}) {
  return prisma.user.create({
    data: {
      id: id(who),
      name: `Test ${who}`,
      email: email(who),
      password: hash,
      role: "EMPLOYEE",
      ...data,
    },
  });
}

const row = (who: string) =>
  prisma.user.findUniqueOrThrow({ where: { id: id(who) } });

/** Rejects with an AppError carrying this translation key. */
async function refusedWith(run: Promise<unknown>, key: string) {
  const error = await run.then(
    () => null,
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).text?.key).toBe(key);
}

/**
 * The last-admin rule counts every active admin in the database, and a local
 * database holds the seed's, so with them around it can never fire. Every
 * active admin but `keep` is set aside, deactivated, only for as long as
 * `run` takes, and always put back. Their sessionVersion is left alone, so a
 * developer signed in as one of them is not signed out by a test run. CI's
 * database starts with none.
 */
async function withOnlyTheseAdmins(keep: string[], run: () => Promise<void>) {
  const others = await prisma.user.findMany({
    where: { role: "ADMIN", active: true, id: { notIn: keep } },
    select: { id: true },
  });
  const ids = others.map((user) => user.id);
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { active: false },
  });
  try {
    await run();
  } finally {
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { active: true },
    });
  }
}

const activeAdmins = () =>
  prisma.user.count({ where: { role: "ADMIN", active: true } });

describe("adding staff", () => {
  it("creates the account with a hashed temporary password to replace", async () => {
    const created = await createStaff({
      name: "  Arta  ",
      email: `  ${email("new").toUpperCase()} `,
      role: "EMPLOYEE",
      temporaryPassword: PASSWORD,
    });

    expect(created).toMatchObject({
      name: "Arta",
      email: email("new"),
      role: "EMPLOYEE",
      active: true,
      mustChangePassword: true,
    });
    expect(created).not.toHaveProperty("password");

    const stored = await prisma.user.findUniqueOrThrow({
      where: { email: email("new") },
    });
    expect(stored.password).not.toBe(PASSWORD);
    expect(bcrypt.getRounds(stored.password)).toBe(12);
    // And it is a password sign-in accepts.
    await expect(
      verifyCredentials(email("new"), PASSWORD)
    ).resolves.toMatchObject({ id: stored.id });
  });

  it("refuses an email already in use, whatever its case", async () => {
    await seed("taken");
    await refusedWith(
      createStaff({
        name: "Someone else",
        email: email("taken").toUpperCase(),
        role: "ADMIN",
        temporaryPassword: PASSWORD,
      }),
      "err.staffEmailTaken"
    );
    expect(
      await prisma.user.count({
        where: { email: { equals: email("taken"), mode: "insensitive" } },
      })
    ).toBe(1);
  });

  it("refuses a temporary password the policy does not allow", async () => {
    await refusedWith(
      createStaff({
        name: "Short",
        email: email("short"),
        role: "EMPLOYEE",
        temporaryPassword: "too short",
      }),
      "err.passwordTooShort"
    );
    await refusedWith(
      createStaff({
        name: "Long",
        email: email("long"),
        role: "EMPLOYEE",
        // 37 characters, 74 bytes: bcrypt would ignore the last two.
        temporaryPassword: "ë".repeat(37),
      }),
      "err.passwordTooLong"
    );
    expect(
      await prisma.user.count({
        where: { email: { in: [email("short"), email("long")] } },
      })
    ).toBe(0);
  });

  it("lists staff without ever reading the password", async () => {
    const staff = await listStaff();
    const ours = staff.find((member) => member.email === email("taken"));
    expect(ours).toBeDefined();
    expect(Object.keys(ours!).sort()).toEqual(
      [
        "active",
        "createdAt",
        "email",
        "id",
        "mustChangePassword",
        "name",
        "role",
      ].sort()
    );
  });
});

describe("the last active admin", () => {
  it("cannot be demoted or deactivated, even by a stale request", async () => {
    await seed("sole-admin", { role: "ADMIN" });
    // Someone whose admin rights went a moment ago, still holding a request
    // that passed the guard before they did.
    await seed("stale-actor", { role: "EMPLOYEE" });

    await withOnlyTheseAdmins([id("sole-admin")], async () => {
      expect(await activeAdmins()).toBe(1);
      await refusedWith(
        changeStaffRole(id("stale-actor"), id("sole-admin"), "EMPLOYEE"),
        "err.lastActiveAdmin"
      );
      await refusedWith(
        deactivateStaff(id("stale-actor"), id("sole-admin")),
        "err.lastActiveAdmin"
      );
      expect(await activeAdmins()).toBe(1);
    });

    expect(await row("sole-admin")).toMatchObject({
      role: "ADMIN",
      active: true,
    });
  });

  /*
   * Several rounds, not one. The first transaction to run in a test file can
   * finish while the pool is still opening a second connection, and then the
   * two never overlap and the race is not run at all: with the lock removed,
   * a single round passed anyway. Once the pool is warm they do overlap, and
   * without the lock a later round leaves no admin, every time.
   */
  const ROUNDS = 4;

  it("survives two admins demoting each other at the same moment", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const [a, b] = [`duel-a${round}`, `duel-b${round}`];
      await seed(a, { role: "ADMIN" });
      await seed(b, { role: "ADMIN" });

      await withOnlyTheseAdmins([id(a), id(b)], async () => {
        expect(await activeAdmins()).toBe(2);
        // Each one, alone, would be fine: the other admin would remain.
        // Together, without the lock, each counts the other and both succeed.
        const results = await Promise.allSettled([
          changeStaffRole(id(a), id(b), "EMPLOYEE"),
          changeStaffRole(id(b), id(a), "EMPLOYEE"),
        ]);

        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const [refused] = results.filter((r) => r.status === "rejected");
        expect(refused?.reason).toBeInstanceOf(AppError);
        expect((refused?.reason as AppError).text?.key).toBe(
          "err.lastActiveAdmin"
        );
        expect(await activeAdmins()).toBe(1);
      });
    }
  });

  it("survives two admins deactivating each other at the same moment", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const [a, b] = [`pair-a${round}`, `pair-b${round}`];
      await seed(a, { role: "ADMIN" });
      await seed(b, { role: "ADMIN" });

      await withOnlyTheseAdmins([id(a), id(b)], async () => {
        expect(await activeAdmins()).toBe(2);
        const results = await Promise.allSettled([
          deactivateStaff(id(a), id(b)),
          deactivateStaff(id(b), id(a)),
        ]);
        expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        expect(await activeAdmins()).toBe(1);
      });
    }
  });

  it("can be demoted once another active admin remains", async () => {
    await seed("outgoing", { role: "ADMIN" });
    await seed("remaining", { role: "ADMIN" });

    await withOnlyTheseAdmins([id("outgoing"), id("remaining")], async () => {
      await changeStaffRole(id("remaining"), id("outgoing"), "EMPLOYEE");
      expect(await activeAdmins()).toBe(1);
    });
    expect((await row("outgoing")).role).toBe("EMPLOYEE");
  });
});

describe("acting on yourself", () => {
  it("refuses an admin deactivating or demoting themselves", async () => {
    // Another active admin exists, so this is the self rule and not the
    // last-admin one.
    await seed("self", { role: "ADMIN" });
    await seed("self-peer", { role: "ADMIN" });
    const before = await row("self");

    await refusedWith(
      deactivateStaff(id("self"), id("self")),
      "err.cannotDeactivateSelf"
    );
    await refusedWith(
      changeStaffRole(id("self"), id("self"), "EMPLOYEE"),
      "err.cannotDemoteSelf"
    );
    await refusedWith(
      resetStaffPassword(id("self"), id("self"), NEW_PASSWORD),
      "err.resetOwnPassword"
    );

    expect(await row("self")).toMatchObject({
      role: "ADMIN",
      active: true,
      password: before.password,
      sessionVersion: before.sessionVersion,
    });
  });
});

describe("revoking access", () => {
  it("a reset sets a temporary password, forces a change and ends sessions", async () => {
    await seed("reset-admin", { role: "ADMIN" });
    await seed("reset-me", { sessionVersion: 5 });

    await resetStaffPassword(id("reset-admin"), id("reset-me"), NEW_PASSWORD);

    const after = await row("reset-me");
    expect(after.mustChangePassword).toBe(true);
    expect(after.sessionVersion).toBe(6);
    expect(bcrypt.getRounds(after.password)).toBe(12);
    await expect(
      verifyCredentials(email("reset-me"), PASSWORD)
    ).resolves.toBeNull();
    await expect(
      verifyCredentials(email("reset-me"), NEW_PASSWORD)
    ).resolves.toMatchObject({ sessionVersion: 6 });
  });

  it("deactivating ends sessions and sign-in; reactivating restores sign-in only", async () => {
    await seed("leaver-admin", { role: "ADMIN" });
    await seed("leaver", { sessionVersion: 2 });

    await deactivateStaff(id("leaver-admin"), id("leaver"));
    expect(await row("leaver")).toMatchObject({
      active: false,
      sessionVersion: 3,
    });
    await expect(
      verifyCredentials(email("leaver"), PASSWORD)
    ).resolves.toBeNull();

    await reactivateStaff(id("leaver"));
    // A fresh version again, so no session from before the deactivation
    // comes back with the account.
    expect(await row("leaver")).toMatchObject({
      active: true,
      sessionVersion: 4,
    });
    await expect(
      verifyCredentials(email("leaver"), PASSWORD)
    ).resolves.not.toBeNull();
  });

  it("signing out everywhere ends sessions and changes nothing else", async () => {
    await seed("everywhere", { sessionVersion: 7 });
    const before = await row("everywhere");

    await signOutStaffEverywhere(id("everywhere"));

    expect(await row("everywhere")).toMatchObject({
      sessionVersion: 8,
      active: true,
      password: before.password,
      mustChangePassword: before.mustChangePassword,
    });
  });

  it("says so when the account no longer exists", async () => {
    await refusedWith(signOutStaffEverywhere(id("nobody")), "err.notFound");
    await refusedWith(
      resetStaffPassword(id("reset-admin"), id("nobody"), NEW_PASSWORD),
      "err.notFound"
    );
  });
});

describe("changing your own password", () => {
  it("rejects a wrong current password and changes nothing", async () => {
    await seed("own-wrong", { mustChangePassword: true, sessionVersion: 1 });
    const before = await row("own-wrong");

    await refusedWith(
      changeOwnPassword(id("own-wrong"), "not the password", NEW_PASSWORD),
      "err.currentPasswordWrong"
    );

    expect(await row("own-wrong")).toMatchObject({
      password: before.password,
      mustChangePassword: true,
      sessionVersion: 1,
    });
  });

  it("refuses a new password that is the current one, or breaks the policy", async () => {
    await seed("own-same");
    await refusedWith(
      changeOwnPassword(id("own-same"), PASSWORD, PASSWORD),
      "err.passwordUnchanged"
    );
    await refusedWith(
      changeOwnPassword(id("own-same"), PASSWORD, "short"),
      "err.passwordTooShort"
    );
  });

  it("on success replaces the password, clears the flag and ends sessions", async () => {
    await seed("own-ok", { mustChangePassword: true, sessionVersion: 4 });

    await changeOwnPassword(id("own-ok"), PASSWORD, NEW_PASSWORD);

    const after = await row("own-ok");
    expect(after.mustChangePassword).toBe(false);
    expect(after.sessionVersion).toBe(5);
    expect(bcrypt.getRounds(after.password)).toBe(12);
    await expect(
      verifyCredentials(email("own-ok"), PASSWORD)
    ).resolves.toBeNull();
    await expect(
      verifyCredentials(email("own-ok"), NEW_PASSWORD)
    ).resolves.toMatchObject({ sessionVersion: 5 });
  });
});
