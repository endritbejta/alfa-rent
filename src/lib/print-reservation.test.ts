import { describe, expect, it } from "vitest";
import { handoverSheetUrl, printableDocuments } from "./print-reservation";

describe("printableDocuments", () => {
  it("offers nothing for a request or a cancelled booking", () => {
    expect(printableDocuments("PENDING")).toEqual([]);
    expect(printableDocuments("CANCELLED")).toEqual([]);
  });

  it("offers the pickup sheet alone from confirmation until completion", () => {
    expect(printableDocuments("CONFIRMED")).toEqual(["PICKUP"]);
    expect(printableDocuments("ACTIVE")).toEqual(["PICKUP"]);
  });

  it("offers both, in the order they happen, once completed", () => {
    expect(printableDocuments("COMPLETED")).toEqual(["PICKUP", "RETURN"]);
  });
});

describe("handoverSheetUrl", () => {
  it("points at the print route, with the return sheet by query", () => {
    expect(handoverSheetUrl("abc", "PICKUP")).toBe("/admin/print/handover/abc");
    expect(handoverSheetUrl("abc", "RETURN")).toBe(
      "/admin/print/handover/abc?type=return"
    );
  });

  it("cannot be steered off the route by the id", () => {
    expect(handoverSheetUrl("../../x?y", "PICKUP")).toBe(
      "/admin/print/handover/..%2F..%2Fx%3Fy"
    );
  });
});
