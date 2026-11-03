import { cn } from "@/lib/utils";
import type { SeriesPoint } from "@/services/analytics.service";
import { getI18n } from "@/lib/i18n/server";
import { formatNumber } from "@/lib/number-format";

/**
 * Horizontal breakdown bars — distributions, top-N lists, status splits.
 *
 * Values are whole numbers (the analytics service rounds them) and are
 * written in the app's locale, like every other figure: they used to print
 * raw, so top spenders read "12345 EUR" beside "12 345 EUR" elsewhere.
 */
export async function BarList({
  items,
  suffix = "",
  barClassName = "bg-brand",
}: {
  items: (SeriesPoint & { barClassName?: string })[];
  suffix?: string;
  barClassName?: string;
}) {
  const { locale } = await getI18n();
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="text-muted-foreground text-xs font-semibold tabular-nums">
              {formatNumber(item.value, locale)}
              {suffix}
            </span>
          </div>
          <div className="bg-secondary h-1.5 overflow-hidden rounded-none">
            <div
              className={cn(
                "h-full rounded-none transition-[width] duration-200",
                item.barClassName ?? barClassName
              )}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
