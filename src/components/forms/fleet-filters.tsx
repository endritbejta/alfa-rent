"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { VehicleCategory, Transmission } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const CATEGORY_KEYS: Record<VehicleCategory, TranslationKey> = {
  ECONOMY: "filter.economy",
  COMPACT: "filter.compact",
  SEDAN: "filter.sedan",
  SUV: "filter.suv",
  LUXURY: "filter.luxury",
  VAN: "filter.van",
};

const FILTER_KEYS = ["q", "category", "transmission", "maxPrice"] as const;

/**
 * The URL remains the source of truth. Desktop exposes the complete control
 * set; mobile keeps the first viewport focused on vehicles and moves the same
 * controls into a spatially anchored sheet.
 */
export function FleetFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");

  const navigate = (next: URLSearchParams) => {
    next.delete("page");
    const search = next.toString();
    router.push(search ? `/car?${search}` : "/car", { scroll: false });
  };

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null || next.get(key) === value) next.delete(key);
    else next.set(key, value);
    navigate(next);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const next = new URLSearchParams(params.toString());
    const value = query.trim();
    if (value) next.set("q", value);
    else next.delete("q");
    navigate(next);
  };

  const clear = () => {
    const next = new URLSearchParams(params.toString());
    FILTER_KEYS.forEach((key) => next.delete(key));
    next.delete("sort");
    setQuery("");
    navigate(next);
  };

  const activeCount = FILTER_KEYS.filter((key) => params.has(key)).length;
  const chip = (active: boolean) =>
    cn(
      "min-h-11 rounded-full border px-4 py-2 text-sm transition-[background-color,border-color,color] duration-[var(--motion-hover)] sm:min-h-8 sm:py-1.5",
      active
        ? "border-transparent bg-foreground font-semibold text-background"
        : "bg-card text-muted-foreground hover:text-foreground"
    );

  const controls = (
    <div className="space-y-5">
      <form onSubmit={submitSearch} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("filter.search")}
            aria-label={t("filter.search")}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          {t("common.search")}
        </Button>
      </form>

      <FilterGroup label={t("filter.category")}>
        <button
          type="button"
          className={chip(!params.get("category"))}
          onClick={() => set("category", null)}
        >
          {t("common.all")}
        </button>
        {Object.values(VehicleCategory).map((category) => (
          <button
            key={category}
            type="button"
            className={chip(params.get("category") === category)}
            onClick={() => set("category", category)}
          >
            {t(CATEGORY_KEYS[category])}
          </button>
        ))}
      </FilterGroup>

      <FilterGroup label={t("filter.gearbox")}>
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
      </FilterGroup>

      <FilterGroup label={t("filter.budget")}>
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
      </FilterGroup>

      <label className="block space-y-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
          {t("filter.sort")}
        </span>
        <select
          value={params.get("sort") ?? "newest"}
          onChange={(event) =>
            set(
              "sort",
              event.target.value === "newest" ? null : event.target.value
            )
          }
          className="border-input bg-control focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 sm:h-9"
        >
          <option value="newest">{t("filter.sortNewest")}</option>
          <option value="price-asc">{t("filter.sortPriceLow")}</option>
          <option value="price-desc">{t("filter.sortPriceHigh")}</option>
        </select>
      </label>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between gap-3 md:hidden">
        <Sheet>
          <SheetTrigger
            render={<Button variant="outline" className="justify-between" />}
          >
            <SlidersHorizontal />
            {t("filter.open")}
            {activeCount > 0 && (
              <span className="bg-foreground text-background rounded-full px-2 py-0.5 text-[11px]">
                {activeCount}
              </span>
            )}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] overflow-y-auto rounded-t-3xl"
          >
            <SheetHeader className="border-b px-5 py-5">
              <SheetTitle>{t("filter.title")}</SheetTitle>
              <SheetDescription>{t("filter.description")}</SheetDescription>
            </SheetHeader>
            <div className="px-5">{controls}</div>
            <SheetFooter className="bg-popover sticky bottom-0 border-t px-5">
              <SheetClose render={<Button className="w-full" />}>
                {t("filter.showResults")}
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground flex min-h-11 items-center gap-1.5 text-sm transition-colors"
          >
            <X className="h-4 w-4" />
            {t("filter.clear")}
          </button>
        )}
      </div>

      <div className="bg-card hidden rounded-2xl p-5 shadow-xs md:block">
        {controls}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-muted-foreground hover:text-foreground mt-5 inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <X className="h-4 w-4" />
            {t("filter.clear")}
          </button>
        )}
      </div>
    </>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
        {label}
      </legend>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </fieldset>
  );
}
