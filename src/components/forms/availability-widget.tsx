"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { Button } from "@/components/ui/button";
import type { ApiResponse } from "@/types/api";

type Quote = { available: boolean; totalPrice: number | null };

/**
 * Live availability + server-computed quote on the vehicle page. The
 * price shown is the API's number, never client math — the same figure
 * staff will see on the reservation.
 */
export function AvailabilityWidget({
  vehicleId,
  slug,
  initialFrom,
  initialTo,
}: {
  vehicleId: string;
  slug: string;
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  // Prefilled from the hero/fleet selection carried through the URL, so a
  // customer who already chose dates lands here with a live quote.
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState(initialTo ?? "");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced availability check; the timeout also keeps state updates
  // out of the synchronous effect body.
  useEffect(() => {
    if (!from || !to || to <= from) {
      const timer = setTimeout(() => setQuote(null), 0);
      return () => clearTimeout(timer);
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
          setError("Could not check availability. Please try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, to, vehicleId]);

  const days =
    from && to && to > from
      ? differenceInCalendarDays(new Date(to), new Date(from))
      : 0;

  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-muted-foreground mb-1 block text-xs font-semibold uppercase">
            Pickup
          </span>
          <input
            type="date"
            min={today}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-input focus:ring-ring h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2"
          />
        </label>
        <label className="block">
          <span className="text-muted-foreground mb-1 block text-xs font-semibold uppercase">
            Return
          </span>
          <input
            type="date"
            min={from || today}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-input focus:ring-ring h-10 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-2"
          />
        </label>
      </div>

      {loading && (
        <p className="text-muted-foreground text-sm">
          Checking availability...
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
                Available for your dates
              </p>
              <p className="mt-0.5 text-sm">
                {days} day{days === 1 ? "" : "s"} -{" "}
                <span className="font-display font-bold">
                  {quote.totalPrice} EUR
                </span>{" "}
                total
              </p>
            </>
          ) : (
            <p className="text-destructive text-sm font-semibold">
              Already booked for these dates — try adjusting them.
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
        Continue to booking
      </Button>
    </div>
  );
}
