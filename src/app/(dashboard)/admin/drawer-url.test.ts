import { describe, expect, it } from "vitest";
import {
  readDrawerTarget,
  withDrawerTarget,
  withoutDrawerTarget,
} from "./drawer-url";

const read = (search: string) => readDrawerTarget(new URLSearchParams(search));

describe("the drawer's URL", () => {
  it("is closed when no record is named", () => {
    expect(read("")).toBeNull();
    expect(read("?status=CONFIRMED&page=2")).toBeNull();
    // An empty value is not a record.
    expect(read("?reservation=")).toBeNull();
  });

  it("names the open record by kind", () => {
    expect(read("?reservation=res_1")).toEqual({
      kind: "reservation",
      id: "res_1",
    });
    expect(read("?page=2&customer=cus_9")).toEqual({
      kind: "customer",
      id: "cus_9",
    });
  });

  /**
   * The list underneath is what the operator returns to when the drawer
   * closes, so opening one must not disturb its filters, page or sort.
   */
  it("leaves the rest of the query alone", () => {
    expect(
      withDrawerTarget("?status=CONFIRMED&page=3", {
        kind: "reservation",
        id: "res_1",
      })
    ).toBe("status=CONFIRMED&page=3&reservation=res_1");

    expect(withoutDrawerTarget("?status=CONFIRMED&reservation=res_1")).toBe(
      "status=CONFIRMED"
    );
  });

  it("opens one drawer at a time", () => {
    const search = withDrawerTarget("?reservation=res_1", {
      kind: "vehicle",
      id: "veh_2",
    });
    expect(search).toBe("vehicle=veh_2");
    expect(read(search)).toEqual({ kind: "vehicle", id: "veh_2" });
  });

  it("comes back empty when the drawer was the only thing in the URL", () => {
    expect(withoutDrawerTarget("?reservation=res_1")).toBe("");
  });
});
