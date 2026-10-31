"use client";

import { useState, useTransition } from "react";
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
export function FleetFilters({
  sort,
  summary,
}: {
  sort?: React.ReactNode;
  summary?: React.ReactNode;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  // A transition keeps the current results on screen while the next set
  // loads, and gives the panel something honest to show meanwhile.
  const [pending, startTransition] = useTransition();

  const navigate = (next: URLSearchParams) => {
    next.delete("page");
    const search = next.toString();
    startTransition(() => {
      router.push(search ? `/car?${search}` : "/car", { scroll: false });
    });
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

  const activeCount =
    FILTER_KEYS.filter((key) => params.has(key)).length +
    (params.has("sort") ? 1 : 0);

  /** The applied filters as removable chips, in the order of the panel. */
  const applied: { key: (typeof FILTER_KEYS)[number]; label: string }[] = [];
  const q = params.get("q");
  if (q) applied.push({ key: "q", label: `“${q}”` });
  const category = params.get("category") as VehicleCategory | null;
  if (category && CATEGORY_KEYS[category]) {
    applied.push({ key: "category", label: t(CATEGORY_KEYS[category]) });
  }
  const transmission = params.get("transmission");
  if (transmission === "AUTOMATIC" || transmission === "MANUAL") {
    applied.push({
      key: "transmission",
      label:
        transmission === "AUTOMATIC"
          ? t("vehicle.automatic")
          : t("vehicle.manual"),
    });
  }
  const maxPrice = params.get("maxPrice");
  if (maxPrice) {
    applied.push({
      key: "maxPrice",
      label: t("filter.under", { amount: maxPrice }),
    });
  }

  const remove = (key: (typeof FILTER_KEYS)[number]) => {
    if (key === "q") setQuery("");
    set(key, null);
  };
  const chip = (active: boolean) =>
    cn(
      "min-h-11 rounded-none border px-4 py-2 text-sm transition-[background-color,border-color,color] duration-[var(--motion-hover)] sm:min-h-8 sm:py-1.5",
      active
        ? "border-transparent bg-foreground font-semibold text-background"
        : "text-muted-foreground hover:text-foreground"
    );

  const controls = (
    <div className="space-y-4">
      {/* Sort lives with the results (FleetSort, beside the count), so the
          search gets the panel's full width. */}
      <div>
        <form
          onSubmit={submitSearch}
          className="flex min-w-0 flex-1 items-end gap-6"
        >
          <div className="relative min-w-0 flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-1 h-5 w-5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filter.search")}
              aria-label={t("filter.search")}
              className="focus-visible:border-foreground h-14 border-0 border-b bg-transparent py-3 pr-4 pl-10 text-lg focus-visible:ring-0 sm:h-14 sm:py-3 sm:pr-4 sm:pl-10 md:text-lg"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11 px-8 sm:h-11">
            {t("common.search")}
          </Button>
        </form>
      </div>

      <FilterGroup label={t("filter.category")}>
        <button
          type="button"
          className={chip(!params.get("category"))}
          aria-pressed={!params.get("category")}
          onClick={() => set("category", null)}
        >
          {t("common.all")}
        </button>
        {Object.values(VehicleCategory).map((category) => (
          <button
            key={category}
            type="button"
            className={chip(params.get("category") === category)}
            aria-pressed={params.get("category") === category}
            onClick={() => set("category", category)}
          >
            {t(CATEGORY_KEYS[category])}
          </button>
        ))}
      </FilterGroup>

      <div className="grid gap-5 md:grid-cols-2">
        <FilterGroup label={t("filter.gearbox")}>
          {Object.values(Transmission).map((transmission) => (
            <button
              key={transmission}
              type="button"
              className={chip(params.get("transmission") === transmission)}
              aria-pressed={params.get("transmission") === transmission}
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
              aria-pressed={params.get("maxPrice") === String(cap)}
              onClick={() => set("maxPrice", String(cap))}
            >
              {t("filter.under", { amount: cap })}
            </button>
          ))}
        </FilterGroup>
      </div>
    </div>
  );

  const appliedRow = applied.length > 0 && (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground mr-1 text-xs font-semibold tracking-[0.12em] uppercase">
        {t("filter.applied")}
      </span>
      {applied.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => remove(key)}
          aria-label={t("filter.remove", { label })}
          className="bg-foreground text-background hover:bg-foreground/85 inline-flex min-h-9 items-center gap-1.5 rounded-none py-1 pr-2.5 pl-3.5 text-sm font-medium transition-colors"
        >
          {label}
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ))}
      <button
        type="button"
        onClick={clear}
        className="text-muted-foreground hover:text-foreground min-h-9 px-2 text-sm underline-offset-4 transition-colors hover:underline"
      >
        {t("filter.clear")}
      </button>
    </div>
  );

  return (
    <div
      aria-busy={pending}
      data-pending={pending || undefined}
      className="transition-opacity duration-[var(--motion-hover)] data-[pending]:opacity-70 motion-reduce:transition-none"
    >
      <div className="mt-4 mb-6 flex items-center justify-between gap-3 border-b pb-4 md:hidden">
        {summary}
        <Sheet>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                className="h-11 justify-center gap-2 px-4"
              />
            }
          >
            <SlidersHorizontal />
            {t("filter.open")}
            {activeCount > 0 && (
              <span className="bg-foreground text-background rounded-none px-2 py-0.5 text-[11px]">
                {activeCount}
              </span>
            )}
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] overflow-y-auto rounded-t-none"
          >
            <SheetHeader className="border-b px-5 py-5">
              <SheetTitle>{t("filter.title")}</SheetTitle>
              <SheetDescription>{t("filter.description")}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-5">
              {sort && (
                <fieldset>
                  <legend className="text-muted-foreground mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
                    {t("filter.sort")}
                  </legend>
                  {sort}
                </fieldset>
              )}
              {controls}
            </div>
            <SheetFooter className="bg-popover sticky bottom-0 border-t px-5">
              <SheetClose render={<Button className="w-full" />}>
                {t("filter.showResults")}
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden border-b pb-4 md:block">{controls}</div>

      {appliedRow}
    </div>
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
