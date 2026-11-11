import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { describe, expect, it } from "vitest";
import { authConfig, SESSION_IDLE_SECONDS } from "@/lib/auth/config";

type AuthorizedArgs = Parameters<typeof authConfig.callbacks.authorized>[0];

function authorized(
  path: string,
  auth: Session | null,
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  return authConfig.callbacks.authorized({
    auth,
    request: new NextRequest(new URL(path, "http://localhost"), init),
  } as AuthorizedArgs);
}

const staff = {
  user: { id: "user-1", role: "EMPLOYEE", sessionVersion: 0 },
  expires: new Date(Date.now() + 60_000).toISOString(),
} as Session;

describe("the proxy's admin perimeter", () => {
  it("leaves the storefront alone", () => {
    expect(authorized("/car", null)).toBe(true);
    expect(authorized("/login", null)).toBe(true);
  });

  it("sends a signed-out admin page view to sign in", () => {
    expect(authorized("/admin/dashboard", null)).toBe(false);
    expect(authorized("/admin", null)).toBe(false);
  });

  it("lets a signed-in admin page view through", () => {
    expect(authorized("/admin/dashboard", staff)).toBe(true);
  });

  it("refuses a token missing the claims the guards compare", () => {
    const malformed = { ...staff, user: { id: "user-1" } } as Session;
    expect(authorized("/admin/dashboard", malformed)).toBe(false);
  });

  it("lets a Server Action through to its own guard, signed in or not", () => {
    const action = { method: "POST", headers: { "next-action": "abc123" } };
    expect(authorized("/admin/reservations", null, action)).toBe(true);
  });

  it("does not let a page view in by claiming to be an action", () => {
    expect(
      authorized("/admin/reservations", null, {
        method: "GET",
        headers: { "next-action": "abc123" },
      })
    ).toBe(false);
  });
});

describe("staff session lifetime", () => {
  it("is an idle working day, not Auth.js's 30-day default", () => {
    expect(authConfig.session.maxAge).toBe(SESSION_IDLE_SECONDS);
    expect(SESSION_IDLE_SECONDS).toBeLessThanOrEqual(24 * 60 * 60);
  });
});
