import {
  type BucketUnit,
  bucketStart,
  shiftBucket,
} from "@/lib/business-buckets";
import { rentalDaysBetween } from "@/lib/rental-dates";

/**
 * The analytics page's reporting period, as branch calendar days.
 *
 * Everything here is pure calendar arithmetic on `yyyy-MM-dd` keys — the
 * model rental dates already live in (see business-time.ts) — so a period
 * never depends on the server's time zone or on a DST change. "Today" comes
 * in as a key from `businessDay(now)`; nothing in this module reads a clock.
 *
 * A period is always a closed range of days, `from` through `to`, both
 * included, like a rental. Its `kind` only decides how it is navigated and
 * compared: a month steps by months, a year by years, anything else by its
 * own length.
 *
 * The URL holds one token, `p`:
 *   `2026-11`                 a calendar month
 *   `2026`                    a calendar year
 *   `2026-03-01_2026-08-31`   a custom range
 *   `this-month`, `last-month`, `this-year`, `last-year`,
 *   `3m`, `6m`, `12m`         presets, resolved against today
 *   `all`                     every day there is data for
 */

export const PERIOD_PRESETS = [
  "this-month",
  "last-month",
  "this-year",
  "last-year",
  "3m",
  "6m",
  "12m",
  "all",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type PeriodKind = "month" | "year" | "range" | "all";

export type ReportPeriod = {
  kind: PeriodKind;
  /** First day, included. */
  from: string;
  /** Last day, included. */
  to: string;
  /** The preset it was chosen through, if any — for the picker's state. */
  preset: PeriodPreset | null;
  /** The canonical `p` value for exactly this period. */
  token: string;
};

export const DEFAULT_PERIOD: PeriodPreset = "this-month";

export type CompareMode = "prev" | "yoy" | "none";

const DAY_KEY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const YEAR_KEY = /^\d{4}$/;
/** Years the picker accepts; outside them a token is treated as garbage. */
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/** True for a real calendar day — `2026-02-30` is not one. */
export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return date.toISOString().slice(0, 10) === value;
}

/** The day `n` days after (or, if negative, before) `day`. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** The last day of the month `month` (`yyyy-MM`). */
export function monthEnd(month: string): string {
  return addDays(shiftBucket("month", `${month}-01`, 1), -1);
}

/** Days in a period, both ends included. */
export function periodDays(period: { from: string; to: string }): number {
  return rentalDaysBetween(period.from, period.to);
}

function monthPeriod(month: string, preset: PeriodPreset | null): ReportPeriod {
  return {
    kind: "month",
    from: `${month}-01`,
    to: monthEnd(month),
    preset,
    token: month,
  };
}

function yearPeriod(year: string, preset: PeriodPreset | null): ReportPeriod {
  return {
    kind: "year",
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    preset,
    token: year,
  };
}

function rangePeriod(
  from: string,
  to: string,
  preset: PeriodPreset | null = null
): ReportPeriod {
  return { kind: "range", from, to, preset, token: `${from}_${to}` };
}

