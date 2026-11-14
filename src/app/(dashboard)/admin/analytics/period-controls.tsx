"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/shared/locale-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

/**
 * The reporting toolbar: every control that decides what the page reports,
 * in one band — the period being read (named large, with its arrows), how it
 * is compared, the quick periods, and, one step further in, a specific
 * month, year or date range.
 *
 * Every choice is URL state (`p`, `cmp`), so a period is a link the owner
 * can bookmark or send, survives a reload, and the server renders the
 * figures for it — nothing here computes a number. Presets and arrows are
 * plain links; the pickers push a URL. While the server renders, the band
 * dims so a click is visibly taken.
 *
 * Keyed by period on the page, so its local state (the custom range being
 * typed, whether the specific-period row is open) starts fresh each time.
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
  "border-input bg-control focus-visible:ring-ring h-9 w-full rounded-none border px-2.5 text-sm outline-none focus-visible:ring-2";

const eyebrow =
  "text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase";

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
  /** The rest of the page's state, carried across a period change. */
  query: { g?: string; inspect?: string };
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [range, setRange] = useState({ from, to });
  // A month, year or range picked directly is the one thing a preset cannot
  // show, so the row holding those pickers starts open for it.
  const [specificOpen, setSpecificOpen] = useState(preset === null);
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
    <section
      aria-label={t("analytics.reportingPeriod")}
      aria-busy={pending}
      className={cn(
        "bg-card border-b transition-opacity print:border-0 print:bg-transparent",
        pending && "opacity-60"
      )}
    >
      {/* What is being read, and against what. */}
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0">
          <p className={eyebrow}>{t("analytics.reportingPeriod")}</p>
          <div className="mt-1.5 flex items-center gap-1">
            {prev && (
              <Link
                href={href({ p: prev.token })}
                scroll={false}
                aria-label={t("analytics.previousPeriod", {
                  period: prev.label,
                })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring -ml-1.5 p-1 outline-none focus-visible:ring-2 print:hidden"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </Link>
            )}
            <h2
              className="font-display text-2xl leading-tight font-semibold tracking-tight sm:text-3xl"
              aria-live="polite"
            >
              {title}
            </h2>
            {next && (
              <Link
                href={href({ p: next.token })}
                scroll={false}
                aria-label={t("analytics.nextPeriod", { period: next.label })}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring p-1 outline-none focus-visible:ring-2 print:hidden"
              >
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
            {dates}
            {comparisonText && (
              <>
                <span aria-hidden> · </span>
                {comparisonText}
              </>
            )}
          </p>
        </div>

        {kind !== "all" && (
          <nav
            aria-label={t("analytics.compareWith")}
            className="w-full sm:w-auto print:hidden"
          >
            <p className={cn(eyebrow, "mb-2")}>{t("analytics.compareWith")}</p>
            <ul className="flex flex-wrap border text-xs">
              {COMPARE.map((c, i) => (
                <li
                  key={c.mode}
                  className={cn("flex-1 sm:flex-none", i > 0 && "border-l")}
                >
                  <Link
                    href={href({ cmp: c.mode, keepGrain: true })}
                    scroll={false}
                    aria-current={compare === c.mode ? "true" : undefined}
                    className={cn(
                      "focus-visible:ring-ring block px-3 py-2 text-center font-semibold whitespace-nowrap outline-none focus-visible:ring-2",
                      compare === c.mode
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
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

      {/* Choosing another period: presets first, the specific pickers one step in. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-5 py-2.5 sm:px-6 print:hidden">
        <nav aria-label={t("analytics.quickPeriods")} className="min-w-0">
          <ul className="-mx-2 flex flex-wrap text-xs">
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
        <button
          type="button"
          aria-expanded={specificOpen}
          aria-controls={`${ids}-specific`}
          onClick={() => setSpecificOpen((open) => !open)}
          className={cn(
            "focus-visible:ring-ring inline-flex items-center gap-1 px-1 py-1.5 text-xs font-medium outline-none focus-visible:ring-2",
            preset === null
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t("analytics.specificPeriod")}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 transition-transform",
              specificOpen && "rotate-180"
            )}
          />
        </button>
      </div>

      <div
        id={`${ids}-specific`}
        hidden={!specificOpen}
        className="border-t px-5 py-4 sm:px-6 print:hidden"
      >
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <label className="text-muted-foreground grid gap-1 text-[11px] sm:w-44">
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
          <label className="text-muted-foreground grid gap-1 text-[11px] sm:w-28">
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
          <span
            aria-hidden
            className="bg-border mx-2 hidden h-9 w-px self-end sm:block"
          />
          <form
            className="col-span-2 grid grid-cols-2 items-end gap-2 sm:flex"
            aria-label={t("analytics.customRange")}
            onSubmit={(event) => {
              event.preventDefault();
              if (range.from && range.to) {
                go(href({ p: `${range.from}_${range.to}` }));
              }
            }}
          >
            <label
              htmlFor={`${ids}-from`}
              className="text-muted-foreground grid gap-1 text-[11px] sm:w-40"
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
              className="text-muted-foreground grid gap-1 text-[11px] sm:w-40"
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
              className="border-foreground hover:bg-foreground hover:text-background focus-visible:ring-ring col-span-2 h-9 border px-3 text-xs font-semibold transition-colors outline-none focus-visible:ring-2"
            >
              {t("analytics.apply")}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
