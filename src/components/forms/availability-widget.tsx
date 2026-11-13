"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, startOfToday } from "date-fns";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/types/api";
import { useI18n } from "@/components/shared/locale-provider";
import { formatPrice } from "@/lib/money";
import { PendingStatus } from "@/components/shared/pending-status";
import type { VehicleBookingCalendar } from "@/lib/booking-calendar";
import { rentalDaysBetween } from "@/lib/rental-dates";

/** A pickup day and a return day on or after it: one day at the least. */
const isRange = (from: string, to: string) => !!from && !!to && to >= from;

type Quote = { available: boolean; totalPrice: number | null };

/**
 * Live availability + server-computed quote on the vehicle page. The
 * price shown is the API's number, never client math — the same figure
 * staff will see on the reservation.
 */
export function AvailabilityWidget({
  vehicleId,
  slug,
  pricePerDay,
  initialFrom,
  initialTo,
  initialRangeAvailable,
  bookingCalendar,
}: {
  vehicleId: string;
  slug: string;
  pricePerDay: number;
  initialFrom?: string;
  initialTo?: string;
  initialRangeAvailable: boolean;
  bookingCalendar: VehicleBookingCalendar;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  // Prefilled from the hero/fleet selection carried through the URL, so a
  // customer who already chose dates lands here with a live quote.
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const initialDays =
    initialFrom && initialTo && isRange(initialFrom, initialTo)
      ? rentalDaysBetween(initialFrom, initialTo)
      : 0;
  /*
   * Every quote fetched on this page, by date range. A customer comparing
   * dates goes back and forth between the same few ranges; each return used
   * to wipe the answer and ask again. Now the known answer shows at once and
   * a fresh check runs behind it (stale-while-revalidate). Only ever the
   * range on screen is read, so a quote for other dates can no longer stand
   * in while new ones load — it used to, and kept Continue enabled with it.
   */
  const [quotes, setQuotes] = useState<Record<string, Quote>>(() =>
    initialRangeAvailable && initialDays > 0
      ? {
          [`${initialFrom}|${initialTo}`]: {
            available: true,
            totalPrice: initialDays * pricePerDay,
          },
        }
      : {}
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const forget = (key: string) =>
    setQuotes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  const rangeKey = isRange(from, to) ? `${from}|${to}` : null;
  const quote = rangeKey ? (quotes[rangeKey] ?? null) : null;

  // Debounced availability check; the timeout also keeps state updates
  // out of the synchronous effect body.
  useEffect(() => {
    if (!isRange(from, to)) {
      const timer = setTimeout(() => setError(null), 0);
      return () => clearTimeout(timer);
    }
    if (initialRangeAvailable && from === initialFrom && to === initialTo) {
      return;
    }
    const key = `${from}|${to}`;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/availability?vehicleId=${vehicleId}&pickupDate=${from}T10:00:00Z&returnDate=${to}T10:00:00Z`,
          // A quote is re-requested on every date change, so it can fail fast:
          // without a bound, a stalled request leaves "Checking…" on screen
          // because the finally that clears it never runs.
          { signal: AbortSignal.timeout(10_000) }
        );
        const json: ApiResponse<Quote> = await res.json();
        if (cancelled) return;
        if (!json.success) {
          forget(key);
          setError(json.error.message);
          return;
        }
        setQuotes((current) => ({ ...current, [key]: json.data }));
      } catch {
        if (!cancelled) {
          // An answer we could not confirm is not shown as current.
          forget(key);
          setError(t("availability.error"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, initialFrom, initialRangeAvailable, initialTo, t, to, vehicleId]);

  const days = isRange(from, to) ? rentalDaysBetween(from, to) : 0;

  return (
    <div className="mt-5 space-y-3">
      {/* The same range picker the admin uses — one calendar system. */}
      <DateRangePicker
        tone="light"
        minDate={startOfToday()}
        labels={{
          from: t("booking.pickupDate"),
          to: t("booking.returnDate"),
        }}
        value={{
          from: from ? parseISO(from) : undefined,
          to: to ? parseISO(to) : undefined,
        }}
        onChange={(range) => {
          setFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
          setTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
        }}
        bookingCalendar={bookingCalendar}
      />

      <PendingStatus message={loading ? t("availability.checking") : null} />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {/* A first check for these dates holds the quote's own space, so the
          answer lands without pushing the button down; a known answer stays
          up while it is re-checked. */}
      {loading && !quote && (
        <div
          aria-hidden="true"
          className="bg-skeleton h-[4.25rem] animate-pulse rounded-none motion-reduce:animate-none"
        />
      )}
      {quote && (
        <div
          aria-busy={loading || undefined}
          className={
            quote.available
              ? "bg-status-available/10 rounded-none px-4 py-3"
              : "bg-destructive/8 rounded-none px-4 py-3"
          }
        >
          {quote.available ? (
            <>
              <p className="text-status-available text-sm font-semibold">
                {t("availability.available")}
              </p>
              <p className="mt-0.5 text-sm tabular-nums">
                {t(
                  days === 1
                    ? "availability.summary"
                    : "availability.summaryPlural",
                  {
                    count: days,
                    total: formatPrice(quote.totalPrice ?? 0, locale),
                  }
                )}
              </p>
            </>
          ) : (
            <p className="text-destructive text-sm font-semibold">
              {t("availability.booked")}
            </p>
          )}
        </div>
      )}

      <Button
        className="h-14 w-full text-base sm:h-14"
        // Only ever the quote for the dates on screen; never a leftover one.
        disabled={!quote?.available}
        onClick={() =>
          router.push(`/booking?vehicle=${slug}&from=${from}&to=${to}`)
        }
      >
        {t("availability.continue")}
      </Button>
    </div>
  );
}
