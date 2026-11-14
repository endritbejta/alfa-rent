import Link from "next/link";
import type { Locale } from "@/lib/i18n/config";
import type { TranslationKey } from "@/lib/i18n/translations";
import { change } from "@/lib/analytics-metrics";
import { formatEur } from "@/lib/money";
import { formatNumber } from "@/lib/number-format";
import { cn } from "@/lib/utils";

/**
 * The analytics page's layout system, in one place so every module is built
 * from the same few parts and lines up with the others.
 *
 * - One rhythm: modules are separated by a full-width rule and the same
 *   vertical space; subsections inside a module by a lighter rule.
 * - One grid: detail subsections are two thirds for the chart and one third
 *   for what explains it; summary modules share equal columns.
 * - One type scale: an eyebrow (small spaced capitals) names a group, a
 *   display heading names a module, and figures use tabular digits.
 *
 * No cards: boundaries come from rules, whitespace and alignment. The only
 * tinted surface on the page is the reporting toolbar, because it is the
 * one area that is controls rather than content.
 */

export const eyebrowClass =
  "text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase";

/** A numbered top-level module: "01 — Overview", with an optional control. */
export function ModuleHeader({
  index,
  id,
  title,
  description,
  aside,
}: {
  index: string;
  id: string;
  title: string;
  description?: string;
  aside?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-2xl min-w-0">
        <p className={cn(eyebrowClass, "tabular-nums")} aria-hidden>
          {index}
        </p>
        <h2
          id={id}
          className="font-display mt-1 text-xl font-semibold tracking-tight"
        >
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {aside}
    </header>
  );
}

/** A module: the full-width rule above it and the space below its header. */
export function Module({
  labelledBy,
  first = false,
  className,
  children,
}: {
  labelledBy: string;
  /** Directly under the toolbar, whose own rule already divides them. */
  first?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn("space-y-8", !first && "border-t pt-8", className)}
    >
      {children}
    </section>
  );
}

/**
 * A subsection of the detailed analysis: its heading and description on the
 * left of a rule, then the chart (two thirds) beside its breakdown (one
 * third). `wide` content — a table — runs the full width beneath them.
 */
export function Subsection({
  id,
  title,
  description,
  chart,
  side,
  wide,
}: {
  id: string;
  title: string;
  description?: string;
  chart?: React.ReactNode;
  side?: React.ReactNode;
  wide?: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="border-divider space-y-6 border-t pt-6 first:border-t-0 first:pt-0"
    >
      <div className="max-w-2xl">
        <h3 id={id} className="text-base font-semibold tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        )}
      </div>
      {(chart || side) && (
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          {chart && (
            <div
              className={cn(
                "min-w-0",
                side ? "lg:col-span-2" : "lg:col-span-3"
              )}
            >
              {chart}
            </div>
          )}
          {side && <div className="min-w-0 space-y-8">{side}</div>}
        </div>
      )}
      {wide}
    </section>
  );
}

/** A small titled group inside a subsection's side column. */
export function SideGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className={cn(eyebrowClass, "mb-3")}>{title}</h4>
      {children}
    </div>
  );
}

/**
 * One headline figure. Every KPI has the same four lines, in the same
 * order, whether or not each has content — so the four columns stay level:
 * label, figure, change against the comparison, and what it is made of.
 */
export function Kpi({
  label,
  value,
  delta,
  note,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col py-1">
      <dt className={cn(eyebrowClass, "min-h-[2.5em] leading-snug")}>
        {label}
      </dt>
      <dd className="font-display mt-3 text-3xl leading-none font-semibold tracking-tight whitespace-nowrap tabular-nums xl:text-4xl">
        {value}
      </dd>
      <dd className="mt-3 min-h-4 text-xs">{delta}</dd>
      {note && <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>}
    </div>
  );
}

/**
 * The four headline figures as one row: equal columns separated by hairline
 * rules, two by two on a phone. One block, not four widgets.
 */
export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-y-8 lg:grid-cols-4 [&>*]:px-0 lg:[&>*:not(:first-child)]:border-l lg:[&>*:not(:first-child)]:pl-8 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:pl-5 sm:[&>*:nth-child(even)]:pl-8">
      {children}
    </dl>
  );
}

/** The four breakdown modules side by side: four columns, two, then one. */
export function StatModules({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-x-10 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** One breakdown module: a heading and its rows, optionally in sub-groups. */
export function StatModule({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="border-foreground border-t-2 pt-3 pb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-muted-foreground text-xs">{description}</p>
        )}
      </div>
      <dl className="text-sm">{children}</dl>
    </div>
  );
}

