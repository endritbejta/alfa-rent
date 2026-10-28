"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfToday } from "date-fns";
import { ChevronDown, Search } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { VehicleCategory } from "@prisma/client";
import { DateRangePicker } from "@/components/forms/date-range-picker";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

const CATEGORY_KEYS: Record<VehicleCategory, TranslationKey> = {
  ECONOMY: "filter.economy",
  COMPACT: "filter.compact",
  SEDAN: "filter.sedan",
  SUV: "filter.suv",
  LUXURY: "filter.luxury",
  VAN: "filter.van",
};

/**
 * Availability-first hero search with smart defaults: a 3-day window from
 * today and every category, so "Search" works on first click and shows the
 * whole available fleet. Economy used to be pre-selected, which hid most
 * cars from a first search; narrowing is one click away on either page. State
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
  const [category, setCategory] = useState<VehicleCategory | "">("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (range?.from) params.set("from", format(range.from, "yyyy-MM-dd"));
    if (range?.to) params.set("to", format(range.to, "yyyy-MM-dd"));
    if (category) params.set("category", category);
    router.push(`/car?${params.toString()}`);
  };

  return (
    <form
      onSubmit={submit}
      className="mt-10 flex w-full flex-col gap-3 rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm md:flex-row md:items-stretch"
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

      {/* Built like the date fields beside it (label inside the box), so the
          three controls share one height and one baseline. */}
      <label className="relative block cursor-pointer rounded-xl bg-white/[0.06] px-4 py-2.5 ring-1 ring-white/10 transition-colors focus-within:ring-2 focus-within:ring-[var(--brand)] hover:bg-white/[0.08] md:w-56">
        <span className="text-band-muted block text-[11px] font-semibold tracking-wide uppercase">
          {t("filter.category")}
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as VehicleCategory | "")}
          className="[&>option]:bg-card [&>option]:text-card-foreground mt-0.5 block w-full cursor-pointer appearance-none bg-transparent pr-7 text-sm text-white outline-none"
        >
          <option value="">{t("filter.anyCategory")}</option>
          {Object.values(VehicleCategory).map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_KEYS[c])}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="text-band-muted pointer-events-none absolute right-4 bottom-3 h-4 w-4"
        />
      </label>

      <button
        type="submit"
        className="bg-brand hover:bg-brand-hover flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-7 text-sm font-semibold text-white transition-[background-color,transform] duration-[var(--motion-press)] ease-[var(--ease-standard)] active:scale-[0.97] motion-reduce:transition-colors md:h-auto md:w-auto"
      >
        <Search className="h-4 w-4" />
        {t("common.search")}
      </button>
    </form>
  );
}
