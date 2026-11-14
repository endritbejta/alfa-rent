import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import type { Locale } from "@/lib/i18n/config";
import { businessDay } from "@/lib/business-time";
import type { BucketUnit } from "@/lib/business-buckets";
import {
  comparisonPeriod,
  parseCompareMode,
  parseGranularity,
  parsePeriod,
  type ReportPeriod,
} from "@/lib/analytics-period";
import { getDataSpan } from "@/services/analytics-report.service";

/**
 * The page's URL state, read once for the page and the CSV export alike so
 * an export is always exactly what the screen showed.
 */
export type AnalyticsSearchParams = {
  p?: string;
  cmp?: string;
  g?: string;
  /**
   * The vehicle whose performance is inspected. Not `vehicle`: that param
   * opens the vehicle drawer on every admin page (drawer-url.ts).
   */
  inspect?: string;
};

export async function resolveAnalyticsParams(
  search: AnalyticsSearchParams,
  now = new Date()
) {
  const today = businessDay(now);
  const span = await getDataSpan();
  const period = parsePeriod(search.p, today, span);
  const compare = parseCompareMode(search.cmp, period);
  const comparison = comparisonPeriod(period, compare);
  const unit = parseGranularity(search.g, period);
  return { today, span, period, compare, comparison, unit };
}

/** The query string for a state, leaving defaults out so URLs stay short. */
export function analyticsQuery(state: {
  p?: string;
  cmp?: string;
  g?: string;
  inspect?: string | null;
}): string {
  const params = new URLSearchParams();
  if (state.p) params.set("p", state.p);
  if (state.cmp && state.cmp !== "prev") params.set("cmp", state.cmp);
  if (state.g) params.set("g", state.g);
  if (state.inspect) params.set("inspect", state.inspect);
  const query = params.toString();
  return query ? `?${query}` : "";
}

// --- Labels -----------------------------------------------------------------
//
// date-fns carries its own Albanian month names, so these read the same on
// the server and in a browser without Albanian ICU data. Every day key is
// formatted from noon UTC, which is that calendar day in any server zone.

const dateLocale = (locale: Locale) => (locale === "sq" ? sq : enUS);
const noon = (day: string) => new Date(`${day}T12:00:00.000Z`);

export function formatDayKey(
  day: string,
  locale: Locale,
  pattern = "d MMM yyyy"
) {
  return format(noon(day), pattern, { locale: dateLocale(locale) });
}

export function monthLabel(month: string, locale: Locale) {
  const text = format(noon(`${month}-01`), "LLLL yyyy", {
    locale: dateLocale(locale),
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A range as "1 – 30 Nov 2026", the year only once when it is shared. */
export function rangeLabel(from: string, to: string, locale: Locale) {
  if (from === to) return formatDayKey(from, locale);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  const sameMonth = sameYear && from.slice(0, 7) === to.slice(0, 7);
  const start = formatDayKey(
    from,
    locale,
    sameMonth ? "d" : sameYear ? "d MMM" : "d MMM yyyy"
  );
  return `${start} – ${formatDayKey(to, locale)}`;
}

/** The headline name of a period: "November 2026", "2026", or its dates. */
export function periodTitle(
  period: Pick<ReportPeriod, "kind" | "from" | "to">,
  locale: Locale
) {
  if (period.kind === "month")
    return monthLabel(period.from.slice(0, 7), locale);
  if (period.kind === "year") return period.from.slice(0, 4);
  // Whole months read better as months: "Sep – Nov 2026".
  if (period.from.endsWith("-01")) {
    const last = new Date(`${period.to}T12:00:00.000Z`);
    last.setUTCDate(last.getUTCDate() + 1);
    if (last.getUTCDate() === 1) {
      const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4);
      if (period.from.slice(0, 7) === period.to.slice(0, 7)) {
        return monthLabel(period.from.slice(0, 7), locale);
      }
      const start = formatDayKey(
        period.from,
        locale,
        sameYear ? "LLL" : "LLL yyyy"
      );
      return `${start} – ${formatDayKey(period.to, locale, "LLL yyyy")}`;
    }
  }
  return rangeLabel(period.from, period.to, locale);
}

/** A chart bucket's short axis label. */
export function bucketAxisLabel(unit: BucketUnit, key: string, locale: Locale) {
  if (unit === "year") return key.slice(0, 4);
  if (unit === "month") return formatDayKey(key, locale, "LLL");
  return formatDayKey(key, locale, "d MMM");
}

/** A chart bucket's full name, for its tooltip. */
export function bucketTitle(
  unit: BucketUnit,
  bucket: { key: string; from: string; to: string },
  locale: Locale
) {
  if (
    unit === "year" &&
    bucket.from.endsWith("-01-01") &&
    bucket.to.endsWith("-12-31")
  ) {
    return bucket.key.slice(0, 4);
  }
  if (unit === "month" && bucket.from === bucket.key) {
    const end = new Date(`${bucket.to}T12:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    if (end.getUTCDate() === 1)
      return monthLabel(bucket.key.slice(0, 7), locale);
  }
  if (unit === "day")
    return formatDayKey(bucket.from, locale, "EEEE, d MMM yyyy");
  return rangeLabel(bucket.from, bucket.to, locale);
}

export function weekdayName(isoDay: number, locale: Locale) {
  // 2026-11-16 is a Monday.
  const day = new Date(Date.UTC(2026, 10, 15 + isoDay, 12));
  return format(day, "EEEE", { locale: dateLocale(locale) });
}

/** Link to the reservations picked up in a range, optionally of one status. */
export function reservationsHref(
  range: { from: string; to: string },
  extra: { status?: string; vehicleId?: string } = {}
) {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (extra.status) params.set("status", extra.status);
  // `vehicleId`, not `vehicle`, which would open the vehicle drawer.
  if (extra.vehicleId) params.set("vehicleId", extra.vehicleId);
  return `/admin/reservations?${params.toString()}`;
}
