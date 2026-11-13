import { Prisma } from "@prisma/client";
import { format, subMonths, subDays } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { vehicleLabel } from "@/lib/vehicle-label";
import { actionableRequestWhere } from "@/lib/reservation-lifecycle";
import {
  BUSINESS_TIME_ZONE,
  businessDayStart,
  businessDayStartOf,
  businessMonthStart,
  businessRentalDays,
  businessTodayAsRentalDate,
} from "@/lib/business-time";
import {
  type BucketUnit,
  bucketLabel,
  businessBuckets,
} from "@/lib/business-buckets";

export type SeriesPoint = { label: string; value: number };

const REVENUE_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

/**
 * Revenue, recognised per rental day.
 *
 * A reservation's price is spread evenly over the days it covers, and each
 * day's share counts in the period that day falls in. A rental from 28 Feb to
 * 3 Mar is part February and part March; an extension's money lands on the
 * days it adds, and a late-return charge on the days the car was kept past
 * its return day. Revenue used to be counted in full on the day the booking was
 * *created*, so a March rental booked in November was November revenue.
 *
 * The days are the ones a rental occupies: pickup day through return day,
 * both included — `rentalDays` in lib/rental-dates, restated here because
 * SQL cannot call it. Keep the two in step. A booking priced before the
 * inclusive count (one day for 25 → 26 Nov) keeps its stored price, which is
 * now spread over both days; no period's total changes by more than where a
 * boundary falls.
 *
 * Rental dates are naive calendar values — `T10:00:00Z` means 10:00 at the
 * branch — so `"pickupDate"::date` already is the branch-local day and needs
 * no timezone conversion; converting it would shift it by the UTC offset.
 *
 * Everything is summed as numeric in Postgres, never as float, and the
 * buckets come back keyed by their first day to match business-buckets.
 */
