import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, findUnique, Redirected } = vi.hoisted(() => {
  /** Stands in for Next's NEXT_REDIRECT, carrying where it was sent. */
  class Redirected extends Error {
    constructor(public readonly to: string) {
      super(`redirect to ${to}`);
    }
  }
  return { auth: vi.fn(), findUnique: vi.fn(), Redirected };
});

vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

import { requireRole, requireUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";

const signedIn = (sessionVersion = 3) => ({
  user: { id: "user-1", sessionVersion },
});

const onFile = (overrides: Record<string, unknown> = {}) => ({
  id: "user-1",
  name: "Staff",
  email: "staff@example.test",
  role: "EMPLOYEE",
  active: true,
  sessionVersion: 3,
  ...overrides,
});

async function redirectTarget(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  return null;
}

beforeEach(() => {
  auth.mockReset();
  findUnique.mockReset();
});

describe("requireUser", () => {
  it("sends a signed-out request to sign in without touching the database", async () => {
    auth.mockResolvedValue(null);
    expect(await redirectTarget(requireUser)).toBe("/login");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("sends a session whose user no longer exists to sign in", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(null);
    expect(await redirectTarget(requireUser)).toBe("/login");
  });

  it("sends a deactivated user to sign in", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(onFile({ active: false }));
    expect(await redirectTarget(requireUser)).toBe("/login");
  });

  it("sends a revoked session (a bumped sessionVersion) to sign in", async () => {
    auth.mockResolvedValue(signedIn(3));
    findUnique.mockResolvedValue(onFile({ sessionVersion: 4 }));
    expect(await redirectTarget(requireUser)).toBe("/login");
  });

  it("returns the user as the database has them, not as the token says", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(onFile({ role: "ADMIN" }));
    await expect(requireUser()).resolves.toMatchObject({
      id: "user-1",
      role: "ADMIN",
    });
  });
});

describe("requireRole", () => {
  it("refuses an employee an admin-only action with ForbiddenError", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(onFile({ role: "EMPLOYEE" }));
    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an employee do employee work", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(onFile({ role: "EMPLOYEE" }));
    await expect(requireRole("EMPLOYEE")).resolves.toMatchObject({
      role: "EMPLOYEE",
    });
  });

  it("lets an admin pass every role check", async () => {
    auth.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(onFile({ role: "ADMIN" }));
    await expect(requireRole("EMPLOYEE")).resolves.toMatchObject({
      role: "ADMIN",
    });
  });

  it("redirects rather than forbids when there is no session at all", async () => {
    auth.mockResolvedValue(null);
    expect(await redirectTarget(() => requireRole("ADMIN"))).toBe("/login");
  });
});
