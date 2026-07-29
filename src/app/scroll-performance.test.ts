import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const styles = readFileSync(resolve(root, "src/app/globals.css"), "utf8");
const vehicleCard = readFileSync(
  resolve(root, "src/components/shared/vehicle-card.tsx"),
  "utf8"
);
const fleetPage = readFileSync(
  resolve(root, "src/app/(website)/car/page.tsx"),
  "utf8"
);

describe("mobile scroll performance", () => {
  it("does not rasterize oversized blurred ambient layers", () => {
    expect(styles).not.toContain("filter: blur(90px)");
    expect(styles).toContain("(hover: none) and (pointer: coarse)");
    expect(styles).toMatch(
      /\.ambient-background::before,\s*\.ambient-background::after\s*\{[\s\S]*?content: none/
    );
  });

  it("skips rendering distant fleet cards", () => {
    expect(styles).toMatch(
      /\.fleet-card\s*\{[\s\S]*?content-visibility:\s*auto/
    );
    expect(styles).toContain("contain-intrinsic-size: auto 407px");
    expect(vehicleCard).toContain("fleet-card bg-card");
  });

  it("preloads only the first fleet image and leaves the rest lazy", () => {
    expect(fleetPage).toContain("preload={index === 0}");
    expect(vehicleCard).toContain("preload={preload}");
  });
});
