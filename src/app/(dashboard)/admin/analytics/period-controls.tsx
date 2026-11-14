"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/**
 * The reporting-period picker. Every choice is URL state (`p`, `cmp`), so a
 * period is a link the owner can bookmark or send, survives a reload, and
 * the server renders the figures for it — nothing here computes a number.
 *
 * Presets and arrows are plain links; the month, year and custom-range
 * inputs push a URL. While the server renders, the strip dims so a click is
 * visibly taken.
 */

const PRESETS: { token: string; label: TranslationKey }[] = [
  { token: "this-month", label: "analytics.preset.thisMonth" },
  { token: "last-month", label: "analytics.preset.lastMonth" },
  { token: "3m", label: "analytics.preset.last3" },
  { token: "6m", label: "analytics.preset.last6" },
  { token: "12m", label: "analytics.preset.last12" },
  { token: "this-year", label: "analytics.preset.thisYear" },
  { token: "last-year", label: "analytics.preset.lastYear" },
  { token: "all", label: "analytics.preset.all" },
];

const COMPARE: { mode: string; label: TranslationKey }[] = [
  { mode: "prev", label: "analytics.compare.prev" },
  { mode: "yoy", label: "analytics.compare.yoy" },
  { mode: "none", label: "analytics.compare.none" },
];

const fieldClass =
  "border-input bg-control focus-visible:ring-ring h-9 rounded-none border px-2.5 text-sm outline-none focus-visible:ring-2";

export function PeriodControls({
  token,
  kind,
  preset,
  title,
  dates,
  prev,
  next,
  months,
  years,
  compare,
  comparisonText,
  from,
  to,
  query,
}: {
  token: string;
  kind: "month" | "year" | "range" | "all";
  preset: string | null;
  title: string;
  /** The period's days, written out: "1 – 30 Nov 2026". */
  dates: string;
  prev: { token: string; label: string } | null;
  next: { token: string; label: string } | null;
  months: { value: string; label: string }[];
  years: string[];
  compare: string;
  comparisonText: string | null;
  from: string;
  to: string;
  /** Builds the page URL for a period and comparison, keeping the rest. */
  query: { g?: string; inspect?: string };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState({ from, to });
  const ids = useId();

  const href = (state: { p?: string; cmp?: string; keepGrain?: boolean }) => {
    const params = new URLSearchParams();
    params.set("p", state.p ?? token);
    const cmp = state.cmp ?? compare;
    if (cmp !== "prev") params.set("cmp", cmp);
    // A granularity belongs to a period: carried only while the period stays.
    if (state.keepGrain && query.g) params.set("g", query.g);
    if (query.inspect) params.set("inspect", query.inspect);
    return `/admin/analytics?${params.toString()}`;
  };
  const go = (url: string) =>
    startTransition(() => router.push(url, { scroll: false }));

  const month = kind === "month" ? token : "";
  const year = kind === "year" ? token : "";

  return (
    <div
      className={cn(
        "space-y-5 transition-opacity print:hidden",
        pending && "opacity-60"
      )}
      aria-busy={pending}
    >
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
            {t("analytics.reportingPeriod")}
          </p>
          <div className="mt-1 flex items-center gap-1">
            {prev && (
              <Link
                href={href({ p: prev.token })}
                scroll={false}
                aria-label={t("analytics.previousPeriod", {
                  period: prev.label,
                })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-2 p-1.5 outline-none focus-visible:ring-2"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Link>
            )}
            <h2
              className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
              aria-live="polite"
            >
              {title}
            </h2>
            {next && (
              <Link
                href={href({ p: next.token })}
                scroll={false}
                aria-label={t("analytics.nextPeriod", { period: next.label })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring p-1.5 outline-none focus-visible:ring-2"
              >
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
            {dates}
            {comparisonText && (
              <>
                {" · "}
                {comparisonText}
              </>
            )}
          </p>
        </div>

        {kind !== "all" && (
          <nav aria-label={t("analytics.compareWith")} className="text-xs">
            <p className="text-muted-foreground mb-1.5">
              {t("analytics.compareWith")}
            </p>
            <ul className="flex border-b">
              {COMPARE.map((c) => (
                <li key={c.mode}>
                  <Link
                    href={href({ cmp: c.mode, keepGrain: true })}
                    scroll={false}
                    aria-current={compare === c.mode ? "true" : undefined}
                    className={cn(
                      "-mb-px block border-b-2 px-3 py-1.5 font-semibold transition-colors",
                      compare === c.mode
                        ? "border-foreground text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent"
                    )}
                  >
                    {t(c.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 border-y py-3">
        <nav aria-label={t("analytics.quickPeriods")} className="min-w-0">
          <ul className="-mx-2 flex flex-wrap gap-y-1 text-xs">
            {PRESETS.map((p) => (
              <li key={p.token}>
                <Link
                  href={href({ p: p.token })}
                  scroll={false}
                  aria-current={preset === p.token ? "true" : undefined}
                  className={cn(
                    "focus-visible:ring-ring block px-2 py-1.5 font-medium outline-none focus-visible:ring-2",
                    preset === p.token
                      ? "text-foreground underline decoration-2 underline-offset-[6px]"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(p.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex flex-wrap items-end gap-3">
          <label className="text-muted-foreground grid gap-1 text-[11px]">
            {t("analytics.month")}
            <select
              className={fieldClass}
              value={month}
              onChange={(e) =>
                e.target.value && go(href({ p: e.target.value }))
              }
            >
              <option value="">—</option>
              {months.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-muted-foreground grid gap-1 text-[11px]">
            {t("analytics.year")}
            <select
              className={fieldClass}
              value={year}
              onChange={(e) =>
                e.target.value && go(href({ p: e.target.value }))
              }
            >
              <option value="">—</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (range.from && range.to) {
                go(href({ p: `${range.from}_${range.to}` }));
              }
            }}
          >
            <label
              htmlFor={`${ids}-from`}
              className="text-muted-foreground grid gap-1 text-[11px]"
            >
              {t("analytics.customFrom")}
              <input
                id={`${ids}-from`}
                type="date"
                required
                className={fieldClass}
                value={range.from}
                max={range.to || undefined}
                onChange={(e) =>
                  setRange((r) => ({ ...r, from: e.target.value }))
                }
              />
            </label>
            <label
              htmlFor={`${ids}-to`}
              className="text-muted-foreground grid gap-1 text-[11px]"
            >
              {t("analytics.customTo")}
              <input
                id={`${ids}-to`}
                type="date"
                required
                className={fieldClass}
                value={range.to}
                min={range.from || undefined}
                onChange={(e) =>
                  setRange((r) => ({ ...r, to: e.target.value }))
                }
              />
            </label>
            <button
              type="submit"
              className="border-foreground hover:bg-foreground hover:text-background focus-visible:ring-ring h-9 border px-3 text-xs font-semibold transition-colors outline-none focus-visible:ring-2"
            >
              {t("analytics.apply")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
