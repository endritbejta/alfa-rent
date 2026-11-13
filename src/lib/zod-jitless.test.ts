import { describe, expect, it } from "vitest";
import { setZodJitless } from "./zod-jitless";

describe("setZodJitless", () => {
  it("is what Zod reads as its global `jitless` setting", async () => {
    // Before Zod loads, as on a storefront page that has not needed it yet…
    setZodJitless();
    const { z } = await import("zod");
    expect(z.config().jitless).toBe(true);
    // …and after, when the object already exists.
    z.config({ jitless: false });
    setZodJitless();
    expect(z.config().jitless).toBe(true);
  });
});
