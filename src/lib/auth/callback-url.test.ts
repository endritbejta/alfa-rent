import { describe, expect, it } from "vitest";
import { DEFAULT_SIGN_IN_TARGET, safeCallbackUrl } from "./callback-url";

describe("safeCallbackUrl", () => {
  it("keeps a legitimate admin destination, including its query", () => {
    expect(safeCallbackUrl("/admin/reservations")).toBe("/admin/reservations");
    expect(safeCallbackUrl("/admin/reservations?status=PENDING")).toBe(
      "/admin/reservations?status=PENDING"
    );
    expect(safeCallbackUrl("/admin")).toBe("/admin");
  });

  it("falls back when nothing usable is supplied", () => {
    expect(safeCallbackUrl(undefined)).toBe(DEFAULT_SIGN_IN_TARGET);
    expect(safeCallbackUrl("")).toBe(DEFAULT_SIGN_IN_TARGET);
  });

  /**
   * The reason this function exists. Each of these passes a
   * `startsWith("/") && !startsWith("//")` check and still resolves to
   * another origin, because the URL parser normalizes backslashes and strips
   * tabs in special schemes.
   */
  it.each([
    ["backslash", "/\\evil.com"],
    ["backslash then slash", "/\\/evil.com"],
    ["embedded tab", "/\t/evil.com"],
    ["embedded newline", "/\n/evil.com"],
    ["embedded carriage return", "/\r/evil.com"],
  ])(
    "refuses an off-origin target smuggled past a prefix check (%s)",
    (_l, raw) => {
      expect(new URL(raw, "http://callback.invalid").origin).not.toBe(
        "http://callback.invalid"
      );
      expect(safeCallbackUrl(raw)).toBe(DEFAULT_SIGN_IN_TARGET);
    }
  );

  it.each([
    "//evil.com",
    "https://evil.com",
    "http://evil.com/admin/dashboard",
    "javascript:alert(1)",
  ])("refuses an obviously absolute target (%s)", (raw) => {
    expect(safeCallbackUrl(raw)).toBe(DEFAULT_SIGN_IN_TARGET);
  });

  it("refuses a same-origin path outside the admin area", () => {
    expect(safeCallbackUrl("/car/some-slug")).toBe(DEFAULT_SIGN_IN_TARGET);
    expect(safeCallbackUrl("/")).toBe(DEFAULT_SIGN_IN_TARGET);
    // /administrator must not satisfy a /admin prefix test
    expect(safeCallbackUrl("/administrator")).toBe(DEFAULT_SIGN_IN_TARGET);
  });
});