/** A labelled split inside a module, e.g. "Today" vs "In the period". */
export function StatGroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pt-4 pb-1 first:pt-0">
      <dt className={cn(eyebrowClass, "text-[10px]")}>{children}</dt>
    </div>
  );
}

/** One row of a breakdown: label left, figure right, optional sub-lines. */
export function StatRow({
  label,
  value,
  sub,
  delta,
  href,
}: {
  label: string;
  value: string;
  sub?: string | null;
  delta?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="border-divider flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <dt className="text-muted-foreground min-w-0">
        {href ? (
          <Link href={href} className="hover:text-foreground hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
        {sub && <span className="block text-[11px]">{sub}</span>}
      </dt>
      <dd className="shrink-0 text-right tabular-nums">
        <span className="font-medium">{value}</span>
        {delta && <span className="block text-[11px]">{delta}</span>}
      </dd>
    </div>
  );
}

/**
 * How a figure moved against the comparison period: the arrow, the
 * percentage and the absolute difference, in ink rather than green and red —
 * more cancellations is "up" too, and the reader knows which way is good.
 * Rates move in percentage points, never a percentage of a percentage.
 */
export function Delta({
  value,
  previous,
  kind,
  locale,
  against,
  noChange,
}: {
  value: number;
  previous: number;
  kind: "eur" | "count" | "pp" | "days";
  locale: Locale;
  against: string;
  noChange: string;
}) {
  const c = change(value, previous, kind === "pp" ? 0.0005 : 0.005);
  const arrow = c.direction === "up" ? "▲" : c.direction === "down" ? "▼" : "–";
  const sign = c.delta > 0 ? "+" : c.delta < 0 ? "−" : "";
  const abs = Math.abs(c.delta);
  const amount =
    kind === "eur"
      ? formatEur(abs, locale, { precision: 0 })
      : kind === "pp"
        ? `${formatNumber(abs * 100, locale, 1)} pp`
        : kind === "days"
          ? formatNumber(abs, locale, 1)
          : formatNumber(abs, locale);
  const percent =
    kind !== "pp" && c.pct !== null
      ? `${formatNumber(Math.abs(c.pct) * 100, locale)}% · `
      : "";
  return (
    <span
      className="text-muted-foreground tabular-nums"
      title={`${against}: ${
        kind === "eur"
          ? formatEur(previous, locale, { precision: 0 })
          : kind === "pp"
            ? `${formatNumber(previous * 100, locale, 1)}%`
            : formatNumber(previous, locale, kind === "days" ? 1 : 0)
      }`}
    >
      <span aria-hidden className="text-foreground mr-1 text-[9px]">
        {arrow}
      </span>
      {c.direction === "flat" ? (
        noChange
      ) : (
        <>
          {percent}
          {sign}
          {amount}
        </>
      )}
      <span className="sr-only"> ({against})</span>
    </span>
  );
}

const GRAIN_LABELS = {
  day: "analytics.grain.day",
  week: "analytics.grain.week",
  month: "analytics.grain.month",
  year: "analytics.grain.year",
} as const satisfies Record<string, TranslationKey>;

/** The charts' granularity: it changes every chart, so it heads them all. */
export function GrainSwitch({
  current,
  options,
  hrefFor,
  label,
  t,
}: {
  current: string;
  options: string[];
  hrefFor: (g: string) => string;
  label: string;
  t: (key: TranslationKey) => string;
}) {
  if (options.length < 2) return null;
  return (
    <nav aria-label={label} className="print:hidden">
      <p className={cn(eyebrowClass, "mb-2")}>{label}</p>
      <ul className="flex border text-xs">
        {options.map((g, i) => (
          <li key={g} className={cn(i > 0 && "border-l")}>
            <Link
              href={hrefFor(g)}
              scroll={false}
              aria-current={g === current ? "true" : undefined}
              className={cn(
                "focus-visible:ring-ring block px-3 py-1.5 font-semibold outline-none focus-visible:ring-2",
                g === current
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
              )}
            >
              {t(GRAIN_LABELS[g as keyof typeof GRAIN_LABELS])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Bars for a breakdown, each with its own formatted value and a sub-line. */
export function Bars({
  items,
  empty,
}: {
  items: { label: string; value: number; text: string; sub?: string }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="text-xs font-semibold tabular-nums">
              {item.text}
            </span>
          </div>
          <div className="bg-secondary h-1.5">
            <div
              className="bg-brand h-full"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          {item.sub && (
            <p className="text-muted-foreground mt-1 text-[11px]">{item.sub}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
