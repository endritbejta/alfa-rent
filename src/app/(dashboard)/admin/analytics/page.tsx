import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAnalyticsReport } from "@/services/analytics-report.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { getI18n } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import type { TranslationKey } from "@/lib/i18n/translations";
import { formatEur } from "@/lib/money";
import { formatNumber } from "@/lib/number-format";
import { cn } from "@/lib/utils";
import {
  allowedGranularities,
  monthOptions,
  periodDays,
  stepPeriod,
  parsePeriod,
} from "@/lib/analytics-period";
import { SMALL_SAMPLE, change, ratio } from "@/lib/analytics-metrics";
import { buildInsights, type InsightValue } from "@/lib/analytics-insights";
import { RESERVATION_STATUS_KEYS } from "@/lib/status-labels";
import { BarChart, type ChartBucket } from "./bar-chart";
import { PeriodControls } from "./period-controls";
import { VehicleTable } from "./vehicle-table";
import {
  type AnalyticsSearchParams,
  analyticsQuery,
  bucketAxisLabel,
  bucketTitle,
  formatDayKey,
  monthLabel,
  periodTitle,
  rangeLabel,
  reservationsHref,
  resolveAnalyticsParams,
  weekdayName,
} from "./params";

export const dynamic = "force-dynamic";

const GRAIN_LABELS = {
  day: "analytics.grain.day",
  week: "analytics.grain.week",
  month: "analytics.grain.month",
  year: "analytics.grain.year",
} as const satisfies Record<string, TranslationKey>;

