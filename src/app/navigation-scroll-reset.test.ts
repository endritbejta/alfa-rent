import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rootLayout = readFileSync(
  resolve(process.cwd(), "src/app/layout.tsx"),
  "utf8"
);
const navigationScrollReset = readFileSync(
  resolve(process.cwd(), "src/components/shared/navigation-scroll-reset.tsx"),
  "utf8"
);
const bookingForm = readFileSync(
  resolve(process.cwd(), "src/components/forms/booking-form.tsx"),
  "utf8"
);

describe("page scroll position", () => {
  it("resets to the top after every pathname change", () => {
    expect(rootLayout).toContain("<NavigationScrollReset />");
    expect(navigationScrollReset).toContain("usePathname()");
    expect(navigationScrollReset).toContain(
      'window.scrollTo({ top: 0, left: 0, behavior: "auto" })'
    );
  });

  it("resets when the in-place booking confirmation replaces the form", () => {
    expect(bookingForm).toContain("if (!confirmation) return");
    expect(bookingForm).toContain(
      'window.scrollTo({ top: 0, left: 0, behavior: "auto" })'
    );
  });
});
