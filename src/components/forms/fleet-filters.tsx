"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { VehicleCategory, Transmission } from "@prisma/client";
import { cn } from "@/lib/utils";
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
 * Filters write to the URL, the server component reads them — the URL
 * is the single source of truth, so filtered views are shareable.
 */
export function FleetFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || next.get(key) === value) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    router.push(`/car?${next.toString()}`, { scroll: false });
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-4 py-1.5 text-sm transition-colors",
      active
        ? "border-transparent bg-foreground text-background font-semibold"
        : "bg-card text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          {t("filter.category")}
        </span>
        <button
          type="button"
          className={chip(!params.get("category"))}
          onClick={() => set("category", null)}
        >
          {t("common.all")}
        </button>
        {Object.values(VehicleCategory).map((c) => (
          <button
            key={c}
            type="button"
            className={chip(params.get("category") === c)}
            onClick={() => set("category", c)}
          >
            {t(CATEGORY_KEYS[c])}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          {t("filter.gearbox")}
        </span>
        {Object.values(Transmission).map((transmission) => (
          <button
            key={transmission}
            type="button"
            className={chip(params.get("transmission") === transmission)}
            onClick={() => set("transmission", transmission)}
          >
            {transmission === "AUTOMATIC"
              ? t("vehicle.automatic")
              : t("vehicle.manual")}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground mr-1 w-24 text-xs font-semibold tracking-[0.12em] uppercase">
          {t("filter.budget")}
        </span>
        {[40, 60, 100].map((cap) => (
          <button
            key={cap}
            type="button"
            className={chip(params.get("maxPrice") === String(cap))}
            onClick={() => set("maxPrice", String(cap))}
          >
            {t("filter.under", { amount: cap })}
          </button>
        ))}
      </div>
    </div>
  );
}
