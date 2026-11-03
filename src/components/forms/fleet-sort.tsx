"use client";

import { ListFilter } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOptimisticParams } from "@/lib/use-optimistic-params";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Sort sits with the results it orders, beside the count, rather than among
 * the filters that narrow them. Same URL contract as the filter panel: the
 * query string is the state, and changing the order starts again at page 1.
 */
export function FleetSort({ fill = false }: { fill?: boolean }) {
  const { t } = useI18n();
  // The select is controlled, so with the real params it snapped back to the
  // old order until the server answered; the optimistic ones hold the new
  // choice from the moment it is made.
  const { params, navigate, pending } = useOptimisticParams("/car");

  const change = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "newest") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    navigate(next);
  };

  return (
    <label
      className={cn(
        "relative items-center",
        fill ? "flex w-full" : "inline-flex"
      )}
    >
      <ListFilter
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute left-3 h-4 w-4"
      />
      <select
        aria-label={t("filter.sort")}
        aria-busy={pending}
        value={params.get("sort") ?? "newest"}
        onChange={(event) => change(event.target.value)}
        className={cn(
          "border-border focus-visible:border-ring focus-visible:ring-ring/50 h-11 cursor-pointer rounded-none border bg-transparent pr-9 pl-9 text-sm font-medium transition-opacity outline-none focus-visible:ring-3 aria-busy:opacity-70 sm:h-9",
          fill && "w-full"
        )}
      >
        <option value="newest">{t("filter.sortNewest")}</option>
        <option value="price-asc">{t("filter.sortPriceLow")}</option>
        <option value="price-desc">{t("filter.sortPriceHigh")}</option>
      </select>
    </label>
  );
}
