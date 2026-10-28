"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListFilter } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Sort sits with the results it orders, beside the count, rather than among
 * the filters that narrow them. Same URL contract as the filter panel: the
 * query string is the state, and changing the order starts again at page 1.
 */
export function FleetSort() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const change = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "newest") next.delete("sort");
    else next.set("sort", value);
    next.delete("page");
    const search = next.toString();
    startTransition(() => {
      router.push(search ? `/car?${search}` : "/car", { scroll: false });
    });
  };

  return (
    <label className="relative inline-flex items-center">
      <ListFilter
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute left-3 h-4 w-4"
      />
      <select
        aria-label={t("filter.sort")}
        aria-busy={pending}
        value={params.get("sort") ?? "newest"}
        onChange={(event) => change(event.target.value)}
        className="border-border focus-visible:border-ring focus-visible:ring-ring/50 h-11 cursor-pointer rounded-none border bg-transparent pr-9 pl-9 text-sm font-medium transition-opacity outline-none focus-visible:ring-3 aria-busy:opacity-70 sm:h-9"
      >
        <option value="newest">{t("filter.sortNewest")}</option>
        <option value="price-asc">{t("filter.sortPriceLow")}</option>
        <option value="price-desc">{t("filter.sortPriceHigh")}</option>
      </select>
    </label>
  );
}