const inYears = (key: string) => {
  const year = Number(key.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
};

/**
 * Reads `p`. Anything unreadable falls back to the default period rather
 * than erroring: it is a bookmarkable filter, not input that changes data.
 *
 * `dataSpan` bounds "all time": the first and last rental day on record, or
 * null when there are none (then all time is just today).
 */
export function parsePeriod(
  raw: string | undefined | null,
  today: string,
  dataSpan: { first: string; last: string } | null
): ReportPeriod {
  const value = (raw ?? "").trim();
  const thisMonth = today.slice(0, 7);
  const thisYear = today.slice(0, 4);

  switch (value) {
    case "this-month":
      return monthPeriod(thisMonth, "this-month");
    case "last-month":
      return monthPeriod(
        shiftBucket("month", `${thisMonth}-01`, -1).slice(0, 7),
        "last-month"
      );
    case "this-year":
      return yearPeriod(thisYear, "this-year");
    case "last-year":
      return yearPeriod(String(Number(thisYear) - 1), "last-year");
    case "3m":
    case "6m":
    case "12m": {
      // Whole calendar months ending with the current one, so every bucket
      // is a full month and "last 3 months" in November is Sep–Nov.
      const months = Number(value.slice(0, -1));
      const from = shiftBucket("month", `${thisMonth}-01`, -(months - 1));
      return rangePeriod(from, monthEnd(thisMonth), value);
    }
    case "all": {
      const first = dataSpan && dataSpan.first < today ? dataSpan.first : today;
      const last = dataSpan && dataSpan.last > today ? dataSpan.last : today;
      return {
        kind: "all",
        from: first,
        to: last,
        preset: "all",
        token: "all",
      };
    }
  }

  const month = MONTH_KEY.exec(value);
  if (month && inYears(value)) return monthPeriod(value, null);
  if (YEAR_KEY.test(value) && inYears(value)) return yearPeriod(value, null);

  const [from, to, extra] = value.split("_");
  if (
    extra === undefined &&
    from &&
    to &&
    isDayKey(from) &&
    isDayKey(to) &&
    inYears(from) &&
    inYears(to)
  ) {
    // A reversed range is the same range; nobody means an empty one.
    const [a, b] = from <= to ? [from, to] : [to, from];
    return rangePeriod(a, b);
  }

  return parsePeriod(DEFAULT_PERIOD, today, dataSpan);
}

/**
 * The month or year before/after, for the arrows beside a month or a year.
 * Ranges and "all time" have no neighbours: their arrows would have to guess
 * whether "next" means the next N days or the next N months.
 */
export function stepPeriod(period: ReportPeriod, n: -1 | 1): string | null {
  if (period.kind === "month") {
    return shiftBucket("month", period.from, n).slice(0, 7);
  }
  if (period.kind === "year")
    return String(Number(period.from.slice(0, 4)) + n);
  return null;
}

/** Shifts a day by whole years, keeping 29 Feb on the last day of February. */
function shiftYears(day: string, n: number): string {
  const year = Number(day.slice(0, 4)) + n;
  const candidate = `${year}${day.slice(4)}`;
  return isDayKey(candidate) ? candidate : `${year}-02-28`;
}

/** Whether a range is whole calendar months, first day to last day. */
function isWholeMonths(from: string, to: string): boolean {
  return from.endsWith("-01") && monthEnd(to.slice(0, 7)) === to;
}

function monthsBetween(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/**
 * The period a period is compared with.
 *
 * - `prev`: the equivalent period just before — the previous month, the
 *   previous year, the N whole months before N whole months, or the same
 *   number of days immediately before any other range.
 * - `yoy`: the same days one year earlier.
 *
 * "All time" has nothing before it, so it is never compared.
 */
export function comparisonPeriod(
  period: ReportPeriod,
  mode: CompareMode
): { from: string; to: string } | null {
  if (mode === "none" || period.kind === "all") return null;
  if (mode === "yoy") {
    const from = shiftYears(period.from, -1);
    // A month stays a whole month: Feb 2024 is 1–29 Feb, Feb 2025 1–28.
    const to =
      period.kind === "month" || isWholeMonths(period.from, period.to)
        ? monthEnd(shiftYears(period.to, -1).slice(0, 7))
        : shiftYears(period.to, -1);
    return { from, to };
  }
  if (period.kind === "year") {
    return { from: shiftYears(period.from, -1), to: shiftYears(period.to, -1) };
  }
  if (period.kind === "month" || isWholeMonths(period.from, period.to)) {
    const months = monthsBetween(period.from, period.to);
    const from = shiftBucket("month", period.from, -months);
    return { from, to: addDays(period.from, -1) };
  }
  const days = periodDays(period);
  return { from: addDays(period.from, -days), to: addDays(period.from, -1) };
}

export function parseCompareMode(
  raw: string | undefined | null,
  period: ReportPeriod
): CompareMode {
  if (period.kind === "all") return "none";
  if (raw === "prev" || raw === "yoy" || raw === "none") return raw;
  return "prev";
}

const UNITS: BucketUnit[] = ["day", "week", "month", "year"];

/**
 * Chart granularity that suits a period: one month by day, a quarter by
 * week, up to two years by month, longer by year.
 */
export function autoGranularity(period: {
  from: string;
  to: string;
}): BucketUnit {
  const days = periodDays(period);
  if (days <= 62) return "day";
  if (days <= 100) return "week";
  if (monthsBetween(period.from, period.to) <= 25) return "month";
  return "year";
}

/** Most buckets a chart may have before a granularity is refused. */
const MAX_BUCKETS = 400;

/**
 * The granularity asked for, if it makes sense for the period: not finer
 * than 400 buckets, and not coarser than the period itself.
 */
export function parseGranularity(
  raw: string | undefined | null,
  period: { from: string; to: string }
): BucketUnit {
  const unit = UNITS.find((u) => u === raw);
  if (!unit) return autoGranularity(period);
  return allowedGranularities(period).includes(unit)
    ? unit
    : autoGranularity(period);
}

/** The granularities a period can be shown in. */
export function allowedGranularities(period: {
  from: string;
  to: string;
}): BucketUnit[] {
  return UNITS.filter((unit) => {
    const count = periodBuckets(period, unit).length;
    // At least two points to draw, unless even days give only one.
    return count <= MAX_BUCKETS && (count >= 2 || unit === "day");
  });
}

export type PeriodBucket = {
  /** The bucket's first calendar day, as Postgres's date_trunc names it. */
  key: string;
  /** The part of the bucket inside the period: a week can be cut off. */
  from: string;
  to: string;
};

/** The period cut into calendar buckets, each clipped to the period. */
export function periodBuckets(
  period: { from: string; to: string },
  unit: BucketUnit
): PeriodBucket[] {
  const buckets: PeriodBucket[] = [];
  let key = bucketStart(unit, period.from);
  while (key <= period.to) {
    const next = shiftBucket(unit, key, 1);
    buckets.push({
      key,
      from: key < period.from ? period.from : key,
      to: addDays(next, -1) > period.to ? period.to : addDays(next, -1),
    });
    key = next;
    if (buckets.length > 5000) break; // A guard, never reached by parsed input.
  }
  return buckets;
}

/** The part of `period` up to and including `today`, or null if it is all ahead. */
export function elapsedPart(
  period: { from: string; to: string },
  today: string
): { from: string; to: string } | null {
  if (period.from > today) return null;
  return { from: period.from, to: period.to < today ? period.to : today };
}

/** The months between two days, as `yyyy-MM`, newest first — for the picker. */
export function monthOptions(first: string, last: string): string[] {
  const months: string[] = [];
  let month = last.slice(0, 7);
  const stop = first.slice(0, 7);
  while (month >= stop) {
    months.push(month);
    month = shiftBucket("month", `${month}-01`, -1).slice(0, 7);
  }
  return months;
}
