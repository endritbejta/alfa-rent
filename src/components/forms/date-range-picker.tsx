"use client";

import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Soft red range fill with brand-red endpoints. The selected day itself is
 * already brand red because the shadcn Calendar reads --primary, which is
 * Alfa red — these overrides only theme the range band and its radii.
 */
const RANGE_CLASSNAMES = {
  range_start:
    "relative isolate z-0 rounded-l-xl bg-[var(--brand)]/20 after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-[var(--brand)]/20",
  range_middle: "rounded-none bg-[var(--brand)]/15",
  range_end:
    "relative isolate z-0 rounded-r-xl bg-[var(--brand)]/20 after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-[var(--brand)]/20",
};

/** The themed calendar itself — reusable outside a popover if needed. */
export function RangeCalendar({
  value,
  onChange,
  minDate,
  numberOfMonths = 1,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  minDate?: Date;
  numberOfMonths?: number;
}) {
  return (
    <Calendar
      mode="range"
      numberOfMonths={numberOfMonths}
      defaultMonth={value?.from}
      selected={value}
      onSelect={onChange}
      disabled={minDate ? { before: minDate } : undefined}
      className="rounded-2xl bg-transparent p-2 [--cell-radius:12px]"
      classNames={RANGE_CLASSNAMES}
    />
  );
}

/**
 * Two-field trigger (Pickup / Return) that opens one range calendar.
 * `tone` adapts it to the near-black hero or a light admin surface;
 * `minDate` is omitted for staff so a walk-in that already started can
 * still be logged.
 */
export function DateRangePicker({
  value,
  onChange,
  tone = "dark",
  minDate,
  labels = { from: "Pickup", to: "Return" },
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  tone?: "dark" | "light";
  minDate?: Date;
  labels?: { from: string; to: string };
}) {
  const dark = tone === "dark";
  const label = (d: Date | undefined) =>
    d ? format(d, "dd MMM yyyy") : "Add date";

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "grid flex-1 cursor-pointer grid-cols-2 overflow-hidden rounded-xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:outline-none",
          dark
            ? "divide-x divide-white/10 bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/[0.09]"
            : "border-input divide-input bg-card hover:bg-secondary divide-x border"
        )}
      >
        {(
          [
            { text: labels.from, date: value?.from },
            { text: labels.to, date: value?.to },
          ] as const
        ).map((field) => (
          <span key={field.text} className="block px-4 py-2.5">
            <span
              className={cn(
                "block text-[11px] font-semibold tracking-wide uppercase",
                dark ? "text-band-muted" : "text-muted-foreground"
              )}
            >
              {field.text}
            </span>
            <span
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-sm",
                dark ? "text-white" : "text-foreground"
              )}
            >
              <CalendarDays
                className={cn(
                  "h-3.5 w-3.5",
                  dark ? "text-band-muted" : "text-brand"
                )}
              />
              {label(field.date)}
            </span>
          </span>
        ))}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-auto rounded-2xl p-2 shadow-2xl",
          dark && "dark bg-band border-band-border"
        )}
      >
        <RangeCalendar value={value} onChange={onChange} minDate={minDate} />
      </PopoverContent>
    </Popover>
  );
}