const STATUS_ORDER = [
  "COMPLETED",
  "ACTIVE",
  "CONFIRMED",
  "PENDING",
  "CANCELLED",
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsSearchParams>;
}) {
  await requireUser();
  const { locale, t } = await getI18n();
  const search = await searchParams;
  const { today, span, period, compare, comparison, unit } =
    await resolveAnalyticsParams(search);
  const report = await getAnalyticsReport({
    range: period,
    unit,
    today,
    comparison,
    vehicleId: search.inspect ?? null,
    span,
  });
  const { current, previous } = report;

  // --- Formatting ------------------------------------------------------------
  const eur = (v: number | null, precision: 0 | 2 = 0) =>
    v === null ? "—" : formatEur(v, locale, { precision });
  const pct = (v: number | null) =>
    v === null ? "—" : `${formatNumber(v * 100, locale, 1)}%`;
  const num = (v: number | null, digits: 0 | 1 = 0) =>
    v === null ? "—" : formatNumber(v, locale, digits);

  const title = periodTitle(period, locale);
  const comparisonTitle = comparison
    ? periodTitle(
        parsePeriod(comparisonToken(comparison, period.kind), today, span),
        locale
      )
    : null;
  const inProgress = period.from <= today && period.to >= today;
  const isFuture = period.from > today;

  const prevToken = stepPeriod(period, -1);
  const nextToken = stepPeriod(period, 1);
  const lastMonth = span && span.last > today ? span.last : today;
  const months = monthOptions(span?.first ?? today, lastMonth).map((m) => ({
    value: m,
    label: monthLabel(m, locale),
  }));
  const years = [...new Set(months.map((m) => m.value.slice(0, 4)))];

  const delta = (
    value: number | null,
    before: number | null | undefined,
    kind: "eur" | "count" | "pp" | "days"
  ) =>
    previous && comparisonTitle && value !== null && before != null ? (
      <Delta
        value={value}
        previous={before}
        kind={kind}
        locale={locale}
        against={comparisonTitle}
        noChange={t("analytics.noChange")}
      />
    ) : null;

  // --- Series ---------------------------------------------------------------
  const prevBuckets = previous?.buckets ?? [];
  const chartBucket = (
    b: (typeof current.buckets)[number],
    i: number,
    values: number[],
    compareValue: (p: (typeof current.buckets)[number]) => number | null
  ): ChartBucket => {
    const p = prevBuckets[i];
    return {
      key: b.key,
      axis: bucketAxisLabel(unit, b.key, locale),
      title: bucketTitle(unit, b, locale),
      values,
      compare: p ? compareValue(p) : null,
      compareTitle: p ? bucketTitle(unit, p, locale) : undefined,
      href: reservationsHref(b),
    };
  };

  const revenueBuckets = current.buckets.map((b, i) =>
    chartBucket(
      b,
      i,
      [b.revenue.realised, b.revenue.accruing, b.revenue.upcoming],
      (p) => p.revenue.realised + p.revenue.accruing
    )
  );
  const held = (r: Record<string, number>) =>
    (r.CONFIRMED ?? 0) + (r.ACTIVE ?? 0) + (r.COMPLETED ?? 0);
  const reservationBuckets = current.buckets.map((b, i) =>
    chartBucket(
      b,
      i,
      [held(b.reservations), b.reservations.CANCELLED ?? 0],
      (p) => held(p.reservations) + (p.reservations.CANCELLED ?? 0)
    )
  );
  const utilizationBuckets = current.buckets.map((b, i) => ({
    ...chartBucket(b, i, [ratio(b.rentedDays, b.fleetDays) ?? 0], (p) =>
      ratio(p.rentedDays, p.fleetDays)
    ),
    href: undefined,
  }));
  const customerBuckets = current.buckets.map((b, i) => ({
    ...chartBucket(b, i, [b.firstRentals, b.newRecords], (p) => p.firstRentals),
    href: undefined,
  }));

  // --- Vehicles ---------------------------------------------------------------
  const vehicles = report.vehicles;
  const ranked = (
    key: "revenue" | "rentals" | "rentedDays" | "utilization",
    dir: "max" | "min" = "max"
  ) => {
    // Utilisation of a car that spent under a week in the fleet is noise.
    const pool = vehicles.filter(
      (v) => key !== "utilization" || v.fleetDays >= 7
    );
    if (pool.length === 0) return null;
    const best = pool.reduce((a, b) =>
      dir === "max"
        ? (b[key] ?? 0) > (a[key] ?? 0)
          ? b
          : a
        : (b[key] ?? 0) < (a[key] ?? 0)
          ? b
          : a
    );
    return dir === "max" && !(best[key] ?? 0) ? null : best;
  };
  const rankings = [
    {
      label: t("analytics.rank.revenue"),
      v: ranked("revenue"),
      value: (v: (typeof vehicles)[number]) => eur(v.revenue),
    },
    {
      label: t("analytics.rank.rentals"),
      v: ranked("rentals"),
      value: (v: (typeof vehicles)[number]) => num(v.rentals),
    },
    {
      label: t("analytics.rank.rentedDays"),
      v: ranked("rentedDays"),
      value: (v: (typeof vehicles)[number]) =>
        t("analytics.days", { count: v.rentedDays }),
    },
    {
      label: t("analytics.rank.utilization"),
      v: ranked("utilization"),
      value: (v: (typeof vehicles)[number]) => pct(v.utilization),
    },
    {
      label: t("analytics.rank.lowestUtilization"),
      v: ranked("utilization", "min"),
      value: (v: (typeof vehicles)[number]) => pct(v.utilization),
    },
  ];
  const topFive = [...vehicles]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const topFiveShare = ratio(
    topFive.reduce((a, v) => a + v.revenue, 0),
    current.revenue.earned
  );

  // --- Seasonality -------------------------------------------------------------
  const seasonCell = new Map(
    report.seasonality.months.map((c) => [c.month, c])
  );
  const yearTotals = report.seasonality.years.map((year) => ({
    year,
    value: report.seasonality.months
      .filter((c) => c.month.startsWith(String(year)))
      .reduce((a, c) => a + c.revenue, 0),
  }));
  const seasonMax = Math.max(
    ...report.seasonality.months.map((c) => c.revenue),
    1
  );

  // --- Insights ----------------------------------------------------------------
  const insights = buildInsights({
    inProgress,
    comparisonLabel: comparisonTitle,
    current: {
      earned: current.revenue.earned,
      cancelledValue: current.revenue.cancelled,
      reservations: current.reservations.total,
      cancelled: current.reservations.status.CANCELLED ?? 0,
      utilization: current.fleet.utilization,
      renting: current.customers.renting,
      returning: current.customers.returning,
    },
    previous: previous
      ? {
          earned: previous.revenue.earned,
          utilization: previous.fleet.utilization,
        }
      : null,
    buckets: current.buckets.map((b) => ({
      key: b.key,
      value: b.revenue.realised + b.revenue.accruing,
    })),
    bucketUnit: unit,
    topVehicle: topFive[0]
      ? { label: topFive[0].label, share: topFive[0].share }
      : null,
    vehiclesWithRevenue: vehicles.filter((v) => v.revenue > 0).length,
    idleVehicles: vehicles.filter((v) => v.fleetDays >= 7 && v.rentedDays === 0)
      .length,
    weekdays: report.weekdays,
    years: yearTotals,
  });
  const insightValue = (v: InsightValue): string =>
    "eur" in v
      ? eur(v.eur)
      : "pct" in v
        ? `${formatNumber(v.pct * 100, locale)}%`
        : "int" in v
          ? num(v.int)
          : "bucket" in v
            ? monthLabel(v.bucket.slice(0, 7), locale)
            : "weekday" in v
              ? weekdayName(v.weekday, locale)
              : v.text;

  // --- Reservations derived ---------------------------------------------------
  const status = current.reservations.status;
  const days = periodDays(period);
  const perMonth =
    days >= 28 ? current.reservations.total / (days / (365.25 / 12)) : null;
  const weekdayTotal = report.weekdays.reduce((a, b) => a + b, 0);
  const weekdayMax = Math.max(...report.weekdays, 1);

  const exportHref = (kind: string) => {
    const query = analyticsQuery({
      p: period.token,
      cmp: compare,
      g: search.g,
    });
    return `/admin/analytics/export${query ? `${query}&` : "?"}kind=${kind}`;
  };

  const thin = (n: number) =>
    n > 0 && n < SMALL_SAMPLE ? t("analytics.thinSample") : null;

  return (
    <PageBody className="space-y-10">
      <PageHeader
        title={t("admin.analytics")}
        description={t("analytics.subtitle")}
      >
        <details className="relative print:hidden">
          <summary className="border-input hover:bg-surface-hover flex h-9 cursor-pointer list-none items-center border px-3 text-xs font-semibold">
            {t("analytics.export")}
          </summary>
          <ul className="bg-popover absolute right-0 z-20 mt-1 w-60 border py-1 text-sm shadow-md">
            {(
              [
                ["summary", "analytics.export.summary"],
                ["revenue", "analytics.export.revenue"],
                ["reservations", "analytics.export.reservations"],
                ["vehicles", "analytics.export.vehicles"],
              ] as const
            ).map(([kind, label]) => (
              <li key={kind}>
                <a
                  href={exportHref(kind)}
                  className="hover:bg-surface-hover block px-3 py-2"
                  download
                >
                  {t(label)}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </PageHeader>

      <PeriodControls
        key={`${period.token}-${compare}`}
        token={period.token}
        kind={period.kind}
        preset={period.preset}
        title={title}
        dates={rangeLabel(period.from, period.to, locale)}
        prev={
          prevToken
            ? {
                token: prevToken,
                label: periodTitle(parsePeriod(prevToken, today, span), locale),
              }
            : null
        }
        next={
          nextToken
            ? {
                token: nextToken,
                label: periodTitle(parsePeriod(nextToken, today, span), locale),
              }
            : null
        }
        months={months}
        years={years}
        compare={compare}
        comparisonText={
          comparison && comparisonTitle
            ? t("analytics.comparedWith", {
                period: comparisonTitle,
                dates: rangeLabel(comparison.from, comparison.to, locale),
              })
            : null
        }
        from={period.from}
        to={period.to}
        query={{ g: search.g, inspect: search.inspect }}
      />

      {(inProgress || isFuture) && (
        <p className="text-muted-foreground border-l-2 pl-3 text-sm">
          {isFuture
            ? t("analytics.futurePeriod")
            : t("analytics.inProgress", {
                today: formatDayKey(today, locale),
              })}
        </p>
      )}

      {/* --- Overview ------------------------------------------------------ */}
      <section aria-labelledby="overview" className="space-y-8">
        <SectionTitle id="overview">{t("analytics.overview")}</SectionTitle>
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <Figure
            hero
            label={t("analytics.kpi.earned")}
            value={eur(current.revenue.earned)}
            delta={delta(
              current.revenue.earned,
              previous?.revenue.earned,
              "eur"
            )}
            note={t("analytics.kpi.earnedNote", {
              realised: eur(current.revenue.realised),
              accruing: eur(current.revenue.accruing),
            })}
          />
          <Figure
            label={t("analytics.kpi.reservations")}
            value={num(current.reservations.total)}
            delta={delta(
              current.reservations.total,
              previous?.reservations.total,
              "count"
            )}
            note={t("analytics.kpi.reservationsNote")}
          />
          <Figure
            label={t("analytics.kpi.utilization")}
            value={pct(current.fleet.utilization)}
            delta={delta(
              current.fleet.utilization,
              previous?.fleet.utilization,
              "pp"
            )}
            note={t("analytics.kpi.utilizationNote", {
              rented: num(current.fleet.rentedDays),
              fleet: num(current.fleet.fleetDays),
            })}
          />
          <Figure
            label={t("analytics.kpi.renters")}
            value={num(current.customers.renting)}
            delta={delta(
              current.customers.renting,
              previous?.customers.renting,
              "count"
            )}
            note={t("analytics.kpi.rentersNote", {
              first: num(current.customers.firstTime),
              returning: num(current.customers.returning),
            })}
          />
        </dl>

        <div className="grid gap-x-10 gap-y-8 border-t pt-6 md:grid-cols-2 xl:grid-cols-4">
          <FigureGroup title={t("analytics.group.financial")}>
            <Row
              label={t("analytics.kpi.upcoming")}
              value={eur(current.revenue.upcoming)}
            />
            <Row
              label={t("analytics.kpi.perRental")}
              value={eur(current.revenue.perRental)}
              delta={delta(
                current.revenue.perRental,
                previous?.revenue.perRental,
                "eur"
              )}
            />
            <Row
              label={t("analytics.kpi.dailyRate")}
              value={eur(current.revenue.dailyRate)}
              delta={delta(
                current.revenue.dailyRate,
                previous?.revenue.dailyRate,
                "eur"
              )}
            />
            <Row
              label={t("analytics.kpi.perVehicle")}
              value={eur(current.revenue.perVehicle)}
              delta={delta(
                current.revenue.perVehicle,
                previous?.revenue.perVehicle,
                "eur"
              )}
            />
            <Row
              label={t("analytics.kpi.cancelledValue")}
              value={eur(current.revenue.cancelled)}
            />
          </FigureGroup>
          <FigureGroup title={t("analytics.group.reservations")}>
            {STATUS_ORDER.map((s) => (
              <Row
                key={s}
                label={t(RESERVATION_STATUS_KEYS[s])}
                value={num(status[s] ?? 0)}
                href={reservationsHref(period, { status: s })}
              />
            ))}
            <Row
              label={t("analytics.kpi.cancellationRate")}
              value={pct(current.reservations.cancellationRate)}
              sub={thin(current.reservations.total)}
              delta={delta(
                current.reservations.cancellationRate,
                previous?.reservations.cancellationRate,
                "pp"
              )}
            />
          </FigureGroup>
          <FigureGroup title={t("analytics.group.customers")}>
            <Row
              label={t("analytics.kpi.customerRecords")}
              value={num(report.customerRecords)}
            />
            <Row
              label={t("analytics.kpi.newRecords")}
              value={num(current.customers.newRecords)}
              delta={delta(
                current.customers.newRecords,
                previous?.customers.newRecords,
                "count"
              )}
            />
            <Row
              label={t("analytics.kpi.firstTime")}
              value={num(current.customers.firstTime)}
            />
            <Row
              label={t("analytics.kpi.repeatRate")}
              value={pct(current.customers.repeatRate)}
              sub={
                current.customers.renting > 0
                  ? t("analytics.ofCount", {
                      count: current.customers.returning,
                      total: current.customers.renting,
                    })
                  : null
              }
            />
            <Row
              label={t("analytics.kpi.rentalsPerCustomer")}
              value={num(current.customers.rentalsPerCustomer, 1)}
            />
          </FigureGroup>
          <FigureGroup title={t("analytics.group.fleet")}>
            <Row
              label={t("analytics.kpi.fleetTotal")}
              value={num(report.fleetNow.total)}
            />
            <Row
              label={t("analytics.kpi.available")}
              value={num(report.fleetNow.available)}
            />
            <Row
              label={t("analytics.kpi.onRent")}
              value={num(report.fleetNow.activeRentals)}
              // Today's figure, so every active rental, whatever its dates.
              href="/admin/reservations?status=ACTIVE"
            />
            <Row
              label={t("analytics.kpi.averageFleet")}
              value={num(current.fleet.averageFleet, 1)}
            />
            <Row
              label={t("analytics.kpi.idleDays")}
              value={num(current.fleet.idleDays)}
            />
          </FigureGroup>
        </div>

        {insights.length > 0 && (
          <div className="border-t pt-6">
            <h3 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
              {t("analytics.insights")}
            </h3>
            <ul className="grid gap-x-10 gap-y-2 text-sm md:grid-cols-2">
              {insights.map((insight, i) => (
                <li key={i} className="border-brand/60 border-l-2 pl-3">
                  {t(
                    insight.key,
                    Object.fromEntries(
                      Object.entries(insight.values).map(([k, v]) => [
                        k,
                        insightValue(v),
                      ])
                    )
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* --- Revenue ------------------------------------------------------- */}
      <section aria-labelledby="revenue" className="space-y-6">
        <SectionTitle
          id="revenue"
          aside={
            <GrainSwitch
              current={unit}
              options={allowedGranularities(period)}
              hrefFor={(g) =>
                `/admin/analytics${analyticsQuery({
                  p: period.token,
                  cmp: compare,
                  g,
                  inspect: search.inspect,
                })}`
              }
              t={t}
            />
          }
        >
          {t("analytics.revenue")}
        </SectionTitle>
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BarChart
              label={t("analytics.revenueChart", { period: title })}
              tableCaption={t("analytics.revenueChart", { period: title })}
              format="eur"
              buckets={revenueBuckets}
              series={[
                { name: t("analytics.series.realised"), tone: "solid" },
                { name: t("analytics.series.accruing"), tone: "soft" },
                { name: t("analytics.series.upcoming"), tone: "hatch" },
              ]}
              compareName={
                comparisonTitle
                  ? t("analytics.series.compare", { period: comparisonTitle })
                  : undefined
              }
              height={220}
            />
          </div>
          <div className="space-y-8">
            <div>
              <h3 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                {t("analytics.byCategory")}
              </h3>
              <Bars
                items={report.categories
                  .filter((c) => c.revenue > 0 || c.fleetDays > 0)
                  .map((c) => ({
                    label: t(
                      `filter.${c.category.toLowerCase()}` as TranslationKey
                    ),
                    value: c.revenue,
                    text: eur(c.revenue),
                    sub: t("analytics.categorySub", {
                      utilization: pct(c.utilization),
                      count: c.vehicles,
                    }),
                  }))}
                empty={t("analytics.noRevenue")}
              />
            </div>
            <dl className="space-y-2 border-t pt-4 text-sm">
              <Row
                label={t("analytics.kpi.topFiveShare")}
                value={pct(topFiveShare)}
              />
              <Row
                label={t("analytics.kpi.earlyReturnAdjustment")}
                value={eur(current.revenue.earlyReturnAdjustment)}
              />
              <Row
                label={t("analytics.kpi.cancelledValue")}
                value={eur(current.revenue.cancelled)}
              />
            </dl>
          </div>
        </div>
      </section>

      {/* --- Reservations -------------------------------------------------- */}
      <section aria-labelledby="reservations" className="space-y-6">
        <SectionTitle id="reservations">
          {t("analytics.reservations")}
        </SectionTitle>
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BarChart
              label={t("analytics.reservationsChart", { period: title })}
              tableCaption={t("analytics.reservationsChart", { period: title })}
              format="count"
              buckets={reservationBuckets}
              series={[
                { name: t("analytics.series.held"), tone: "solid" },
                { name: t("analytics.series.cancelled"), tone: "neutral" },
              ]}
              compareName={
                comparisonTitle
                  ? t("analytics.series.compare", { period: comparisonTitle })
                  : undefined
              }
            />
          </div>
          <div className="space-y-8">
            <dl className="space-y-2 text-sm">
              <Row
                label={t("analytics.kpi.averageDuration")}
                value={
                  current.reservations.averageDuration === null
                    ? "—"
                    : t("analytics.days", {
                        count: num(current.reservations.averageDuration, 1),
                      })
                }
                delta={delta(
                  current.reservations.averageDuration,
                  previous?.reservations.averageDuration,
                  "days"
                )}
              />
              {perMonth !== null && (
                <Row
                  label={t("analytics.kpi.perMonth")}
                  value={num(perMonth, 1)}
                />
              )}
              <Row
                label={t("analytics.kpi.lapsed")}
                value={num(current.reservations.lapsed)}
              />
            </dl>
            <div>
              <h3 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                {t("analytics.pickupWeekdays")}
              </h3>
              {weekdayTotal === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("analytics.noReservations")}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs tabular-nums">
                  {report.weekdays.map((count, i) => (
                    <li
                      key={i}
                      className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2"
                    >
                      <span className="text-muted-foreground truncate capitalize">
                        {weekdayName(i + 1, locale)}
                      </span>
                      <span className="bg-secondary h-1.5">
                        <span
                          className="bg-brand block h-full"
                          style={{ width: `${(count / weekdayMax) * 100}%` }}
                        />
                      </span>
                      <span className="text-right">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- Fleet ----------------------------------------------------------- */}
      <section aria-labelledby="fleet" className="space-y-6">
        <SectionTitle id="fleet">{t("analytics.fleet")}</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-10 gap-y-6 md:grid-cols-4">
          <Figure
            label={t("analytics.kpi.fleetDays")}
            value={num(current.fleet.fleetDays)}
            note={t("analytics.kpi.fleetDaysNote")}
          />
          <Figure
            label={t("analytics.kpi.rentedDays")}
            value={num(current.fleet.rentedDays)}
            delta={delta(
              current.fleet.rentedDays,
              previous?.fleet.rentedDays,
              "count"
            )}
          />
          <Figure
            label={t("analytics.kpi.idleDays")}
            value={num(current.fleet.idleDays)}
          />
          <Figure
            label={t("analytics.kpi.utilization")}
            value={pct(current.fleet.utilization)}
            delta={delta(
              current.fleet.utilization,
              previous?.fleet.utilization,
              "pp"
            )}
          />
        </dl>
        <BarChart
          label={t("analytics.utilizationChart", { period: title })}
          tableCaption={t("analytics.utilizationChart", { period: title })}
          format="pct"
          height={140}
          buckets={utilizationBuckets}
          series={[{ name: t("analytics.kpi.utilization"), tone: "solid" }]}
          compareName={
            comparisonTitle
              ? t("analytics.series.compare", { period: comparisonTitle })
              : undefined
          }
        />
        <dl className="grid gap-x-8 gap-y-4 border-y py-5 sm:grid-cols-2 lg:grid-cols-5">
          {rankings.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.12em] uppercase">
                {r.label}
              </dt>
              <dd className="mt-1 truncate text-sm font-medium">
                {r.v ? r.v.label : "—"}
              </dd>
              {r.v && (
                <dd className="text-muted-foreground text-xs tabular-nums">
                  {r.value(r.v)}
                </dd>
              )}
            </div>
          ))}
        </dl>
        <VehicleTable
          rows={vehicles}
          inspected={report.selectedVehicle?.id ?? null}
        />
        {report.selectedVehicle && (
          <div id="inspect" className="space-y-4 border-t pt-6">
            <h3 className="font-display text-lg font-semibold">
              {report.selectedVehicle.label}
            </h3>
            <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
              <BarChart
                label={t("analytics.vehicleRevenue")}
                tableCaption={t("analytics.vehicleRevenue")}
                format="eur"
                height={150}
                buckets={report.selectedVehicle.series.map((b) => ({
                  key: b.key,
                  axis: bucketAxisLabel(unit, b.key, locale),
                  title: bucketTitle(unit, b, locale),
                  values: [b.revenue],
                  href: reservationsHref(b, {
                    vehicleId: report.selectedVehicle!.id,
                  }),
                }))}
                series={[{ name: t("analytics.series.earned"), tone: "solid" }]}
              />
              <BarChart
                label={t("analytics.vehicleDays")}
                tableCaption={t("analytics.vehicleDays")}
                format="count"
                height={150}
                buckets={report.selectedVehicle.series.map((b) => ({
                  key: b.key,
                  axis: bucketAxisLabel(unit, b.key, locale),
                  title: bucketTitle(unit, b, locale),
                  values: [
                    b.rentedDays,
                    Math.max(b.fleetDays - b.rentedDays, 0),
                  ],
                }))}
                series={[
                  { name: t("analytics.kpi.rentedDays"), tone: "solid" },
                  { name: t("analytics.kpi.idleDays"), tone: "neutral" },
                ]}
              />
            </div>
          </div>
        )}
      </section>

      {/* --- Customers --------------------------------------------------------- */}
      <section aria-labelledby="customers" className="space-y-6">
        <SectionTitle id="customers">{t("analytics.customers")}</SectionTitle>
        <div className="grid gap-x-10 gap-y-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <BarChart
              label={t("analytics.customersChart", { period: title })}
              tableCaption={t("analytics.customersChart", { period: title })}
              format="count"
              buckets={customerBuckets}
              series={[
                { name: t("analytics.series.firstRentals"), tone: "solid" },
                { name: t("analytics.series.newRecords"), tone: "neutral" },
              ]}
              compareName={
                comparisonTitle
                  ? t("analytics.series.compareFirst", {
                      period: comparisonTitle,
                    })
                  : undefined
              }
              height={160}
            />
          </div>
          <div className="space-y-6">
            <dl className="space-y-2 text-sm">
              <Row
                label={t("analytics.kpi.returning")}
                value={num(current.customers.returning)}
                delta={delta(
                  current.customers.returning,
                  previous?.customers.returning,
                  "count"
                )}
              />
              <Row
                label={t("analytics.kpi.multiRental")}
                value={num(current.customers.multi)}
              />
              <Row
                label={t("analytics.kpi.everRepeat")}
                value={pct(
                  ratio(
                    current.customers.everRepeat,
                    current.customers.everRented
                  )
                )}
                sub={t("analytics.ofCount", {
                  count: current.customers.everRepeat,
                  total: current.customers.everRented,
                })}
              />
            </dl>
            <div>
              <h3 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
                {t("analytics.topCustomers")}
              </h3>
              {report.topCustomers.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("analytics.noRenters")}
                </p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {report.topCustomers.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <Link
                        href={`?${new URLSearchParams({
                          ...stripUndefined(search),
                          customer: c.id,
                        }).toString()}`}
                        scroll={false}
                        className="min-w-0 truncate hover:underline"
                      >
                        {c.name ?? t("analytics.anonymised")}
                      </Link>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {t("analytics.rentalsCount", { count: c.rentals })} ·{" "}
                        <span className="text-foreground font-medium">
                          {eur(c.value)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* --- Seasonality ------------------------------------------------------- */}
      <section aria-labelledby="seasonality" className="space-y-4">
        <SectionTitle id="seasonality">
          {t("analytics.seasonality")}
        </SectionTitle>
        <p className="text-muted-foreground text-sm">
          {t("analytics.seasonalityNote")}
        </p>
        {report.seasonality.years.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("analytics.noRevenue")}
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[820px] text-xs tabular-nums">
              <caption className="sr-only">
                {t("analytics.seasonality")}
              </caption>
              <thead>
                <tr className="text-muted-foreground border-b">
                  <th scope="col" className="py-2 pr-3 text-left font-medium">
                    {t("analytics.year")}
                  </th>
                  {Array.from({ length: 12 }, (_, m) => (
                    <th
                      key={m}
                      scope="col"
                      className="px-1 py-2 text-right font-medium capitalize"
                    >
                      {formatDayKey(
                        `2026-${String(m + 1).padStart(2, "0")}-01`,
                        locale,
                        "LLL"
                      )}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right font-medium">
                    {t("analytics.total")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.seasonality.years.map((year) => {
                  const cells = Array.from({ length: 12 }, (_, m) =>
                    seasonCell.get(`${year}-${String(m + 1).padStart(2, "0")}`)
                  );
                  const best = Math.max(...cells.map((c) => c?.revenue ?? 0));
                  const total = yearTotals.find((y) => y.year === year)!.value;
                  return (
                    <tr key={year} className="border-divider border-b">
                      <th
                        scope="row"
                        className="py-2 pr-3 text-left font-medium"
                      >
                        <Link
                          href={`/admin/analytics?p=${year}`}
                          className="hover:underline"
                        >
                          {year}
                        </Link>
                      </th>
                      {cells.map((c, m) => {
                        const month = `${year}-${String(m + 1).padStart(2, "0")}`;
                        const value = c?.revenue ?? 0;
                        return (
                          <td key={m} className="p-0.5 text-right">
                            {value > 0 ? (
                              <Link
                                href={`/admin/analytics?p=${month}`}
                                title={`${monthLabel(month, locale)} · ${eur(value)} · ${t("analytics.rentalsCount", { count: c?.pickups ?? 0 })}`}
                                className={cn(
                                  "block px-1.5 py-1.5 hover:underline",
                                  value === best && "font-semibold"
                                )}
                                style={{
                                  backgroundColor: `color-mix(in oklab, var(--brand) ${Math.round((value / seasonMax) * 28)}%, transparent)`,
                                }}
                              >
                                {formatNumber(value, locale)}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground block px-1.5 py-1.5">
                                ·
                              </span>
                            )}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-3 text-right font-semibold">
                        {eur(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --- Definitions ------------------------------------------------------- */}
      <section aria-labelledby="definitions" className="border-t pt-6">
        <details>
          <summary
            id="definitions"
            className="text-muted-foreground hover:text-foreground cursor-pointer text-[11px] font-medium tracking-[0.18em] uppercase"
          >
            {t("analytics.definitions")}
          </summary>
          <dl className="mt-4 grid gap-x-10 gap-y-4 text-sm md:grid-cols-2">
            {DEFINITIONS.map(([term, text]) => (
              <div key={term}>
                <dt className="font-medium">{t(term)}</dt>
                <dd className="text-muted-foreground mt-0.5">{t(text)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>
    </PageBody>
  );
}

const DEFINITIONS: [TranslationKey, TranslationKey][] = [
  ["analytics.kpi.earned", "analytics.def.earned"],
  ["analytics.series.realised", "analytics.def.realised"],
  ["analytics.series.accruing", "analytics.def.accruing"],
  ["analytics.kpi.upcoming", "analytics.def.upcoming"],
  ["analytics.kpi.cancelledValue", "analytics.def.cancelledValue"],
  ["analytics.kpi.earlyReturnAdjustment", "analytics.def.earlyReturn"],
  ["analytics.kpi.perRental", "analytics.def.perRental"],
  ["analytics.kpi.dailyRate", "analytics.def.dailyRate"],
  ["analytics.kpi.perVehicle", "analytics.def.perVehicle"],
  ["analytics.kpi.reservations", "analytics.def.reservations"],
  ["analytics.kpi.cancellationRate", "analytics.def.cancellationRate"],
  ["analytics.kpi.lapsed", "analytics.def.lapsed"],
  ["analytics.kpi.averageDuration", "analytics.def.averageDuration"],
  ["analytics.kpi.utilization", "analytics.def.utilization"],
  ["analytics.kpi.fleetDays", "analytics.def.fleetDays"],
  ["analytics.kpi.renters", "analytics.def.renters"],
  ["analytics.kpi.repeatRate", "analytics.def.repeatRate"],
  ["analytics.kpi.newRecords", "analytics.def.newRecords"],
  ["analytics.comparisonTerm", "analytics.def.comparison"],
];

/** The `p` token for a comparison range, so it is titled like any period. */
function comparisonToken(
  range: { from: string; to: string },
  kind: string
): string {
  if (kind === "month") return range.from.slice(0, 7);
  if (kind === "year") return range.from.slice(0, 4);
  return `${range.from}_${range.to}`;
}

function stripUndefined(search: AnalyticsSearchParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(search).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function SectionTitle({
  id,
  children,
  aside,
}: {
  id: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-6">
      <h2 id={id} className="font-display text-xl font-semibold tracking-tight">
        {children}
      </h2>
      {aside}
    </div>
  );
}

function Figure({
  label,
  value,
  delta,
  note,
  hero,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  note?: string;
  hero?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.18em] uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "font-display mt-2 leading-none font-semibold tracking-tight tabular-nums",
          hero ? "text-4xl sm:text-5xl" : "text-3xl"
        )}
      >
        {value}
      </dd>
      {delta && <dd className="mt-2 text-xs">{delta}</dd>}
      {note && <dd className="text-muted-foreground mt-1 text-xs">{note}</dd>}
    </div>
  );
}

function FigureGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-3 text-[11px] font-medium tracking-[0.18em] uppercase">
        {title}
      </h3>
      <dl className="space-y-2 text-sm">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
  delta,
  href,
}: {
  label: string;
  value: string;
  sub?: string | null;
  delta?: React.ReactNode;
  href?: string;
}) {
  return (
    <div className="border-divider flex items-baseline justify-between gap-3 border-b pb-2 last:border-b-0">
      <dt className="text-muted-foreground min-w-0">
        {href ? (
          <Link href={href} className="hover:text-foreground hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
        {sub && <span className="block text-[11px]">{sub}</span>}
      </dt>
      <dd className="shrink-0 text-right tabular-nums">
        <span className="font-medium">{value}</span>
        {delta && <span className="block text-[11px]">{delta}</span>}
      </dd>
    </div>
  );
}

/**
 * How a figure moved against the comparison period: the arrow, the
 * percentage and the absolute difference, in ink rather than green and red —
 * more cancellations is "up" too, and the reader knows which way is good.
 * Rates move in percentage points, never a percentage of a percentage.
 */
function Delta({
  value,
  previous,
  kind,
  locale,
  against,
  noChange,
}: {
  value: number;
  previous: number;
  kind: "eur" | "count" | "pp" | "days";
  locale: Locale;
  against: string;
  noChange: string;
}) {
  const c = change(value, previous);
  const arrow = c.direction === "up" ? "▲" : c.direction === "down" ? "▼" : "–";
  const sign = c.delta > 0 ? "+" : c.delta < 0 ? "−" : "";
  const abs = Math.abs(c.delta);
  const amount =
    kind === "eur"
      ? formatEur(abs, locale, { precision: 0 })
      : kind === "pp"
        ? `${formatNumber(abs * 100, locale, 1)} pp`
        : kind === "days"
          ? formatNumber(abs, locale, 1)
          : formatNumber(abs, locale);
  const percent =
    kind !== "pp" && c.pct !== null
      ? `${formatNumber(Math.abs(c.pct) * 100, locale)}% · `
      : "";
  return (
    <span
      className="text-muted-foreground tabular-nums"
      title={`${against}: ${
        kind === "eur"
          ? formatEur(previous, locale, { precision: 0 })
          : kind === "pp"
            ? `${formatNumber(previous * 100, locale, 1)}%`
            : formatNumber(previous, locale, kind === "days" ? 1 : 0)
      }`}
    >
      <span aria-hidden className="text-foreground mr-1 text-[9px]">
        {arrow}
      </span>
      {c.direction === "flat" ? (
        noChange
      ) : (
        <>
          {percent}
          {sign}
          {amount}
        </>
      )}
      <span className="sr-only"> ({against})</span>
    </span>
  );
}

function GrainSwitch({
  current,
  options,
  hrefFor,
  t,
}: {
  current: string;
  options: string[];
  hrefFor: (g: string) => string;
  t: (key: TranslationKey) => string;
}) {
  if (options.length < 2) return null;
  return (
    <nav aria-label={t("analytics.granularity")} className="print:hidden">
      <ul className="flex border-b text-xs">
        {options.map((g) => (
          <li key={g}>
            <Link
              href={hrefFor(g)}
              scroll={false}
              aria-current={g === current ? "true" : undefined}
              className={cn(
                "-mb-px block border-b-2 px-3 py-1.5 font-semibold",
                g === current
                  ? "border-foreground text-foreground"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {t(GRAIN_LABELS[g as keyof typeof GRAIN_LABELS])}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Bars for a breakdown, each with its own formatted value and a sub-line. */
function Bars({
  items,
  empty,
}: {
  items: { label: string; value: number; text: string; sub?: string }[];
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{empty}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="text-xs font-semibold tabular-nums">
              {item.text}
            </span>
          </div>
          <div className="bg-secondary h-1.5">
            <div
              className="bg-brand h-full"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          {item.sub && (
            <p className="text-muted-foreground mt-1 text-[11px]">{item.sub}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
