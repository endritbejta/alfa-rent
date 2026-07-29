"use client";

import { useState } from "react";
import { addDays, format, isAfter } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

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
  placeholder,
  id,
}: {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  id?: string;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const disabled = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        className="border-input bg-control hover:bg-surface-hover focus-visible:ring-brand flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border px-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <CalendarDays className="text-brand h-3.5 w-3.5 shrink-0" />
        <span className={cn(!value && "text-muted-foreground")}>
          {value
            ? format(value, "dd MMM yyyy", { locale: dateLocale })
            : (placeholder ?? t("date.choose"))}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto rounded-xl p-2">
        <Calendar
          mode="single"
          // Open where the choice actually is, not on today — an extension
          // window can sit months out.
          defaultMonth={value ?? minDate}
          selected={value}
          onSelect={onChange}
          disabled={disabled.length ? disabled : undefined}
          locale={dateLocale}
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
  onChange,
}: {
  name: string;
  id?: string;
  defaultValue?: Date | null;
  minDate?: Date;
  maxDate?: Date;
  placeholder?: string;
  /** Optional fields need a way back to empty; required ones do not. */
  clearable?: boolean;
  onChange?: (date: Date | undefined) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState<Date | undefined>(
    defaultValue ? toLocalDay(defaultValue) : undefined
  );
  const updateValue = (date: Date | undefined) => {
    setValue(date);
    onChange?.(date);
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <DatePicker
          id={id}
          value={value}
          onChange={updateValue}
          minDate={minDate}
          maxDate={maxDate}
          placeholder={placeholder}
        />
      </div>
      {clearable && value && (
        <button
          type="button"
          aria-label={t("date.clear")}
          onClick={() => updateValue(undefined)}
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
 * Two independent calendars that write into one range value.
 *
 * A single range-mode calendar made changing a completed range ambiguous:
 * react-day-picker had to infer whether the next click meant a new pickup or
 * a new return. Each visible field now owns its calendar, so the interaction
 * is deterministic. Moving pickup beyond the current return clears return
 * instead of leaving an invalid range behind.
 *
 * `tone` adapts it to the near-black hero or a light admin surface;
 * `minDate` is omitted for staff so a walk-in that already started can
 * still be logged.
 */
function RangeDateField({
  label,
  value,
  onSelect,
  tone,
  minDate,
  disabled = false,
}: {
  label: string;
  value: Date | undefined;
  onSelect: (date: Date) => void;
  tone: "dark" | "light";
  minDate?: Date;
  disabled?: boolean;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const [open, setOpen] = useState(false);
  const dark = tone === "dark";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "disabled:bg-skeleton disabled:text-muted-foreground w-full cursor-pointer px-4 py-2.5 text-left transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:outline-none disabled:cursor-not-allowed",
          dark ? "hover:bg-white/[0.04]" : "hover:bg-surface-hover"
        )}
      >
        <span
          className={cn(
            "block text-[11px] font-semibold tracking-wide uppercase",
            dark ? "text-band-muted" : "text-muted-foreground"
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "mt-0.5 flex items-center gap-1.5 text-sm",
            dark ? "text-white" : "text-foreground",
            !value && (dark ? "text-band-muted" : "text-muted-foreground")
          )}
        >
          <CalendarDays
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              dark ? "text-band-muted" : "text-brand"
            )}
          />
          {value
            ? format(value, "dd MMM yyyy", { locale: dateLocale })
            : t("date.add")}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-auto rounded-2xl p-2 shadow-lg", dark && "dark")}
      >
        <Calendar
          mode="single"
          defaultMonth={value ?? minDate}
          selected={value}
          onSelect={(date) => {
            if (!date) return;
            onSelect(date);
            setOpen(false);
          }}
          disabled={minDate ? { before: minDate } : undefined}
          locale={dateLocale}
          className="rounded-2xl bg-transparent p-2 [--cell-radius:12px]"
        />
      </PopoverContent>
    </Popover>
  );
}

export function DateRangePicker({
  value,
  onChange,
  tone = "dark",
  minDate,
  labels,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  tone?: "dark" | "light";
  minDate?: Date;
  labels?: { from: string; to: string };
}) {
  const { t } = useI18n();
  const resolvedLabels = labels ?? {
    from: t("booking.pickupDate"),
    to: t("booking.returnDate"),
  };
  const dark = tone === "dark";
  const earliestReturn = value?.from ? addDays(value.from, 1) : minDate;
  const returnMinDate =
    minDate && earliestReturn && isAfter(minDate, earliestReturn)
      ? minDate
      : earliestReturn;

  return (
    <div
      className={cn(
        "grid flex-1 grid-cols-2 divide-x overflow-hidden rounded-xl",
        dark
          ? "divide-white/10 bg-white/[0.06] ring-1 ring-white/10"
          : "border-input divide-input bg-control border"
      )}
    >
      <RangeDateField
        label={resolvedLabels.from}
        value={value?.from}
        tone={tone}
        minDate={minDate}
        onSelect={(from) =>
          onChange({
            from,
            to: value?.to && isAfter(value.to, from) ? value.to : undefined,
          })
        }
      />
      <RangeDateField
        label={resolvedLabels.to}
        value={value?.to}
        tone={tone}
        minDate={returnMinDate}
        disabled={!value?.from}
        onSelect={(to) => onChange({ from: value?.from, to })}
      />
    </div>
  );
}
