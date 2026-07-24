import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEBSITE_DATA_ENTRYPOINTS = [
  "src/app/(website)/page.tsx",
  "src/app/(website)/car/page.tsx",
  "src/app/(website)/booking/page.tsx",
  "src/app/(website)/car/[slug]/page.tsx",
];

describe("website vehicle data boundary", () => {
  it.each(WEBSITE_DATA_ENTRYPOINTS)(
    "%s uses only public vehicle reads",
    (file) => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\bgetVehicles\b|\bgetVehicleBySlug\b/);
      expect(source).toMatch(/\bgetPublicVehicle/);
    }
  );

  it("does not render registration plates in the public vehicle card", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/shared/vehicle-card.tsx"),
      "utf8"
    );
    expect(source).not.toContain("vehicle.plate");
  });
});
