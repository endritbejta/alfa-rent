import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Staff accounts are ADMIN-only, and the page hiding its buttons from an
 * employee is not what enforces that: every one of these actions can be
 * POSTed to directly. This drives the real actions and the real guards with
 * a signed-in EMPLOYEE, and only the session, the user row and the service
 * stand in.
 */
const { auth, signOut, findUnique, service, Redirected } = vi.hoisted(() => {
  /** Stands in for Next's NEXT_REDIRECT, carrying where it was sent. */
  class Redirected extends Error {
    constructor(public readonly to: string) {
      super(`redirect to ${to}`);
    }
  }
  return {
    auth: vi.fn(),
    signOut: vi.fn(),
    findUnique: vi.fn(),
    service: {
      createStaff: vi.fn(),
      changeStaffRole: vi.fn(),
      deactivateStaff: vi.fn(),
      reactivateStaff: vi.fn(),
      resetStaffPassword: vi.fn(),
      signOutStaffEverywhere: vi.fn(),
    },
    Redirected,
  };
});

vi.mock("@/lib/auth", () => ({ auth, signOut }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/services/staff.service", () => service);
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  // errorMessage() rethrows Next's control flow with this once the session
  // fixes on fix/audit-immediate land; nothing here is control flow.
  unstable_rethrow: () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// errorMessage() reads the locale cookie through a server-only module.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n/server", async () => {
  const { dictionaries, translate } = await import("@/lib/i18n/translations");
  return {
    getI18n: async () => ({
      locale: "en",
      dictionary: dictionaries.en,
      t: (key: Parameters<typeof translate>[1]) =>
        translate(dictionaries.en, key),
    }),
  };
});

import {
  changeStaffRoleAction,
  createStaffAction,
  deactivateStaffAction,
  reactivateStaffAction,
  resetStaffPasswordAction,
  signOutStaffEverywhereAction,
} from "./actions";
import { dictionaries } from "@/lib/i18n/translations";

const signedInAs = (role: "ADMIN" | "EMPLOYEE") => {
  auth.mockResolvedValue({ user: { id: "user-1", sessionVersion: 3 } });
  findUnique.mockResolvedValue({
    id: "user-1",
    name: "Staff",
    email: "staff@example.test",
    role,
    active: true,
    sessionVersion: 3,
    mustChangePassword: false,
  });
};

const strong = "correct horse battery";
const target = { userId: "someone-else" };

/** Every staff action, each with an input it would otherwise accept. */
const STAFF_ACTIONS = [
  [
    "createStaffAction",
    () =>
      createStaffAction({
        name: "New Person",
        email: "new@example.test",
        role: "ADMIN",
        temporaryPassword: strong,
      }),
  ],
  [
    "changeStaffRoleAction",
    () => changeStaffRoleAction({ ...target, role: "ADMIN" }),
  ],
  ["deactivateStaffAction", () => deactivateStaffAction(target)],
  ["reactivateStaffAction", () => reactivateStaffAction(target)],
  [
    "resetStaffPasswordAction",
    () => resetStaffPasswordAction({ ...target, temporaryPassword: strong }),
  ],
  ["signOutStaffEverywhereAction", () => signOutStaffEverywhereAction(target)],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the staff actions", () => {
  it.each(STAFF_ACTIONS)(
    "%s refuses an EMPLOYEE before touching anything",
    async (_name, call) => {
      signedInAs("EMPLOYEE");
      await expect(call()).resolves.toEqual({
        error: dictionaries.en["err.forbidden"],
      });
      for (const write of Object.values(service)) {
        expect(write).not.toHaveBeenCalled();
      }
      expect(signOut).not.toHaveBeenCalled();
    }
  );

  it.each(STAFF_ACTIONS)("%s lets an ADMIN through", async (_name, call) => {
    // The control for the test above: the same call, with an admin, does
    // reach the service, so the refusal is the guard and not the input.
    signedInAs("ADMIN");
    await expect(call()).resolves.toBeUndefined();
    const calls = Object.values(service).filter(
      (write) => write.mock.calls.length > 0
    );
    expect(calls).toHaveLength(1);
  });

  it("refuses an EMPLOYEE even with an id the page never offered", async () => {
    signedInAs("EMPLOYEE");
    await expect(
      changeStaffRoleAction({ userId: "user-1", role: "ADMIN" })
    ).resolves.toEqual({ error: dictionaries.en["err.forbidden"] });
    expect(service.changeStaffRole).not.toHaveBeenCalled();
  });
});