async function revenueByBucket(
  unit: BucketUnit,
  from: string,
  to: string
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<
    { bucket: string; revenue: Prisma.Decimal }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc(${unit}, d.day), 'YYYY-MM-DD') AS bucket,
           ROUND(SUM(r.share), 2) AS revenue
    FROM (
      -- The booked days share the booked price: the total less any charge
      -- for days kept past the return day.
      SELECT (x."totalPrice" - x.late) / x.n AS share,
             x."pickupDate"::date AS first_day, x.n
      FROM (
        SELECT "totalPrice", "pickupDate",
               COALESCE("lateCharge", 0) AS late,
               ("returnDate"::date - "pickupDate"::date + 1) AS n
        FROM reservations
        WHERE status::text = ANY(${[...REVENUE_STATUSES]})
          -- Coarse range filter: no day of a rental outside it can fall in the window.
          AND "pickupDate" < ${to}::date
          AND "returnDate" >= ${from}::date
      ) x
      UNION ALL
      -- A late-return charge belongs to the late days themselves, which
      -- follow the booked return day. The booked dates are never moved to
      -- cover them (see settleLateReturn), so they are spread here.
      SELECT "lateCharge" / "lateDays", "returnDate"::date + 1, "lateDays"
      FROM reservations
      WHERE status::text = ANY(${[...REVENUE_STATUSES]})
        AND "lateCharge" > 0
        AND "lateDays" > 0
        AND "returnDate"::date + 1 < ${to}::date
        AND "returnDate"::date + "lateDays" >= ${from}::date
    ) r
    CROSS JOIN LATERAL generate_series(
      r.first_day, r.first_day + (r.n - 1), interval '1 day'
    ) AS d(day)
    WHERE d.day >= ${from}::date AND d.day < ${to}::date
    GROUP BY 1
  `);
  // Converted once, here, at the edge. A Decimal never leaves this module.
  return new Map(rows.map((row) => [row.bucket, Number(row.revenue)]));
}

/** Revenue per bucket for the last `count` buckets, oldest first. */
async function revenueSeriesFor(
  unit: BucketUnit,
  count: number,
  now: Date
): Promise<{ series: SeriesPoint[]; total: number; current: number }> {
  const { starts, end } = businessBuckets(unit, count, now);
  const sums = await revenueByBucket(unit, starts[0], end);
  const values = starts.map((start) => sums.get(start) ?? 0);
  return {
    series: starts.map((start, i) => ({
      label: bucketLabel(unit, start),
      value: Math.round(values[i]),
    })),
    // From the unrounded bucket values, so the total is not a sum of roundings.
    total: values.reduce((a, b) => a + b, 0),
    current: values[values.length - 1],
  };
}

/**
 * Bookings made per bucket, by the branch-local day they were made on.
 * `createdAt` is a real instant stored as UTC, unlike rental dates, so it is
 * converted to branch time before truncating.
 */
async function bookingsByBucket(
  unit: BucketUnit,
  starts: string[],
  end: string
): Promise<SeriesPoint[]> {
  const rows = await prisma.$queryRaw<{ bucket: string; count: number }[]>(
    Prisma.sql`
      SELECT to_char(date_trunc(${unit}, local), 'YYYY-MM-DD') AS bucket,
             COUNT(*)::int AS count
      FROM (
        SELECT ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE} AS local
        FROM reservations
      ) b
      WHERE local >= ${starts[0]}::date AND local < ${end}::date
      GROUP BY 1
    `
  );
  const counts = new Map(rows.map((row) => [row.bucket, row.count]));
  return starts.map((start) => ({
    label: bucketLabel(unit, start),
    value: counts.get(start) ?? 0,
  }));
}

function dailySeries(rows: { createdAt: Date }[], days: number): SeriesPoint[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    // Each boundary is resolved from the calendar day, not by adding 24h to
    // the previous one: a Belgrade day is 23 or 25 hours across a DST change.
    const day = businessDayStart(subDays(now, days - 1 - i));
    const next = businessDayStart(subDays(now, days - 2 - i));
    return {
      label: format(day, "dd MMM"),
      value: rows.filter((r) => r.createdAt >= day && r.createdAt < next)
        .length,
    };
  });
}

/**
 * Today's and the next seven days' handovers.
 *
 * Its own reader because the calendar needs exactly this and nothing else.
 * It used to call getDashboardData for it — thirteen queries for two lists —
 * which made the calendar the heaviest page in the app at nineteen.
 *
 * `select`, not `include`: these rows go to a client component, and
 * Prisma.Decimal cannot cross that boundary.
 */
const scheduleSelect = {
  id: true,
  pickupDate: true,
  returnDate: true,
  vehicle: { select: { brand: true, model: true, plate: true } },
  customer: { select: { firstName: true, lastName: true } },
} as const;

const SCHEDULE_HORIZON_DAYS = 7;

export async function getUpcomingSchedule(now = new Date()) {
  // Rental dates, so calendar-day bounds: today through the horizon's last
  // day. The instant the branch's day began (businessDayStart) is the
  // previous evening in UTC, and a rental date stored late that evening fell
  // inside it.
  const window = businessRentalDays(now, SCHEDULE_HORIZON_DAYS);

  const [upcomingPickups, upcomingReturns] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: "CONFIRMED", pickupDate: window },
      orderBy: { pickupDate: "asc" },
      take: 5,
      select: scheduleSelect,
    }),
    prisma.reservation.findMany({
      where: { status: "ACTIVE", returnDate: window },
      orderBy: { returnDate: "asc" },
      take: 5,
      select: scheduleSelect,
    }),
  ]);

  return { upcomingPickups, upcomingReturns };
}

/** `now` is a parameter so tests can read a window no other row touches. */
export async function getDashboardData(now = new Date()) {
  const businessToday = businessTodayAsRentalDate(now);

  const [
    [
      fleetTotal,
      available,
      rentedNow,
      maintenance,
      pending,
      recentReservations,
      pendingRequests,
      overdue,
    ],
    { upcomingPickups, upcomingReturns },
    monthRevenue,
    weekRevenue,
  ] = await Promise.all([
    prisma.$transaction([
      prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
      prisma.reservation.count({ where: { status: "ACTIVE" } }),
      prisma.vehicle.count({ where: { status: "SERVICE" } }),
      // Expired requests are not waiting on anyone: their pickup day passed.
      prisma.reservation.count({ where: actionableRequestWhere(now) }),
      prisma.reservation.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
      // The queue that should be cleared before the day's numbers matter.
      // Soonest pickup first: that is the decision that runs out of time
      // first. Expired requests are left to the reservations page.
      prisma.reservation.findMany({
        where: actionableRequestWhere(now),
        orderBy: [{ pickupDate: "asc" }, { createdAt: "asc" }],
        take: 10,
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          customer: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              notes: true,
            },
          },
        },
      }),
      prisma.reservation.count({
        where: {
          OR: [
            { status: "CONFIRMED", pickupDate: { lt: businessToday } },
            { status: "ACTIVE", returnDate: { lt: businessToday } },
          ],
        },
      }),
    ]),
    getUpcomingSchedule(now),
    // The chart's last month and the "this month" KPI are one query, so they
    // cannot disagree. Both count per rental day; see revenueByBucket.
    revenueSeriesFor("month", 6, now),
    revenueSeriesFor("week", 1, now),
  ]);

  return {
    kpis: {
      fleetTotal,
      available,
      rentedNow,
      maintenance,
      pending,
      overdue,
      utilization: fleetTotal ? Math.round((rentedNow / fleetTotal) * 100) : 0,
      revenueWeek: weekRevenue.current,
      revenueMonth: monthRevenue.current,
    },
    revenueSeries: monthRevenue.series,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
    pendingRequests,
  };
}

/** `now` is a parameter so tests can pin the branch's day. */
export async function getReservationInsights(now = new Date()) {
  // Two "todays", one per time model (see business-time.ts): an instant for
  // createdAt, calendar days for pickup and return dates.
  const todayStart = businessDayStart(now);
  const today = businessRentalDays(now);
  const businessToday = today.gte;

  const [
    byStatus,
    activityRows,
    todaysPickups,
    todaysReturns,
    overduePickups,
    overdueReturns,
    pendingActionable,
  ] = await Promise.all([
    prisma.reservation.groupBy({ by: ["status"], _count: true }),
    prisma.reservation.findMany({
      where: { createdAt: { gte: subDays(todayStart, 13) } },
      select: { createdAt: true },
    }),
    prisma.reservation.count({
      where: { status: "CONFIRMED", pickupDate: today },
    }),
    prisma.reservation.count({
      where: { status: "ACTIVE", returnDate: today },
    }),
    // "Overdue" is two different jobs, counted apart so the status tabs can
    // each flag their own: a car that should have gone out, and one that
    // should have come back. Their sum is the header's overdue figure.
    prisma.reservation.count({
      where: { status: "CONFIRMED", pickupDate: { lt: businessToday } },
    }),
    prisma.reservation.count({
      where: { status: "ACTIVE", returnDate: { lt: businessToday } },
    }),
    prisma.reservation.count({ where: actionableRequestWhere(now) }),
  ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count])
  ) as Record<string, number>;

  return {
    statusCounts,
    /** PENDING minus expired: the requests that still need a decision. */
    pendingActionable,
    activitySeries: dailySeries(activityRows, 14),
    todaysPickups,
    todaysReturns,
    overdue: overduePickups + overdueReturns,
    /** CONFIRMED whose pickup day has passed with no handover recorded. */
    overduePickups,
    /** ACTIVE whose return day has passed with no return recorded. */
    overdueReturns,
  };
}

export async function getFleetInsights() {
  const [byStatus, byCategory, utilizationRows] = await Promise.all([
    prisma.vehicle.groupBy({ by: ["status"], _count: true }),
    prisma.vehicle.groupBy({
      by: ["category"],
      _count: true,
      where: { status: { not: "INACTIVE" } },
    }),
    prisma.reservation.groupBy({
      by: ["vehicleId"],
      _count: true,
      where: { status: { in: ["ACTIVE", "COMPLETED", "CONFIRMED"] } },
      orderBy: { _count: { vehicleId: "desc" } },
      take: 5,
    }),
  ]);

  const topVehicleIds = utilizationRows.map((r) => r.vehicleId);
  const topVehicles = topVehicleIds.length
    ? await prisma.vehicle.findMany({
        where: { id: { in: topVehicleIds } },
        select: { id: true, brand: true, model: true, plate: true, year: true },
      })
    : [];
  const nameOf = (id: string) => {
    const v = topVehicles.find((t) => t.id === id);
    return v ? vehicleLabel(v) : "Removed vehicle";
  };

  return {
    statusCounts: Object.fromEntries(
      byStatus.map((r) => [r.status, r._count])
    ) as Record<string, number>,
    categoryDistribution: byCategory.map((r) => ({
      label: r.category.charAt(0) + r.category.slice(1).toLowerCase(),
      value: r._count,
    })),
    topVehicles: utilizationRows.map((r) => ({
      label: nameOf(r.vehicleId),
      value: r._count,
    })),
  };
}

export async function getCustomerInsights() {
  const now = new Date();
  const monthStart = businessMonthStart(now);

  const [total, newThisMonth, perCustomer, spenders, registrationRows] =
    await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.reservation.groupBy({ by: ["customerId"], _count: true }),
      prisma.reservation.groupBy({
        by: ["customerId"],
        _sum: { totalPrice: true },
        where: { status: { in: ["ACTIVE", "COMPLETED"] } },
        orderBy: { _sum: { totalPrice: "desc" } },
        take: 5,
      }),
      prisma.customer.findMany({
        where: { createdAt: { gte: subMonths(now, 6) } },
        select: { createdAt: true },
      }),
    ]);

  const spenderIds = spenders.map((s) => s.customerId);
  const spenderNames = spenderIds.length
    ? await prisma.customer.findMany({
        where: { id: { in: spenderIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];

  return {
    total,
    newThisMonth,
    returning: perCustomer.filter((c) => c._count > 1).length,
    topSpenders: spenders.map((s) => {
      const c = spenderNames.find((n) => n.id === s.customerId);
      return {
        label: c ? `${c.firstName} ${c.lastName}` : "Removed customer",
        value: Math.round(Number(s._sum?.totalPrice ?? 0)),
      };
    }),
    growthSeries: monthlySeriesFromDates(registrationRows, 6),
  };
}

function monthlySeriesFromDates(
  rows: { createdAt: Date }[],
  months: number
): SeriesPoint[] {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const month = businessMonthStart(subMonths(now, months - 1 - i));
    const next = businessMonthStart(subMonths(now, months - 2 - i));
    return {
      label: format(month, "MMM"),
      value: rows.filter((r) => r.createdAt >= month && r.createdAt < next)
        .length,
    };
  });
}

export type Period = BucketUnit;

/** How many buckets each reporting period shows. */
const PERIOD_BUCKETS: Record<Period, number> = {
  week: 12,
  month: 12,
  year: 5,
};

/** `now` is a parameter so tests can read a window no other row touches. */
export async function getAnalytics(period: Period = "month", now = new Date()) {
  // Window the whole page to the selected period, KPIs included: the same
  // calendar buckets drive the revenue chart, the bookings chart and the
  // counts, so the figures and the charts cover exactly the same span. The
  // current bucket is included in full — confirmed days later this month are
  // this month's revenue.
  const { starts, end } = businessBuckets(period, PERIOD_BUCKETS[period], now);
  const since = businessDayStartOf(starts[0]!);
  const until = businessDayStartOf(end);
  const made = { createdAt: { gte: since, lt: until } };

  const [revenue, bookingsSeries, fleet, cancelled, totalReservations] =
    await Promise.all([
      revenueSeriesFor(period, PERIOD_BUCKETS[period], now),
      bookingsByBucket(period, starts, end),
      prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.reservation.count({ where: { status: "CANCELLED", ...made } }),
      prisma.reservation.count({ where: made }),
    ]);

  const [fleetInsights, customerInsights] = await Promise.all([
    getFleetInsights(),
    getCustomerInsights(),
  ]);

  return {
    revenueByMonth: revenue.series,
    bookingsByMonth: bookingsSeries,
    cancellationRate: totalReservations
      ? Math.round((cancelled / totalReservations) * 100)
      : 0,
    totalRevenue: revenue.total,
    totalReservations,
    fleet,
    topVehicles: fleetInsights.topVehicles,
    categoryDistribution: fleetInsights.categoryDistribution,
    customerGrowth: customerInsights.growthSeries,
  };
}
