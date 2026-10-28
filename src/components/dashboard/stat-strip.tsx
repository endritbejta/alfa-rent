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
    <dl className="grid grid-cols-2 gap-x-8 gap-y-6 py-2 sm:grid-cols-4 lg:grid-cols-7">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
            {stat.label}
          </dt>
          <dd
            className={cn(
              "font-display mt-2 text-3xl leading-none font-semibold tracking-tight tabular-nums",
              TONES[stat.tone ?? "default"]
            )}
          >
            {stat.value}
          </dd>
          {stat.hint && (
            <dd className="text-muted-foreground mt-1.5 truncate text-xs">
              {stat.hint}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}
