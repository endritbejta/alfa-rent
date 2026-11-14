"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatEur } from "@/lib/money";
import { formatNumber } from "@/lib/number-format";
import { cn } from "@/lib/utils";
import { withDrawerTarget } from "../drawer-url";

export type VehicleRow = {
  id: string;
  label: string;
  category: string;
  revenue: number;
  upcoming: number;
  rentals: number;
  averageValue: number | null;
  averageDuration: number | null;
  rentedDays: number;
  fleetDays: number;
  utilization: number | null;
  share: number | null;
};

type SortKey =
  | "label"
  | "rentals"
  | "rentedDays"
  | "utilization"
  | "revenue"
  | "share"
  | "averageValue"
  | "averageDuration";

const COLUMNS: { key: SortKey; label: TranslationKey; numeric: boolean }[] = [
  { key: "label", label: "analytics.vehicles.vehicle", numeric: false },
  { key: "rentals", label: "analytics.vehicles.rentals", numeric: true },
  { key: "rentedDays", label: "analytics.vehicles.rentedDays", numeric: true },
  {
    key: "utilization",
    label: "analytics.vehicles.utilization",
    numeric: true,
  },
  { key: "revenue", label: "analytics.vehicles.revenue", numeric: true },
  { key: "share", label: "analytics.vehicles.share", numeric: true },
  {
    key: "averageValue",
    label: "analytics.vehicles.averageValue",
    numeric: true,
  },
  {
    key: "averageDuration",
    label: "analytics.vehicles.averageDuration",
    numeric: true,
  },
];

/**
 * Every car's performance in the period, sortable by any column. Sorting is
 * a view of rows already on the page, so it is local state, not a URL
 * round trip. A car's name opens its drawer; "Inspect" shows its own
 * revenue and rented days over the period below the table.
 */
export function VehicleTable({
  rows,
  inspected,
}: {
  rows: VehicleRow[];
  inspected: string | null;
}) {
  const { locale, t } = useI18n();
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({
    key: "revenue",
    desc: true,
  });

  const sorted = [...rows].sort((a, b) => {
    const dir = sort.desc ? -1 : 1;
    if (sort.key === "label") return a.label.localeCompare(b.label) * dir;
    // Rows with no figure sort last whichever way the column runs.
    const av = a[sort.key];
    const bv = b[sort.key];
    if (av === null) return 1;
    if (bv === null) return -1;
    return (av - bv) * dir || a.label.localeCompare(b.label);
  });

  const pct = (v: number | null) =>
    v === null ? "—" : `${formatNumber(v * 100, locale, 1)}%`;
  const eur = (v: number | null) =>
    v === null ? "—" : formatEur(v, locale, { precision: 0 });

  const query = (next: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `?${params.toString()}`;
  };

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-sm">
        {t("analytics.vehicles.empty")}
      </p>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[860px] text-sm tabular-nums">
        <caption className="sr-only">{t("analytics.vehicles.caption")}</caption>
        <thead>
          <tr className="border-b">
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={
                  sort.key === c.key
                    ? sort.desc
                      ? "descending"
                      : "ascending"
                    : undefined
                }
                className={cn(
                  "text-muted-foreground h-9 px-2 text-[11px] font-medium tracking-[0.12em] uppercase first:pl-0",
                  c.numeric ? "text-right" : "text-left"
                )}
              >
                <button
                  type="button"
                  className={cn(
                    "hover:text-foreground focus-visible:ring-ring uppercase outline-none focus-visible:ring-2",
                    sort.key === c.key && "text-foreground"
                  )}
                  onClick={() =>
                    setSort((s) => ({
                      key: c.key,
                      desc: s.key === c.key ? !s.desc : c.key !== "label",
                    }))
                  }
                >
                  {t(c.label)}
                  {sort.key === c.key && (
                    <span aria-hidden> {sort.desc ? "↓" : "↑"}</span>
                  )}
                </button>
              </th>
            ))}
            <th className="w-20" aria-label={t("analytics.vehicles.inspect")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-divider border-b",
                inspected === row.id && "bg-surface-selected"
              )}
            >
              <td className="py-2.5 pr-2">
                <Link
                  href={`?${withDrawerTarget(searchParams.toString(), {
                    kind: "vehicle",
                    id: row.id,
                  })}`}
                  scroll={false}
                  className="hover:underline"
                >
                  {row.label}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  {t(`filter.${row.category.toLowerCase()}` as TranslationKey)}
                </span>
              </td>
              <td className="px-2 text-right">{row.rentals}</td>
              <td className="px-2 text-right">
                {row.rentedDays}
                <span className="text-muted-foreground">
                  {" "}
                  / {row.fleetDays}
                </span>
              </td>
              <td className="px-2 text-right">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="bg-secondary relative hidden h-1 w-14 sm:inline-block"
                  >
                    <span
                      className="bg-brand absolute inset-y-0 left-0"
                      style={{
                        width: `${Math.min((row.utilization ?? 0) * 100, 100)}%`,
                      }}
                    />
                  </span>
                  {pct(row.utilization)}
                </span>
              </td>
              <td className="px-2 text-right font-medium">
                {eur(row.revenue)}
                {row.upcoming > 0 && (
                  <span className="text-muted-foreground block text-xs font-normal">
                    +{eur(row.upcoming)} {t("analytics.vehicles.upcomingShort")}
                  </span>
                )}
              </td>
              <td className="px-2 text-right">{pct(row.share)}</td>
              <td className="px-2 text-right">{eur(row.averageValue)}</td>
              <td className="px-2 text-right">
                {row.averageDuration === null
                  ? "—"
                  : t("analytics.days", {
                      count: formatNumber(row.averageDuration, locale, 1),
                    })}
              </td>
              <td className="pl-2 text-right">
                <Link
                  href={query({
                    inspect: inspected === row.id ? null : row.id,
                  })}
                  scroll={false}
                  className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
                >
                  {inspected === row.id
                    ? t("analytics.vehicles.close")
                    : t("analytics.vehicles.inspect")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
