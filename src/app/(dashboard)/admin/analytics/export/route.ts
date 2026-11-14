import { requireUser } from "@/lib/auth/guards";
import { getI18n } from "@/lib/i18n/server";
import { getAnalyticsReport } from "@/services/analytics-report.service";
import { toCsv } from "@/lib/csv";
import { resolveAnalyticsParams } from "../params";

/**
 * The analytics page's figures as CSV, for the period and comparison in the
 * URL — the same parameters and the same report the page renders, so an
 * export is what the screen showed. Plain numbers (dot decimals, no
 * grouping) so a spreadsheet reads them as numbers in any locale.
 */
const KINDS = ["summary", "revenue", "reservations", "vehicles"] as const;
type Kind = (typeof KINDS)[number];

export async function GET(request: Request) {
  await requireUser();
  const { t } = await getI18n();
  const url = new URL(request.url);
  const kind = (KINDS as readonly string[]).includes(
    url.searchParams.get("kind") ?? ""
  )
    ? (url.searchParams.get("kind") as Kind)
    : "summary";
  const search = Object.fromEntries(url.searchParams.entries());
  const { today, span, period, comparison, unit } =
    await resolveAnalyticsParams(search);
  const report = await getAnalyticsReport({
    range: period,
    unit,
    today,
    comparison,
    span,
  });
  const { current, previous } = report;
  const money = (v: number | null | undefined) =>
    v == null ? "" : v.toFixed(2);
  const rate = (v: number | null | undefined) =>
    v == null ? "" : (v * 100).toFixed(1);

  let rows: (string | number)[][];
  if (kind === "summary") {
    const line = (
      label: string,
      value: (f: NonNullable<typeof previous>) => string | number
    ): (string | number)[] => [
      label,
      value(current),
      previous ? value(previous) : "",
    ];
    rows = [
      [
        t("analytics.chart.period"),
        `${period.from} – ${period.to}`,
        comparison ? `${comparison.from} – ${comparison.to}` : "",
      ],
      line(t("analytics.kpi.earned"), (f) => money(f.revenue.earned)),
      line(t("analytics.series.realised"), (f) => money(f.revenue.realised)),
      line(t("analytics.series.accruing"), (f) => money(f.revenue.accruing)),
      line(t("analytics.kpi.upcoming"), (f) => money(f.revenue.upcoming)),
      line(t("analytics.kpi.cancelledValue"), (f) =>
        money(f.revenue.cancelled)
      ),
      line(t("analytics.kpi.earlyReturnAdjustment"), (f) =>
        money(f.revenue.earlyReturnAdjustment)
      ),
      line(t("analytics.kpi.perRental"), (f) => money(f.revenue.perRental)),
      line(t("analytics.kpi.dailyRate"), (f) => money(f.revenue.dailyRate)),
      line(t("analytics.kpi.perVehicle"), (f) => money(f.revenue.perVehicle)),
      line(t("analytics.kpi.reservations"), (f) => f.reservations.total),
      line(`${t("analytics.kpi.cancellationRate")} %`, (f) =>
        rate(f.reservations.cancellationRate)
      ),
      line(t("analytics.kpi.lapsed"), (f) => f.reservations.lapsed),
      line(t("analytics.kpi.fleetDays"), (f) => f.fleet.fleetDays),
      line(t("analytics.kpi.rentedDays"), (f) => f.fleet.rentedDays),
      line(`${t("analytics.kpi.utilization")} %`, (f) =>
        rate(f.fleet.utilization)
      ),
      line(t("analytics.kpi.renters"), (f) => f.customers.renting),
      line(t("analytics.kpi.firstTime"), (f) => f.customers.firstTime),
      line(t("analytics.kpi.returning"), (f) => f.customers.returning),
      line(t("analytics.kpi.newRecords"), (f) => f.customers.newRecords),
    ];
  } else if (kind === "revenue") {
    rows = [
      [
        t("analytics.customFrom"),
        t("analytics.customTo"),
        t("analytics.series.realised"),
        t("analytics.series.accruing"),
        t("analytics.series.upcoming"),
        t("analytics.kpi.earned"),
        t("analytics.kpi.cancelledValue"),
        ...(previous
          ? [`${t("analytics.kpi.earned")} (${t("analytics.comparisonTerm")})`]
          : []),
      ],
      ...current.buckets.map((b, i) => {
        const p = previous?.buckets[i];
        return [
          b.from,
          b.to,
          money(b.revenue.realised),
          money(b.revenue.accruing),
          money(b.revenue.upcoming),
          money(b.revenue.realised + b.revenue.accruing),
          money(b.cancelledValue),
          ...(previous
            ? [p ? money(p.revenue.realised + p.revenue.accruing) : ""]
            : []),
        ];
      }),
    ];
  } else if (kind === "reservations") {
    const statuses = [
      "COMPLETED",
      "ACTIVE",
      "CONFIRMED",
      "PENDING",
      "CANCELLED",
    ];
    rows = [
      [
        t("analytics.customFrom"),
        t("analytics.customTo"),
        ...statuses,
        t("analytics.kpi.lapsed"),
        `${t("analytics.kpi.cancellationRate")} %`,
      ],
      ...current.buckets.map((b) => {
        const total = statuses.reduce(
          (a, s) => a + (b.reservations[s] ?? 0),
          0
        );
        return [
          b.from,
          b.to,
          ...statuses.map((s) => b.reservations[s] ?? 0),
          b.lapsed,
          total ? rate((b.reservations.CANCELLED ?? 0) / total) : "",
        ];
      }),
    ];
  } else {
    rows = [
      [
        t("analytics.vehicles.vehicle"),
        "plate",
        "category",
        t("analytics.vehicles.rentals"),
        t("analytics.kpi.rentedDays"),
        t("analytics.kpi.fleetDays"),
        `${t("analytics.vehicles.utilization")} %`,
        t("analytics.vehicles.revenue"),
        t("analytics.series.upcoming"),
        `${t("analytics.vehicles.share")} %`,
        t("analytics.vehicles.averageValue"),
        t("analytics.vehicles.averageDuration"),
      ],
      ...report.vehicles.map((v) => [
        v.label,
        v.plate ?? "",
        v.category,
        v.rentals,
        v.rentedDays,
        v.fleetDays,
        rate(v.utilization),
        money(v.revenue),
        money(v.upcoming),
        rate(v.share),
        money(v.averageValue),
        v.averageDuration == null ? "" : v.averageDuration.toFixed(1),
      ]),
    ];
  }

  return new Response(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="alfa-rent-${kind}-${period.from}_${period.to}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
