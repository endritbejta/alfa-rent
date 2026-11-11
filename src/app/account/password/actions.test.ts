import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The one password action that is not ADMIN-only. Driven through the real
 * guard with a signed-in EMPLOYEE; the session, the user row, the limiter and
 * the service stand in.
 */
const { auth, signOut, findUnique, changeOwnPassword, limiter, Redirected } =
  vi.hoisted(() => {
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
      changeOwnPassword: vi.fn(),
      limiter: { consumeRateLimit: vi.fn(), resetRateLimit: vi.fn() },
      Redirected,
    };
  });

vi.mock("@/lib/auth", () => ({ auth, signOut }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/services/staff.service", () => ({ changeOwnPassword }));
vi.mock("@/lib/rate-limit", () => limiter);
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
  unstable_rethrow: () => {},
}));
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

import { changeOwnPasswordAction } from "./actions";
import { dictionaries } from "@/lib/i18n/translations";

const strong = "correct horse battery";
const input = {
  currentPassword: "the old one",
  newPassword: strong,
  confirmPassword: strong,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "employee-1", sessionVersion: 2 } });
  findUnique.mockResolvedValue({
    id: "employee-1",
    name: "Employee",
    email: "employee@example.test",
    role: "EMPLOYEE",
    active: true,
    sessionVersion: 2,
    mustChangePassword: true,
  });
  limiter.consumeRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 4,
    retryAfter: 0,
  });
  signOut.mockImplementation(async ({ redirectTo }) => {
    throw new Redirected(redirectTo);
  });
});

describe("changeOwnPasswordAction", () => {
  it("lets an EMPLOYEE change their own password, then signs them out", async () => {
    await expect(changeOwnPasswordAction(input)).rejects.toMatchObject({
      to: "/login?notice=password-changed",
    });
    expect(changeOwnPassword).toHaveBeenCalledWith(
      "employee-1",
      "the old one",
      strong
    );
    expect(limiter.resetRateLimit).toHaveBeenCalledWith(
      "password-change:employee-1"
    );
  });

  it("changes the session's account, never one named in the request", async () => {
    await expect(
      changeOwnPasswordAction({ ...input, userId: "admin-1" })
    ).rejects.toBeInstanceOf(Redirected);
    expect(changeOwnPassword).toHaveBeenCalledWith(
      "employee-1",
      expect.any(String),
      expect.any(String)
    );
  });

  it("stops after five attempts in the window, before checking anything", async () => {
    limiter.consumeRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 600,
    });
    await expect(changeOwnPasswordAction(input)).resolves.toEqual({
      error: dictionaries.en["err.tooManyRequests"],
    });
    expect(limiter.consumeRateLimit).toHaveBeenCalledWith(
      "password-change:employee-1",
      5,
      15 * 60
    );
    expect(changeOwnPassword).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match without spending an attempt", async () => {
    const result = await changeOwnPasswordAction({
      ...input,
      confirmPassword: "something else entirely",
    });
    expect(result).toHaveProperty("error");
    expect(limiter.consumeRateLimit).not.toHaveBeenCalled();
    expect(changeOwnPassword).not.toHaveBeenCalled();
  });

  it("stays signed in and says why when the service refuses", async () => {
    const { ValidationError } = await import("@/lib/errors");
    changeOwnPassword.mockRejectedValue(
      new ValidationError("wrong", { key: "err.currentPasswordWrong" })
    );
    await expect(changeOwnPasswordAction(input)).resolves.toEqual({
      error: dictionaries.en["err.currentPasswordWrong"],
    });
    expect(limiter.resetRateLimit).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
