import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const detailPage = readFileSync(
  resolve(process.cwd(), "src/app/(website)/car/[slug]/page.tsx"),
  "utf8"
);
const mobileBookingBar = readFileSync(
  resolve(process.cwd(), "src/components/forms/mobile-booking-bar.tsx"),
  "utf8"
);

describe("mobile vehicle detail actions", () => {
  it("uses a compact three-by-two specification grid", () => {
    expect(detailPage).toContain("grid grid-cols-3 gap-2");
  });

  it("keeps a safe-area-aware booking action visible on mobile", () => {
    expect(detailPage).toContain('id="booking"');
    expect(detailPage).toContain("<MobileBookingBar");
    expect(mobileBookingBar).toContain(
      "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    );
    expect(mobileBookingBar).toContain("fixed inset-x-0 bottom-0");
    expect(mobileBookingBar).toContain("lg:hidden");
  });

  it("slides the fixed action away while the booking card is visible", () => {
    expect(mobileBookingBar).toContain("new IntersectionObserver");
    expect(mobileBookingBar).toContain(
      "setBookingInView(entry.isIntersecting)"
    );
    expect(mobileBookingBar).toContain("transition-transform duration-300");
    expect(mobileBookingBar).toContain(
      '"pointer-events-none translate-y-full"'
    );
    expect(mobileBookingBar).toContain('"translate-y-0"');
  });

  it("smoothly scrolls to booking unless reduced motion is preferred", () => {
    expect(mobileBookingBar).toContain("booking.scrollIntoView");
    expect(mobileBookingBar).toContain(
      'window.matchMedia("(prefers-reduced-motion: reduce)")'
    );
    expect(mobileBookingBar).toContain("onClick={handleBookingClick}");
  });
});
