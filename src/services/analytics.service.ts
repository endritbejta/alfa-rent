import { addDays, format, subMonths, subDays } from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { vehicleLabel } from "@/lib/vehicle-label";
import {
  businessDay,
  businessDayStart,
  businessMonthStart,
  businessWeekStart,
  businessYearStart,
} from "@/lib/reservation-lifecycle";

export type SeriesPoint = { label: string; value: number };

const REVENUE_STATUSES = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

/** Bucket reservations into calendar months for trend charts. */
function monthlySeries(
  rows: { createdAt: Date; totalPrice: unknown; status: string }[],
  months: number,
  pick: (row: { totalPrice: unknown; status: string }) => number
): SeriesPoint[] {
  const now = new Date();
  return Array.from({ length: months }, (_, i) => {
    const month = businessMonthStart(subMonths(now, months - 1 - i));
    const next = businessMonthStart(subMonths(now, months - 2 - i));
    const value = rows
      .filter((r) => r.createdAt >= month && r.createdAt < next)
      .reduce((sum, r) => sum + pick(r), 0);
    return { label: format(month, "MMM"), value: Math.round(value) };
  });
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

export async function getUpcomingSchedule() {
  const todayStart = businessDayStart(new Date());
  const horizon = addDays(todayStart, SCHEDULE_HORIZON_DAYS);

  const [upcomingPickups, upcomingReturns] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        status: "CONFIRMED",
        pickupDate: { gte: todayStart, lt: horizon },
      },
      orderBy: { pickupDate: "asc" },
      take: 5,
      select: scheduleSelect,
    }),
    prisma.reservation.findMany({
      where: {
        status: "ACTIVE",
        returnDate: { gte: todayStart, lt: horizon },
      },
      orderBy: { returnDate: "asc" },
      take: 5,
      select: scheduleSelect,
    }),
  ]);

  return { upcomingPickups, upcomingReturns };
}

