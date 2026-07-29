"use client";

import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  pricePerDay: number;
  perDayLabel: string;
  bookLabel: string;
  targetId?: string;
};

export function MobileBookingBar({
  pricePerDay,
  perDayLabel,
  bookLabel,
  targetId = "booking",
}: Props) {
  const [bookingInView, setBookingInView] = useState(false);

  useEffect(() => {
    const booking = document.getElementById(targetId);
    if (!booking) return;

    const observer = new IntersectionObserver(
      ([entry]) => setBookingInView(entry.isIntersecting),
      {
        // The fixed bar occupies the bottom edge. Only count the booking card
        // once it is visible above that covered area.
        rootMargin: "0px 0px -72px 0px",
        threshold: 0.1,
      }
    );
    observer.observe(booking);
    return () => observer.disconnect();
  }, [targetId]);

  function handleBookingClick(event: MouseEvent<HTMLAnchorElement>) {
    const booking = document.getElementById(targetId);
    if (!booking) return;

    event.preventDefault();
    booking.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }

  return (
    <aside
      aria-hidden={bookingInView}
      aria-label={bookingInView ? undefined : bookLabel}
      data-mobile-booking-bar
      data-visible={!bookingInView}
      className={`bg-card fixed inset-x-0 bottom-0 z-40 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg transition-transform duration-300 ease-out motion-reduce:transition-none lg:hidden ${
        bookingInView ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
    >
      <div className="mx-auto flex max-w-md items-center justify-between gap-4">
        <p className="font-display text-xl font-bold">
          {pricePerDay}
          <span className="text-muted-foreground ml-1 font-sans text-xs font-medium">
            EUR / {perDayLabel}
          </span>
        </p>
        <Button
          nativeButton={false}
          className="px-5"
          render={
            <a
              href={`#${targetId}`}
              onClick={handleBookingClick}
              tabIndex={bookingInView ? -1 : undefined}
            />
          }
        >
          {bookLabel}
        </Button>
      </div>
    </aside>
  );
}
