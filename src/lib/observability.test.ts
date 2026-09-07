import { describe, expect, it, vi } from "vitest";
import { reportError } from "./observability";

/**
 * The seam has one job beyond formatting: never become the failure it is
 * reporting. A reporter that throws inside a catch block replaces a handled
 * error with an unhandled one.
 */
describe("reportError", () => {
  it("emits one structured line carrying the digest", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    reportError(new Error("boom"), {
      scope: "admin-boundary",
      digest: "abc123",
    });
    const line = spy.mock.calls[0]![0] as string;
    spy.mockRestore();
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "error",
      message: "boom",
      name: "Error",
      scope: "admin-boundary",
      digest: "abc123",
    });
    expect(typeof parsed.at).toBe("string");
  });

  it("never throws, whatever it is handed", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => reportError("a bare string", { scope: "x" })).not.toThrow();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => reportError(circular, { scope: "x" })).not.toThrow();
    spy.mockRestore();
  });
});