export async function getDashboardData() {
  const now = new Date();
  const weekStart = businessWeekStart(now);
  const monthStart = businessMonthStart(now);
  const businessToday = new Date(`${businessDay(now)}T00:00:00.000Z`);

  const [
    [
      fleetTotal,
      available,
      rentedNow,
      maintenance,
      pending,
      revenueWeek,
      revenueMonth,
      recentReservations,
      pendingRequests,
      revenueRows,
      overdue,
    ],
    { upcomingPickups, upcomingReturns },
  ] = await Promise.all([
    prisma.$transaction([
      prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
      prisma.reservation.count({ where: { status: "ACTIVE" } }),
      prisma.vehicle.count({ where: { status: "SERVICE" } }),
      prisma.reservation.count({ where: { status: "PENDING" } }),
      prisma.reservation.aggregate({
        _sum: { totalPrice: true },
        where: {
          status: { in: [...REVENUE_STATUSES] },
          createdAt: { gte: weekStart },
        },
      }),
      prisma.reservation.aggregate({
        _sum: { totalPrice: true },
        where: {
          status: { in: [...REVENUE_STATUSES] },
          createdAt: { gte: monthStart },
        },
      }),
      prisma.reservation.findMany({
        take: 6,
        orderBy: { createdAt: "desc" },
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
      // The queue that should be cleared before the day's numbers matter.
      prisma.reservation.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 10,
        include: {
          vehicle: { select: { brand: true, model: true, plate: true } },
          customer: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.reservation.findMany({
        where: { createdAt: { gte: subMonths(now, 6) } },
        select: { createdAt: true, totalPrice: true, status: true },
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
    getUpcomingSchedule(),
  ]);

  const revenueSeries = monthlySeries(revenueRows, 6, (r) =>
    (REVENUE_STATUSES as readonly string[]).includes(r.status)
      ? Number(r.totalPrice)
      : 0
  );

  return {
    kpis: {
      fleetTotal,
      available,
      rentedNow,
      maintenance,
      pending,
      overdue,
      utilization: fleetTotal ? Math.round((rentedNow / fleetTotal) * 100) : 0,
      revenueWeek: Number(revenueWeek._sum.totalPrice ?? 0),
      revenueMonth: Number(revenueMonth._sum.totalPrice ?? 0),
    },
    revenueSeries,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
    pendingRequests,
  };
}

export async function getReservationInsights() {
  const now = new Date();
  const todayStart = businessDayStart(now);
  const todayEnd = addDays(todayStart, 1);
  const businessToday = new Date(`${businessDay(now)}T00:00:00.000Z`);

  const [byStatus, activityRows, todaysPickups, todaysReturns, overdue] =
    await Promise.all([
      prisma.reservation.groupBy({ by: ["status"], _count: true }),
      prisma.reservation.findMany({
        where: { createdAt: { gte: subDays(todayStart, 13) } },
        select: { createdAt: true },
      }),
      prisma.reservation.count({
        where: {
          status: "CONFIRMED",
          pickupDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.reservation.count({
        where: {
          status: "ACTIVE",
          returnDate: { gte: todayStart, lt: todayEnd },
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
    ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count])
  ) as Record<string, number>;

  return {
    statusCounts,
    activitySeries: dailySeries(activityRows, 14),
    todaysPickups,
    todaysReturns,
    overdue,
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

export type Period = "week" | "month" | "year";

/**
 * Bucket definition per reporting period.
 *
 * `boundary(now, k)` is the start of the bucket k periods before now, resolved
 * from the branch calendar each time rather than by adding a fixed duration to
 * a single anchor. Adding durations drifts across a daylight-saving change,
 * because a Belgrade day is 23 or 25 hours through one.
 */
const PERIODS: Record<
  Period,
  {
    label: string;
    buckets: number;
    boundary: (now: Date, periodsAgo: number) => Date;
    format: string;
  }
> = {
  week: {
    label: "Last 12 weeks",
    buckets: 12,
    boundary: (now, k) => businessWeekStart(subDays(now, k * 7)),
    format: "dd MMM",
  },
  month: {
    label: "Last 12 months",
    buckets: 12,
    boundary: (now, k) => businessMonthStart(subMonths(now, k)),
    format: "MMM",
  },
  year: {
    label: "Last 5 years",
    buckets: 5,
    boundary: (now, k) => businessYearStart(subMonths(now, k * 12)),
    format: "yyyy",
  },
};

function bucketSeries(
  rows: { createdAt: Date; totalPrice: unknown; status: string }[],
  period: Period,
  pick: (row: { totalPrice: unknown; status: string }) => number
): SeriesPoint[] {
  const cfg = PERIODS[period];
  const now = new Date();
  return Array.from({ length: cfg.buckets }, (_, i) => {
    const from = cfg.boundary(now, cfg.buckets - 1 - i);
    const to = cfg.boundary(now, cfg.buckets - 2 - i);
    const value = rows
      .filter((r) => r.createdAt >= from && r.createdAt < to)
      .reduce((sum, r) => sum + pick(r), 0);
    return { label: format(from, cfg.format), value: Math.round(value) };
  });
}

export async function getAnalytics(period: Period = "month") {
  const now = new Date();
  const cfg = PERIODS[period];
  // Window the whole page to the selected period, KPIs included. Same
  // boundary the first bucket uses, so the KPIs and the chart cover exactly
  // the same span.
  const since = cfg.boundary(now, cfg.buckets - 1);

  const [rows, fleet, cancelled, totalReservations] = await prisma.$transaction(
    [
      prisma.reservation.findMany({
        where: { createdAt: { gte: since } },
        select: { createdAt: true, totalPrice: true, status: true },
      }),
      prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.reservation.count({
        where: { status: "CANCELLED", createdAt: { gte: since } },
      }),
      prisma.reservation.count({ where: { createdAt: { gte: since } } }),
    ]
  );

  const [fleetInsights, customerInsights] = await Promise.all([
    getFleetInsights(),
    getCustomerInsights(),
  ]);

  return {
    periodLabel: cfg.label,
    revenueByMonth: bucketSeries(rows, period, (r) =>
      (REVENUE_STATUSES as readonly string[]).includes(r.status)
        ? Number(r.totalPrice)
        : 0
    ),
    bookingsByMonth: bucketSeries(rows, period, () => 1),
    cancellationRate: totalReservations
      ? Math.round((cancelled / totalReservations) * 100)
      : 0,
    totalRevenue: rows
      .filter((r) => (REVENUE_STATUSES as readonly string[]).includes(r.status))
      .reduce((sum, r) => sum + Number(r.totalPrice), 0),
    totalReservations,
    fleet,
    topVehicles: fleetInsights.topVehicles,
    categoryDistribution: fleetInsights.categoryDistribution,
    customerGrowth: customerInsights.growthSeries,
  };
}
