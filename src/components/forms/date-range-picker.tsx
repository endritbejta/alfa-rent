"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Calendar days, not instants.
 *
 * Stored dates are UTC (`timestamp without tz`, pickups written at 10:00Z)
 * while react-day-picker works in local time. Everything below converts by
 * calendar day so the day rendered, the day clicked and the day posted are
 * the same day — `toISOString().slice(0, 10)` on a local-midnight Date
 * silently yields the day before anywhere east of UTC, which includes
 * Kosovo. One place, so five forms cannot each get it wrong differently.
 */
export const toLocalDay = (d: Date) =>
  new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** A picked local Date -> "yyyy-MM-dd", which the server reads as UTC midnight. */
export const toDateValue = (d: Date) => format(d, "yyyy-MM-dd");

/** "yyyy-MM-dd" -> the local Date standing for that calendar day. */
export function fromDateValue(value: string | null | undefined) {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}

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
 * Single-date trigger on the same calendar the rest of the app uses.
 *
 * A native <input type="date"> was here before: it renders the OS picker,
 * which ignores the app's theme entirely and shows a locale format
 * (dd.mm.yyyy) that matches nothing else on the page. `min`/`max` also only
 * shape validation there — the OS still lets you page to a month where
 * nothing is selectable. Here, out-of-range days are visibly disabled.
 */
export function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  placeholder = "Choose a date",
  id,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  id?: string;
}) {
  const disabled = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        className="border-input bg-card hover:bg-secondary focus-visible:ring-brand flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <CalendarDays className="text-brand h-3.5 w-3.5 shrink-0" />
        <span className={cn(!value && "text-muted-foreground")}>
          {value ? format(value, "dd MMM yyyy") : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto rounded-2xl p-2 shadow-2xl"
      >
        <Calendar
          mode="single"
          // Open where the choice actually is, not on today — an extension
          // window can sit months out.
          defaultMonth={value ?? minDate}
          selected={value}
          onSelect={onChange}
          disabled={disabled.length ? disabled : undefined}
          className="rounded-2xl bg-transparent p-2 [--cell-radius:12px]"
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * DatePicker for a plain FormData form.
 *
 * The picker is a button, not a form control, so the value rides along in a
 * hidden input under `name` — the surrounding <form action={...}> keeps
 * posting exactly what it posted when this was <input type="date">, and the
 * server actions are untouched.
 */
export function DateField({
  name,
  id,
  defaultValue,
  minDate,
  maxDate,
  placeholder,
  clearable = true,
}: {
  name: string;
  id?: string;
  defaultValue?: Date | null;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  /** Optional fields need a way back to empty; required ones do not. */
  clearable?: boolean;
}) {
  const [value, setValue] = useState<Date | undefined>(
    defaultValue ? toLocalDay(defaultValue) : undefined
  );

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <DatePicker
          id={id}
          value={value}
          onChange={setValue}
          minDate={minDate}
          maxDate={maxDate}
          placeholder={placeholder}
        />
      </div>
      {clearable && value && (
        <button
          type="button"
          aria-label="Clear date"
          onClick={() => setValue(undefined)}
          className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer p-1 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        type="hidden"
        name={name}
        value={value ? toDateValue(value) : ""}
      />
    </div>
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
        // The `dark` scope alone is enough: the glass surface derives from
        // --popover, which flips inside it — no hand-set band colours.
        className={cn("w-auto rounded-2xl p-2 shadow-lg", dark && "dark")}
      >
        <RangeCalendar value={value} onChange={onChange} minDate={minDate} />
      </PopoverContent>
    </Popover>
  );
}
