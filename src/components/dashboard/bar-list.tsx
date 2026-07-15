import { cn } from "@/lib/utils";
import type { SeriesPoint } from "@/services/analytics.service";

/** Horizontal breakdown bars — distributions, top-N lists, status splits. */
export function BarList({
  items,
  suffix = "",
  barClassName = "bg-brand",
}: {
  items: (SeriesPoint & { barClassName?: string })[];
  suffix?: string;
  barClassName?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="text-muted-foreground text-xs font-semibold tabular-nums">
              {item.value}
              {suffix}
            </span>
          </div>
          <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200",
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
