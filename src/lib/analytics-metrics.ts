import { periodDays } from "@/lib/analytics-period";

/**
 * The arithmetic behind the analytics page's figures, kept apart from the
 * queries so each rule is written once and tested without a database.
 */

/** Below this many cases a rate is shown with its counts and marked as thin. */
export const SMALL_SAMPLE = 10;

/** `part / whole`, or null when there is no whole to divide by. */
export function ratio(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

export type Change = {
  previous: number;
  /** current − previous. */
  delta: number;
  /** The change as a fraction of the previous value; null from zero. */
  pct: number | null;
  direction: "up" | "down" | "flat";
};

/**
 * How a figure moved against its comparison period. A percentage from zero
 * is undefined, not infinite: "from 0 to 340 EUR" is shown as the amount.
 * Money differences under half a cent are "flat", so rounding noise is not
 * news; a rate passes its own threshold (a twentieth of a point).
 */
export function change(
  current: number,
  previous: number,
  /** Below this the move is noise: half a cent for money; pass less for rates. */
  epsilon = 0.005
): Change {
  const delta = current - previous;
  const direction =
    Math.abs(delta) < epsilon ? "flat" : delta > 0 ? "up" : "down";
  return {
    previous,
    delta,
    pct: previous !== 0 ? delta / Math.abs(previous) : null,
    direction,
  };
}

/** Rounds money to cents, the precision the database stores. */
export function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The days a vehicle was part of the fleet, for utilisation.
 *
 * There is no "in service from / to" column, so this is derived:
 *
 * - It starts on the day the record was created, or on its first rental if
 *   that is earlier (cars entered after the fact with their history).
 * - A retired (INACTIVE) car ends on the day it was retired — the latest
 *   audit event that set it inactive, else the record's last update — or on
 *   its last rental day if that is later. Any other car is still in the fleet.
 *
 * A car that was retired and later reactivated counts as in the fleet
 * throughout, and a car deleted outright is gone with its record. A car can
 * only be deleted when it never had a reservation, so this costs no rented
 * day — only some days of its idle time.
 */
export type FleetWindow = { start: string; end: string | null };

export function fleetWindow(vehicle: {
  added: string;
  firstRental: string | null;
  retired: string | null;
  lastRental: string | null;
}): FleetWindow {
  const start =
    vehicle.firstRental && vehicle.firstRental < vehicle.added
      ? vehicle.firstRental
      : vehicle.added;
  if (!vehicle.retired) return { start, end: null };
  const end =
    vehicle.lastRental && vehicle.lastRental > vehicle.retired
      ? vehicle.lastRental
      : vehicle.retired;
  return { start, end: end < start ? start : end };
}

/** Days of `window` inside `range`, both ends counted. */
export function overlapDays(
  window: FleetWindow,
  range: { from: string; to: string }
): number {
  const from = window.start > range.from ? window.start : range.from;
  const to =
    window.end !== null && window.end < range.to ? window.end : range.to;
  return from > to ? 0 : periodDays({ from, to });
}

/**
 * Average fleet size over a range: vehicle-days divided by days. A car added
 * halfway through a month counts as half a car for that month.
 */
export function averageFleet(
  fleetDays: number,
  range: { from: string; to: string } | null
): number {
  return range ? fleetDays / periodDays(range) : 0;
}

export type SeriesPoint = { key: string; value: number };

/**
 * The bucket with the highest (or lowest) value, ignoring empty buckets when
 * looking for the lowest — an empty future month is not the "worst month".
 */
export function extreme(
  points: SeriesPoint[],
  which: "max" | "min"
): SeriesPoint | null {
  const candidates =
    which === "min" ? points.filter((p) => p.value > 0) : points;
  if (candidates.length === 0) return null;
  return candidates.reduce((best, p) =>
    which === "max"
      ? p.value > best.value
        ? p
        : best
      : p.value < best.value
        ? p
        : best
  );
}

/**
 * Whether a series is rising or falling: the mean of its second half
 * against the mean of its first. Needs six points of which at least four
 * carry data, and a move of at least 10%, or it says nothing.
 */
export function trend(values: number[]): "up" | "down" | null {
  if (values.length < 6 || values.filter((v) => v > 0).length < 4) return null;
  const half = Math.floor(values.length / 2);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const first = mean(values.slice(0, half));
  const second = mean(values.slice(values.length - half));
  if (first === 0) return second > 0 ? "up" : null;
  const move = (second - first) / first;
  if (Math.abs(move) < 0.1) return null;
  return move > 0 ? "up" : "down";
}
