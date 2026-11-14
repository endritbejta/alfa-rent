import { format } from "date-fns";
import { businessDay } from "@/lib/business-time";

/**
 * Reporting buckets as branch calendar days.
 *
 * A bucket is named by the `YYYY-MM-DD` key of its first day — the same
 * string Postgres produces with `to_char(date_trunc(unit, day), 'YYYY-MM-DD')`
 * — so the series built here and the sums the database returns line up by
 * plain string equality, with no instant or timezone in between.
 *
 * Weeks start on Monday, as `date_trunc('week', …)` and businessWeekStart do.
 */
export type BucketUnit = "day" | "week" | "month" | "year";

// Calendar arithmetic is done on UTC dates, which have no daylight saving, so
// adding a day or a month never lands on the wrong date.
function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The first day of the bucket that contains the calendar day `key`. */
export function bucketStart(unit: BucketUnit, key: string): string {
  const date = parseKey(key);
  if (unit === "day") return key;
  if (unit === "year") return `${key.slice(0, 4)}-01-01`;
  if (unit === "month") return `${key.slice(0, 7)}-01`;
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return toKey(date);
}

/** The start of the bucket `n` buckets after (or, if negative, before) `start`. */
export function shiftBucket(
  unit: BucketUnit,
  start: string,
  n: number
): string {
  const date = parseKey(bucketStart(unit, start));
  if (unit === "year") {
    return toKey(new Date(Date.UTC(date.getUTCFullYear() + n, 0, 1)));
  }
  if (unit === "month") {
    return toKey(
      new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1))
    );
  }
  date.setUTCDate(date.getUTCDate() + n * (unit === "day" ? 1 : 7));
  return toKey(date);
}

/**
 * The last `count` buckets up to and including the one holding today's
 * branch-local day. `end` is the start of the bucket after the current one,
 * so `[starts[0], end)` is the whole window, the current bucket included in
 * full.
 */
export function businessBuckets(
  unit: BucketUnit,
  count: number,
  now = new Date()
): { starts: string[]; end: string } {
  const current = bucketStart(unit, businessDay(now));
  const starts = Array.from({ length: count }, (_, i) =>
    shiftBucket(unit, current, i - (count - 1))
  );
  return { starts, end: shiftBucket(unit, current, 1) };
}

const LABEL_FORMAT: Record<BucketUnit, string> = {
  day: "dd MMM",
  week: "dd MMM",
  month: "MMM",
  year: "yyyy",
};

/**
 * Chart label for a bucket. Formatted from noon UTC of its first day, which is
 * the same calendar day in every timezone a server runs in — formatting the
 * Belgrade-midnight instant instead labels November "Oct" on a UTC runtime.
 */
export function bucketLabel(unit: BucketUnit, start: string): string {
  return format(new Date(`${start}T12:00:00.000Z`), LABEL_FORMAT[unit]);
}
