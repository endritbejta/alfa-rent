"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfToday } from "date-fns";
import { Search } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Availability-first hero search with smart defaults: a 3-day window from
 * today, so "Search" works on first click and shows the whole available
 * fleet. Category narrowing lives on the fleet page, not here. State
 * is carried to the fleet page as URL params — the shareable source of
 * truth the rest of the flow reads from.
 */
export function HeroSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const today = startOfToday();
  const [range, setRange] = useState<DateRange | undefined>({
    from: today,
    to: addDays(today, 3),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (range?.from) params.set("from", format(range.from, "yyyy-MM-dd"));
    if (range?.to) params.set("to", format(range.to, "yyyy-MM-dd"));
    router.push(`/car?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      className="mt-10 flex w-full flex-col gap-3 border-t border-white/15 pt-5 md:flex-row md:items-stretch"
    >
      <DateRangePicker
        value={range}
        onChange={setRange}
        minDate={today}
        labels={{
          from: t("booking.pickupDate"),
          to: t("booking.returnDate"),
        }}
      />

      <button
        type="submit"
        className="bg-brand hover:bg-brand-hover flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-none px-7 text-sm font-semibold text-white transition-[background-color,transform] duration-[var(--motion-press)] ease-[var(--ease-standard)] active:scale-[0.97] motion-reduce:transition-colors md:h-auto md:w-auto"
      >
        <Search className="h-4 w-4" />
        {t("common.search")}
      </button>
    </form>
  );
}
