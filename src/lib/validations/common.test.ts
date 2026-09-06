import { describe, expect, it } from "vitest";
import { parsePageParam, paginationSchema } from "./common";

/**
 * `?page=0` and friends used to throw a ZodError out of a server component,
 * which the route error boundary rendered as the generic "something went
 * wrong" card. A hand-edited or stale link should land you on page 1.
 */
describe("parsePageParam", () => {
  it("reads a usable page number", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(3)).toBe(3);
    expect(parsePageParam("1")).toBe(1);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["not a number", "abc"],
    ["zero", "0"],
    ["negative", "-3"],
    ["fractional", "1.5"],
    ["beyond a safe integer", "999999999999999999999"],
    ["an array, as a repeated query param", ["2", "3"]],
    ["null", null],
  ])("falls back to page 1 rather than throwing (%s)", (_label, raw) => {
    expect(() => parsePageParam(raw)).not.toThrow();
    expect(parsePageParam(raw)).toBe(1);
  });
});

describe("paginationSchema", () => {
  /**
   * Deliberately still strict: GET /api/vehicles parses this shape, and an API
   * should reject a malformed request rather than quietly serve page 1.
   */
  it("still throws on a malformed page, so the API keeps rejecting one", () => {
    expect(() => paginationSchema.parse({ page: "abc" })).toThrow();
    expect(() => paginationSchema.parse({ page: "0" })).toThrow();
  });

  it("applies its defaults when nothing is supplied", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, perPage: 12 });
  });
});
