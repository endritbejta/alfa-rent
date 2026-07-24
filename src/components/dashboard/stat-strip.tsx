import { cn } from "@/lib/utils";

const TONES = {
  default: "text-foreground",
  good: "text-status-available",
  warn: "text-status-maint",
  danger: "text-destructive",
};

export type Stat = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: keyof typeof TONES;
};

/**
 * Headline figures as one compact strip instead of a row of cards.
 *
 * Four bordered surfaces with 2xl numerals read as the subject of the page,
 * when the charts underneath are the subject and these are context. Same
 * weight class as the reservations status filter, and it sits in the same
 * spot.
 *
 * Deliberately *not* identical to that control: no selected pill, no hover,
 * no cursor change. These are readouts, and there is nothing to pick — a
 * segmented control that cannot be operated is a promise the page breaks.
 */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <dl className="bg-secondary inline-flex w-max items-stretch divide-x rounded-full border">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex items-baseline gap-2 px-4 py-2.5"
          >
            <dt className="text-muted-foreground text-[11px] font-semibold tracking-[0.06em] whitespace-nowrap uppercase">
              {stat.label}
            </dt>
            <dd
              // font-medium, not bold: the strip adopts the light-numeral
              // direction scaled for its size — .metric-num's weight 320 is
              // for display sizes and would go thin at 15px.
              className={cn(
                "font-display text-[15px] font-medium whitespace-nowrap tabular-nums",
                TONES[stat.tone ?? "default"]
              )}
            >
              {stat.value}
            </dd>
            {stat.hint && (
              <dd className="text-muted-foreground max-w-[10rem] truncate text-xs">
                {stat.hint}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}
