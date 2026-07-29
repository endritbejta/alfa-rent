import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const brandLogo = readFileSync(
  resolve(process.cwd(), "src/components/shared/brand-logo.tsx"),
  "utf8"
);
const siteHeader = readFileSync(
  resolve(process.cwd(), "src/components/shared/site-header.tsx"),
  "utf8"
);
const siteFooter = readFileSync(
  resolve(process.cwd(), "src/components/shared/site-footer.tsx"),
  "utf8"
);

describe("Alfa company branding", () => {
  it("ships the official Alfa mark as a local optimized asset", () => {
    expect(
      existsSync(resolve(process.cwd(), "public/brand/alfa-logo-red.png"))
    ).toBe(true);
    expect(brandLogo).toContain('src="/brand/alfa-logo-red.png"');
    expect(brandLogo).toContain('alt=""');
  });

  it("uses the shared brand in both website navigation surfaces", () => {
    expect(siteHeader).toContain("<BrandLogo");
    expect(siteFooter).toContain("<BrandLogo");
  });
});
