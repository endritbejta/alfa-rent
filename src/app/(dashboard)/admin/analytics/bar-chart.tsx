"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/shared/locale-provider";
import { formatEur } from "@/lib/money";
import { formatNumber } from "@/lib/number-format";
import { cn } from "@/lib/utils";

export type ChartTone = "solid" | "soft" | "hatch" | "neutral";

export type ChartBucket = {
  key: string;
  /** Short label under the axis. */
  axis: string;
  /** Full name for the tooltip: "Tuesday, 3 Nov 2026", "October 2026". */
  title: string;
  /** One value per series, stacked bottom to top in series order. */
  values: number[];
  /** The comparison period's value for the same position, if compared. */
  compare?: number | null;
  compareTitle?: string;
  /** Where a click on the bucket goes, if anywhere. */
  href?: string;
};

export type ValueFormat = "eur" | "count" | "pct" | "days";

/**
 * Stacked bars with an optional comparison marker, drawn as plain SVG.
 *
 * Hand-rolled like the rest of the dashboard's charts: no chart library is
 * installed and these need nothing one would add. Bars rather than an area
 * because a period is a set of separate buckets — a line between two days
 * implies values in between that do not exist.
 *
 * Every bucket answers hover and keyboard focus with a tooltip carrying the
 * exact values, and the same numbers are in a table under the chart for
 * anyone who cannot use the picture.
 */
