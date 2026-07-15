"use client";

import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Dark, red-themed range picker for the hero. Built on the shadcn Calendar
 * (which already reads --primary for selection, and --primary is Alfa red),
 * wrapped in a `.dark` popover so it matches the near-black hero. The soft
 * range fill and larger radii are overridden here to the brand red.
 */
export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
}) {
  const label = (d: Date | undefined, fallback: string) =>
    d ? format(d, "dd MMM yyyy") : fallback;

  return (
    <Popover>
      <PopoverTrigger className="grid flex-1 cursor-pointer grid-cols-2 divide-x divide-white/10 overflow-hidden rounded-xl bg-white/[0.06] text-left ring-1 ring-white/10 transition-colors hover:bg-white/[0.09] focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
        <span className="block px-4 py-2.5">
          <span className="text-band-muted block text-[11px] font-semibold tracking-wide uppercase">
            Pickup
          </span>
          <span className="mt-0.5 block text-sm text-white">
            {label(value?.from, "Add date")}
          </span>
        </span>
        <span className="block px-4 py-2.5">
          <span className="text-band-muted block text-[11px] font-semibold tracking-wide uppercase">
            Return
          </span>
          <span className="mt-0.5 block text-sm text-white">
            {label(value?.to, "Add date")}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="dark bg-band border-band-border w-auto rounded-2xl p-2 shadow-2xl"
      >
        <Calendar
          mode="range"
          numberOfMonths={1}
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          disabled={{ before: new Date() }}
          className="rounded-2xl bg-transparent p-2 [--cell-radius:12px]"
          classNames={{
            range_start:
              "relative isolate z-0 rounded-l-xl bg-[var(--brand)]/20 after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-[var(--brand)]/20",
            range_middle: "rounded-none bg-[var(--brand)]/15",
            range_end:
              "relative isolate z-0 rounded-r-xl bg-[var(--brand)]/20 after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-[var(--brand)]/20",
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
