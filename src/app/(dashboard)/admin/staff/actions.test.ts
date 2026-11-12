import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The staff-specific authorization case. Every staff action's EMPLOYEE refusal
 * and ADMIN control are part of the matrix in
 * src/app/server-action-authorization.test.ts; what is left here is the case
 * the matrix cannot express: an EMPLOYEE naming an account the page never
 * offered them, their own included.
 */
const { auth, signOut, findUnique, service } = vi.hoisted(() => ({
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
}));

vi.mock("@/lib/auth", () => ({ auth, signOut }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/services/staff.service", () => service);
vi.mock("next/navigation", async () =>
  (await import("@/lib/testing/action-mocks")).nextNavigationMock()
);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// errorMessage() reads the locale cookie through a server-only module.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/i18n/server", async () =>
  (await import("@/lib/testing/action-mocks")).i18nServerMock()
);

import { changeStaffRoleAction } from "./actions";
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the staff actions", () => {
  it("refuses an EMPLOYEE even with an id the page never offered", async () => {
    signedInAs("EMPLOYEE");
    await expect(
      changeStaffRoleAction({ userId: "user-1", role: "ADMIN" })
    ).resolves.toEqual({ error: dictionaries.en["err.forbidden"] });
    expect(service.changeStaffRole).not.toHaveBeenCalled();
  });
});
