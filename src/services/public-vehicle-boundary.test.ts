import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** The website modules that read vehicles: each must use a public read. */
const WEBSITE_DATA_ENTRYPOINTS = [
  "src/app/(website)/(home)/page.tsx",
  "src/app/(website)/car/(list)/page.tsx",
  "src/app/(website)/booking/page.tsx",
  // The car page, its layout and its metadata share this one read.
  "src/app/(website)/car/[slug]/load-vehicle.ts",
];

/** Every website file on those paths, none of which may use an admin read. */
const WEBSITE_ROUTE_FILES = [
  ...WEBSITE_DATA_ENTRYPOINTS,
  "src/app/(website)/car/[slug]/page.tsx",
  "src/app/(website)/car/[slug]/layout.tsx",
];

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("website vehicle data boundary", () => {
  it.each(WEBSITE_DATA_ENTRYPOINTS)("%s reads vehicles publicly", (file) => {
    expect(read(file)).toMatch(/\bgetPublicVehicle/);
  });

  it.each(WEBSITE_ROUTE_FILES)("%s never uses an admin read", (file) => {
    expect(read(file)).not.toMatch(/\bgetVehicles\b|\bgetVehicleBySlug\b/);
  });

  it("does not render registration plates in the public vehicle card", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/shared/vehicle-card.tsx"),
      "utf8"
    );
    expect(source).not.toContain("vehicle.plate");
  });
});
