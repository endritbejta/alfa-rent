"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDays, format, startOfToday } from "date-fns";
import { Search } from "lucide-react";
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
 * today and Economy pre-selected, so "Search" works on first click. State
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
  const [category, setCategory] = useState<VehicleCategory | "">("ECONOMY");

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

      <label className="block md:w-56">
        <span className="text-band-muted mb-1.5 block text-[11px] font-semibold tracking-wide uppercase">
          {t("filter.category")}
        </span>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as VehicleCategory | "")}
          className="[&>option]:bg-card [&>option]:text-card-foreground h-11 w-full cursor-pointer rounded-xl border-0 bg-white/10 px-3 text-sm text-white ring-1 ring-white/15 outline-none focus:ring-2 focus:ring-[var(--brand)]"
        >
          <option value="">{t("filter.anyCategory")}</option>
          {Object.values(VehicleCategory).map((c) => (
            <option key={c} value={c}>
              {t(CATEGORY_KEYS[c])}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        className="bg-brand hover:bg-brand-hover flex h-11 cursor-pointer items-center justify-center gap-2 self-end rounded-xl px-7 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.03] active:scale-100"
      >
        <Search className="h-4 w-4" />
        {t("common.search")}
      </button>
    </form>
  );
}
