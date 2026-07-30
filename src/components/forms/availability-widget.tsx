"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  differenceInCalendarDays,
  format,
  parseISO,
  startOfToday,
} from "date-fns";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/types/api";
import { useI18n } from "@/components/shared/locale-provider";
import type { VehicleBookingCalendar } from "@/lib/booking-calendar";

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
  const { t } = useI18n();
  const router = useRouter();
  // Prefilled from the hero/fleet selection carried through the URL, so a
  // customer who already chose dates lands here with a live quote.
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const initialDays =
    initialFrom && initialTo && initialTo > initialFrom
      ? differenceInCalendarDays(new Date(initialTo), new Date(initialFrom))
      : 0;
  const [quote, setQuote] = useState<Quote | null>(
    initialRangeAvailable && initialDays > 0
      ? {
          available: true,
          totalPrice: initialDays * pricePerDay,
        }
      : null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced availability check; the timeout also keeps state updates
  // out of the synchronous effect body.
  useEffect(() => {
    if (!from || !to || to <= from) {
      const timer = setTimeout(() => setQuote(null), 0);
      return () => clearTimeout(timer);
    }
    if (initialRangeAvailable && from === initialFrom && to === initialTo) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/availability?vehicleId=${vehicleId}&pickupDate=${from}T10:00:00Z&returnDate=${to}T10:00:00Z`
        );
        const json: ApiResponse<Quote> = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setQuote(null);
          setError(json.error.message);
          return;
        }
        setQuote(json.data);
      } catch {
        if (!cancelled) {
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

  const days =
    from && to && to > from
      ? differenceInCalendarDays(new Date(to), new Date(from))
      : 0;

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

      {loading && (
        <p className="text-muted-foreground text-sm">
          {t("availability.checking")}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {quote && !loading && (
        <div
          className={
            quote.available
              ? "bg-status-available/10 rounded-lg px-4 py-3"
              : "bg-destructive/8 rounded-lg px-4 py-3"
          }
        >
          {quote.available ? (
            <>
              <p className="text-status-available text-sm font-semibold">
                {t("availability.available")}
              </p>
              <p className="mt-0.5 text-sm">
                {t(
                  days === 1
                    ? "availability.summary"
                    : "availability.summaryPlural",
                  { count: days, total: quote.totalPrice ?? 0 }
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
        className="w-full"
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