export function BarChart({
  buckets,
  series,
  compareName,
  format,
  height = 200,
  label,
  tableCaption,
}: {
  buckets: ChartBucket[];
  series: { name: string; tone: ChartTone }[];
  compareName?: string;
  format: ValueFormat;
  height?: number;
  label: string;
  tableCaption: string;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const patternId = useId().replace(/:/g, "");
  const [active, setActive] = useState<number | null>(null);

  const fmt = (value: number) =>
    format === "eur"
      ? formatEur(value, locale, { precision: 0 })
      : format === "pct"
        ? `${formatNumber(value * 100, locale, 1)}%`
        : format === "days"
          ? formatNumber(value, locale, 1)
          : formatNumber(value, locale);

  const totals = buckets.map((b) => b.values.reduce((a, v) => a + v, 0));
  const max = niceMax(
    Math.max(...totals, ...buckets.map((b) => b.compare ?? 0), 0)
  );
  const hasCompare = buckets.some((b) => b.compare != null);

  const W = 720;
  const H = height;
  const top = 8;
  const bottom = H - 4;
  const slot = W / Math.max(buckets.length, 1);
  const barWidth = Math.max(Math.min(slot * 0.64, 36), 2);
  const y = (v: number) => bottom - (v / max) * (bottom - top);
  const labelEvery = Math.ceil(buckets.length / (buckets.length > 20 ? 8 : 12));

  const fill = (tone: ChartTone) =>
    tone === "hatch"
      ? `url(#${patternId})`
      : tone === "neutral"
        ? "var(--muted-foreground)"
        : "var(--brand)";
  const opacity = (tone: ChartTone) =>
    tone === "soft" ? 0.45 : tone === "neutral" ? 0.4 : 1;

  const current = active !== null ? buckets[active] : null;

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{label}</figcaption>
      <Legend
        series={series}
        compareName={hasCompare ? compareName : undefined}
        patternId={patternId}
      />
      <div className="relative mt-3">
        {/* Gridlines' values, outside the SVG so text never stretches. */}
        <div
          aria-hidden
          className="text-muted-foreground pointer-events-none absolute inset-0 text-[10px] tabular-nums"
        >
          {[1, 0.5].map((f) => (
            <span
              key={f}
              className="absolute right-0 -translate-y-full pb-0.5"
              style={{ top: `${(y(max * f) / H) * 100}%` }}
            >
              {fmt(max * f)}
            </span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="block w-full overflow-visible"
          // A fixed height, stretched to the width: bars are rectangles and
          // every line is non-scaling, so nothing visibly distorts, and the
          // chart stays readable on a phone instead of shrinking to a strip.
          style={{ height: H }}
          aria-hidden
        >
          <defs>
            <pattern
              id={patternId}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="5" height="5" fill="var(--brand)" opacity="0.12" />
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="5"
                stroke="var(--brand)"
                strokeWidth="2"
                opacity="0.55"
              />
            </pattern>
          </defs>
          {[1, 0.5].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={y(max * f)}
              y2={y(max * f)}
              stroke="var(--divider)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={0}
            x2={W}
            y1={bottom}
            y2={bottom}
            stroke="var(--border)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {buckets.map((bucket, i) => {
            const cx = slot * i + slot / 2;
            let base = bottom;
            return (
              <g key={bucket.key}>
                {active === i && (
                  <rect
                    x={slot * i}
                    y={top}
                    width={slot}
                    height={bottom - top}
                    fill="var(--surface-hover)"
                  />
                )}
                {bucket.values.map((value, s) => {
                  if (value <= 0) return null;
                  const h = bottom - y(value);
                  base -= h;
                  // A 1px surface gap between stacked segments.
                  return (
                    <rect
                      key={s}
                      x={cx - barWidth / 2}
                      y={base + (s > 0 ? 1 : 0)}
                      width={barWidth}
                      height={Math.max(h - (s > 0 ? 1 : 0), 0.5)}
                      fill={fill(series[s]!.tone)}
                      opacity={opacity(series[s]!.tone)}
                    />
                  );
                })}
                {bucket.compare != null && bucket.compare > 0 && (
                  <line
                    x1={cx - Math.min(slot * 0.45, barWidth / 2 + 6)}
                    x2={cx + Math.min(slot * 0.45, barWidth / 2 + 6)}
                    y1={y(bucket.compare)}
                    y2={y(bucket.compare)}
                    stroke="var(--foreground)"
                    strokeOpacity="0.55"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            );
          })}
        </svg>
        {/* Hit targets: one column per bucket, wider than its bar. */}
        <div className="absolute inset-0 flex">
          {buckets.map((bucket, i) => {
            const open = () => bucket.href && router.push(bucket.href);
            return (
              // A real button: focusable, operable by keyboard, and announced
              // with its values. It navigates only when the bucket has a link.
              <button
                key={bucket.key}
                type="button"
                aria-label={`${bucket.title}: ${series
                  .map((s, k) => `${s.name} ${fmt(bucket.values[k] ?? 0)}`)
                  .join(", ")}`}
                className={cn(
                  "focus-visible:ring-ring h-full flex-1 outline-none focus-visible:ring-2",
                  bucket.href ? "cursor-pointer" : "cursor-default"
                )}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={open}
              />
            );
          })}
        </div>
        {current && active !== null && (
          <Tooltip
            left={((active + 0.5) / buckets.length) * 100}
            bucket={current}
            series={series}
            compareName={compareName}
            fmt={fmt}
            patternId={patternId}
            hint={current.href ? t("analytics.chart.clickHint") : undefined}
          />
        )}
      </div>
      <div
        aria-hidden
        className="text-muted-foreground mt-2 flex text-[10px] tabular-nums"
      >
        {buckets.map((bucket, i) => (
          <span key={bucket.key} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? bucket.axis : ""}
          </span>
        ))}
      </div>
      <details className="mt-3 print:hidden">
        <summary className="text-muted-foreground hover:text-foreground w-fit cursor-pointer text-xs">
          {t("analytics.chart.showTable")}
        </summary>
        <div className="mt-2 max-h-72 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">{tableCaption}</caption>
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1 pr-3 font-medium">
                  {t("analytics.chart.period")}
                </th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 pr-3 text-right font-medium">
                    {s.name}
                  </th>
                ))}
                {hasCompare && compareName && (
                  <th className="py-1 text-right font-medium">{compareName}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.key} className="border-t">
                  <td className="py-1 pr-3">{bucket.title}</td>
                  {series.map((s, k) => (
                    <td key={s.name} className="py-1 pr-3 text-right">
                      {fmt(bucket.values[k] ?? 0)}
                    </td>
                  ))}
                  {hasCompare && compareName && (
                    <td className="py-1 text-right">
                      {bucket.compare != null ? fmt(bucket.compare) : "—"}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

function Swatch({ tone, patternId }: { tone: ChartTone; patternId: string }) {
  return (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      <rect
        width="10"
        height="10"
        fill={
          tone === "hatch"
            ? `url(#${patternId})`
            : tone === "neutral"
              ? "var(--muted-foreground)"
              : "var(--brand)"
        }
        opacity={tone === "soft" ? 0.45 : tone === "neutral" ? 0.4 : 1}
      />
    </svg>
  );
}

function Legend({
  series,
  compareName,
  patternId,
}: {
  series: { name: string; tone: ChartTone }[];
  compareName?: string;
  patternId: string;
}) {
  if (series.length < 2 && !compareName) return null;
  return (
    <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <Swatch tone={s.tone} patternId={patternId} />
          {s.name}
        </li>
      ))}
      {compareName && (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="bg-foreground/55 inline-block h-0.5 w-3"
          />
          {compareName}
        </li>
      )}
    </ul>
  );
}

function Tooltip({
  left,
  bucket,
  series,
  compareName,
  fmt,
  patternId,
  hint,
}: {
  left: number;
  bucket: ChartBucket;
  series: { name: string; tone: ChartTone }[];
  compareName?: string;
  fmt: (value: number) => string;
  patternId: string;
  hint?: string;
}) {
  const total = bucket.values.reduce((a, b) => a + b, 0);
  // Kept inside the chart: anchored left, right or centre by position.
  const anchor =
    left < 25
      ? "translate-x-0"
      : left > 75
        ? "-translate-x-full"
        : "-translate-x-1/2";
  return (
    <div
      role="status"
      className={cn(
        "bg-popover text-popover-foreground pointer-events-none absolute top-0 z-10 w-max max-w-64 border px-3 py-2 text-xs shadow-md",
        anchor
      )}
      style={{ left: `${left}%` }}
    >
      <p className="font-medium">{bucket.title}</p>
      <dl className="mt-1.5 space-y-1 tabular-nums">
        {series.map((s, k) => (
          <div key={s.name} className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Swatch tone={s.tone} patternId={patternId} />
              {s.name}
            </dt>
            <dd>{fmt(bucket.values[k] ?? 0)}</dd>
          </div>
        ))}
        {series.length > 1 && (
          <div className="flex justify-between gap-4 border-t pt-1">
            <dt className="text-muted-foreground">Σ</dt>
            <dd className="font-medium">{fmt(total)}</dd>
          </div>
        )}
        {bucket.compare != null && compareName && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {bucket.compareTitle ?? compareName}
            </dt>
            <dd>{fmt(bucket.compare)}</dd>
          </div>
        )}
      </dl>
      {hint && <p className="text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  );
}

/** A round axis maximum just above the data: 1, 2, 2.5 or 5 × 10ⁿ. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}
