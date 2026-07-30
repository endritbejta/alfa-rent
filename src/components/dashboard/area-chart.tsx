"use client";

import type { SeriesPoint } from "@/services/analytics.service";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Dependency-free SVG area chart. Server-rendered, theme-aware via
 * currentColor and CSS variables, scales fluidly with its container.
 */
export function AreaChart({
  data,
  suffix = "",
  height = 160,
}: {
  data: SeriesPoint[];
  suffix?: string;
  height?: number;
}) {
  const { t } = useI18n();
  if (data.length === 0) return null;
  const w = 600;
  const h = height;
  const padX = 4;
  const padY = 12;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = (w - padX * 2) / Math.max(data.length - 1, 1);
  const y = (v: number) => h - padY - (v / max) * (h - padY * 2);
  const pts = data.map((d, i) => [padX + i * stepX, y(d.value)] as const);

  const line = pts
    .map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`)
    .join(" ");
  const area = `${line} L${pts[pts.length - 1][0]},${h - padY} L${padX},${h - padY} Z`;
  const last = pts[pts.length - 1];
  const gridYs = [0.25, 0.5, 0.75].map((f) => padY + f * (h - padY * 2));
  const showEvery = Math.ceil(data.length / 6);

  return (
    <div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="text-brand h-auto w-full"
        role="img"
        aria-label={t("admin.trendChart", {
          value: `${data[data.length - 1].value}${suffix}`,
        })}
      >
        {gridYs.map((gy) => (
          <line
            key={gy}
            x1={padX}
            x2={w - padX}
            y1={gy}
            y2={gy}
            stroke="var(--border)"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="currentColor" opacity="0.09" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={last[0]} cy={last[1]} r="4" fill="currentColor" />
        <circle
          cx={last[0]}
          cy={last[1]}
          r="8"
          fill="currentColor"
          opacity="0.15"
        />
      </svg>
      <div className="text-muted-foreground mt-2 flex justify-between text-[10px] tabular-nums">
        {data.map((d, i) =>
          i % showEvery === 0 || i === data.length - 1 ? (
            <span key={`${d.label}-${i}`}>{d.label}</span>
          ) : null
        )}
      </div>
    </div>
  );
}
