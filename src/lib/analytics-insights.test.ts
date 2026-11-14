import { describe, expect, it } from "vitest";
import { buildInsights, type InsightInput } from "./analytics-insights";

const base: InsightInput = {
  inProgress: false,
  comparisonLabel: "October 2026",
  current: {
    earned: 1180,
    cancelledValue: 0,
    reservations: 20,
    cancelled: 0,
    utilization: 0.4,
    renting: 0,
    returning: 0,
  },
  previous: { earned: 1000, utilization: 0.4 },
  buckets: [],
  bucketUnit: "day",
  topVehicle: null,
  vehiclesWithRevenue: 0,
  idleVehicles: 0,
  weekdays: [0, 0, 0, 0, 0, 0, 0],
  years: [],
};
const keys = (input: Partial<InsightInput>) =>
  buildInsights({ ...base, ...input }).map((i) => i.key);

describe("buildInsights", () => {
  it("states the revenue change against the comparison period", () => {
    const [first] = buildInsights(base);
    expect(first).toEqual({
      key: "analytics.insight.revenueMore",
      values: { pct: { pct: 0.18 }, comparison: { text: "October 2026" } },
    });
    expect(keys({ inProgress: true })).toContain(
      "analytics.insight.revenueMoreSoFar"
    );
    expect(keys({ current: { ...base.current, earned: 800 } })).toContain(
      "analytics.insight.revenueLess"
    );
  });

  it("says nothing about revenue change from or to zero", () => {
    expect(keys({ previous: { earned: 0, utilization: null } })).not.toContain(
      "analytics.insight.revenueMore"
    );
    expect(keys({ previous: null })).toEqual([]);
  });

  it("names best and weakest months only with three months of data", () => {
    const months = [
      { key: "2026-01-01", value: 100 },
      { key: "2026-02-01", value: 300 },
    ];
    expect(keys({ bucketUnit: "month", buckets: months })).not.toContain(
      "analytics.insight.bestMonth"
    );
    const three = [
      ...months,
      { key: "2026-03-01", value: 0 },
      { key: "2026-04-01", value: 50 },
    ];
    const insights = buildInsights({
      ...base,
      bucketUnit: "month",
      buckets: three,
    });
    expect(
      insights.find((i) => i.key === "analytics.insight.bestMonth")?.values
    ).toEqual({ month: { bucket: "2026-02-01" }, amount: { eur: 300 } });
    // The empty month is not the weakest one.
    expect(
      insights.find((i) => i.key === "analytics.insight.weakestMonth")?.values
    ).toEqual({ month: { bucket: "2026-04-01" }, amount: { eur: 50 } });
  });

  it("gives a returning rate only on a sample of ten, counts below it", () => {
    expect(
      keys({ current: { ...base.current, renting: 12, returning: 3 } })
    ).toContain("analytics.insight.returningShare");
    const small = keys({
      current: { ...base.current, renting: 4, returning: 1 },
    });
    expect(small).toContain("analytics.insight.returningCount");
    expect(small).not.toContain("analytics.insight.returningShare");
  });

  it("mentions utilisation only when it moved two points or more", () => {
    expect(
      keys({ current: { ...base.current, utilization: 0.41 } })
    ).not.toContain("analytics.insight.utilizationUp");
    expect(keys({ current: { ...base.current, utilization: 0.3 } })).toContain(
      "analytics.insight.utilizationDown"
    );
  });

  it("names the busiest weekday and the strongest year when there is enough", () => {
    expect(keys({ weekdays: [1, 2, 0, 0, 1, 1, 0] })).not.toContain(
      "analytics.insight.busiestWeekday"
    );
    const insights = buildInsights({
      ...base,
      weekdays: [1, 2, 0, 0, 6, 1, 0],
      years: [
        { year: 2025, value: 5000 },
        { year: 2026, value: 9000 },
      ],
    });
    expect(
      insights.find((i) => i.key === "analytics.insight.busiestWeekday")?.values
    ).toEqual({
      weekday: { weekday: 5 },
      count: { int: 6 },
      total: { int: 10 },
    });
    expect(
      insights.find((i) => i.key === "analytics.insight.strongestYear")?.values
    ).toEqual({ year: { text: "2026" }, amount: { eur: 9000 } });
  });

  it("reports a concentrated fleet and idle cars", () => {
    expect(
      keys({
        topVehicle: { label: "Kia Rio", share: 0.4 },
        vehiclesWithRevenue: 5,
        idleVehicles: 2,
      })
    ).toEqual(
      expect.arrayContaining([
        "analytics.insight.topVehicleShare",
        "analytics.insight.idleVehicles",
      ])
    );
    expect(
      keys({
        topVehicle: { label: "Kia Rio", share: 0.4 },
        vehiclesWithRevenue: 2,
      })
    ).not.toContain("analytics.insight.topVehicleShare");
  });
});
