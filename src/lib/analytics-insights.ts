import type { TranslationKey } from "@/lib/i18n/translations";
import { SMALL_SAMPLE, extreme, trend } from "@/lib/analytics-metrics";

/**
 * Short sentences read off the period's own figures.
 *
 * Each one is a fact the page already shows elsewhere, stated plainly, and
 * each has a threshold below which it is not said at all: two rentals do not
 * make a trend, and a percentage of five is an anecdote. No advice, no
 * forecasting — only what the numbers say.
 */

export type InsightValue =
  | { eur: number }
  | { pct: number }
  | { int: number }
  | { text: string }
  | { bucket: string }
  | { weekday: number };

export type Insight = {
  key: TranslationKey;
  values: Record<string, InsightValue>;
};

export type InsightInput = {
  inProgress: boolean;
  comparisonLabel: string | null;
  current: {
    earned: number;
    cancelledValue: number;
    reservations: number;
    cancelled: number;
    utilization: number | null;
    renting: number;
    returning: number;
  };
  previous: {
    earned: number;
    utilization: number | null;
  } | null;
  /** Earned revenue per bucket, for the best bucket and the trend. */
  buckets: { key: string; value: number }[];
  bucketUnit: "day" | "week" | "month" | "year";
  topVehicle: { label: string; share: number | null } | null;
  vehiclesWithRevenue: number;
  /** Cars in the fleet at least a week of the period that were never out. */
  idleVehicles: number;
  weekdays: number[];
  /** Earned revenue per year, all time. */
  years: { year: number; value: number }[];
};

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { current, previous } = input;

  if (
    previous &&
    input.comparisonLabel &&
    previous.earned > 0 &&
    current.earned > 0
  ) {
    const pct = (current.earned - previous.earned) / previous.earned;
    if (Math.abs(pct) >= 0.01) {
      out.push({
        key:
          pct > 0
            ? input.inProgress
              ? "analytics.insight.revenueMoreSoFar"
              : "analytics.insight.revenueMore"
            : input.inProgress
              ? "analytics.insight.revenueLessSoFar"
              : "analytics.insight.revenueLess",
        values: {
          pct: { pct: Math.abs(pct) },
          comparison: { text: input.comparisonLabel },
        },
      });
    }
  }

  const withData = input.buckets.filter((b) => b.value > 0);
  if (input.bucketUnit === "month" && withData.length >= 3) {
    const best = extreme(input.buckets, "max")!;
    const worst = extreme(input.buckets, "min")!;
    out.push({
      key: "analytics.insight.bestMonth",
      values: { month: { bucket: best.key }, amount: { eur: best.value } },
    });
    if (worst.key !== best.key) {
      out.push({
        key: "analytics.insight.weakestMonth",
        values: { month: { bucket: worst.key }, amount: { eur: worst.value } },
      });
    }
  }

  const direction = trend(input.buckets.map((b) => b.value));
  if (direction) {
    out.push({
      key:
        direction === "up"
          ? "analytics.insight.trendUp"
          : "analytics.insight.trendDown",
      values: {},
    });
  }

  if (
    input.topVehicle &&
    input.topVehicle.share !== null &&
    input.topVehicle.share >= 0.15 &&
    input.vehiclesWithRevenue >= 3
  ) {
    out.push({
      key: "analytics.insight.topVehicleShare",
      values: {
        vehicle: { text: input.topVehicle.label },
        pct: { pct: input.topVehicle.share },
      },
    });
  }

  if (input.idleVehicles > 0) {
    out.push({
      key: "analytics.insight.idleVehicles",
      values: { count: { int: input.idleVehicles } },
    });
  }

  if (
    previous &&
    current.utilization !== null &&
    previous.utilization !== null &&
    Math.abs(current.utilization - previous.utilization) >= 0.02
  ) {
    out.push({
      key:
        current.utilization > previous.utilization
          ? "analytics.insight.utilizationUp"
          : "analytics.insight.utilizationDown",
      values: {
        from: { pct: previous.utilization },
        to: { pct: current.utilization },
      },
    });
  }

  if (current.cancelled >= 3 && current.cancelledValue > 0) {
    out.push({
      key: "analytics.insight.cancellations",
      values: {
        amount: { eur: current.cancelledValue },
        count: { int: current.cancelled },
        total: { int: current.reservations },
      },
    });
  }

  if (current.renting >= SMALL_SAMPLE) {
    out.push({
      key: "analytics.insight.returningShare",
      values: { pct: { pct: current.returning / current.renting } },
    });
  } else if (current.renting > 0 && current.returning > 0) {
    out.push({
      key: "analytics.insight.returningCount",
      values: {
        count: { int: current.returning },
        total: { int: current.renting },
      },
    });
  }

  const pickups = input.weekdays.reduce((a, b) => a + b, 0);
  if (pickups >= SMALL_SAMPLE) {
    const max = Math.max(...input.weekdays);
    const day = input.weekdays.indexOf(max) + 1;
    out.push({
      key: "analytics.insight.busiestWeekday",
      values: {
        weekday: { weekday: day },
        count: { int: max },
        total: { int: pickups },
      },
    });
  }

  const years = input.years.filter((y) => y.value > 0);
  if (years.length >= 2) {
    const best = years.reduce((a, b) => (b.value > a.value ? b : a));
    out.push({
      key: "analytics.insight.strongestYear",
      values: {
        year: { text: String(best.year) },
        amount: { eur: best.value },
      },
    });
  }

  return out;
}
