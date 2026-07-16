import {
  addDays,
  addMonths,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subDays,
} from "date-fns";
import { prisma } from "@/lib/db/prisma";
import { vehicleLabel } from "@/utils/vehicle";

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
    const month = startOfMonth(subMonths(now, months - 1 - i));
    const next = startOfMonth(subMonths(now, months - 2 - i));
    const value = rows
      .filter((r) => r.createdAt >= month && r.createdAt < next)
      .reduce((sum, r) => sum + pick(r), 0);
    return { label: format(month, "MMM"), value: Math.round(value) };
  });
}

function dailySeries(rows: { createdAt: Date }[], days: number): SeriesPoint[] {
  const today = startOfDay(new Date());
  return Array.from({ length: days }, (_, i) => {
    const day = subDays(today, days - 1 - i);
    const next = addDays(day, 1);
    return {
      label: format(day, "dd MMM"),
      value: rows.filter((r) => r.createdAt >= day && r.createdAt < next)
        .length,
    };
  });
}

export async function getDashboardData() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const monthStart = startOfMonth(now);
  const horizon = addDays(todayStart, 7);

  const [
    fleetTotal,
    available,
    rentedNow,
    maintenance,
    pending,
    revenueWeek,
    revenueMonth,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
    revenueRows,
  ] = await prisma.$transaction([
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
      where: {
        status: "CONFIRMED",
        pickupDate: { gte: todayStart, lt: horizon },
      },
      orderBy: { pickupDate: "asc" },
      take: 5,
      include: {
        vehicle: { select: { brand: true, model: true, plate: true } },
        customer: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.reservation.findMany({
      where: {
        status: "ACTIVE",
        returnDate: { gte: todayStart, lt: horizon },
      },
      orderBy: { returnDate: "asc" },
      take: 5,
      include: {
        vehicle: { select: { brand: true, model: true, plate: true } },
        customer: { select: { firstName: true, lastName: true } },
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
    prisma.reservation.findMany({
      where: { createdAt: { gte: subMonths(now, 6) } },
      select: { createdAt: true, totalPrice: true, status: true },
    }),
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
      utilization: fleetTotal ? Math.round((rentedNow / fleetTotal) * 100) : 0,
      revenueWeek: Number(revenueWeek._sum.totalPrice ?? 0),
      revenueMonth: Number(revenueMonth._sum.totalPrice ?? 0),
    },
    revenueSeries,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
  };
}

export async function getReservationInsights() {
  const todayStart = startOfDay(new Date());
  const todayEnd = addDays(todayStart, 1);

  const [byStatus, activityRows, todaysPickups, todaysReturns] =
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
    ]);

  const statusCounts = Object.fromEntries(
    byStatus.map((row) => [row.status, row._count])
  ) as Record<string, number>;

  return {
    statusCounts,
    activitySeries: dailySeries(activityRows, 14),
    todaysPickups,
    todaysReturns,
  };
}

export async function getFleetInsights() {
  const [byStatus, byCategory, utilizationRows, recentlyAdded] =
    await Promise.all([
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
      prisma.vehicle.findMany({
        take: 3,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          brand: true,
          model: true,
          plate: true,
          year: true,
          createdAt: true,
        },
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
    recentlyAdded,
  };
}

export async function getCustomerInsights() {
  const now = new Date();
  const monthStart = startOfMonth(now);

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
    const month = startOfMonth(subMonths(now, months - 1 - i));
    const next = startOfMonth(subMonths(now, months - 2 - i));
    return {
      label: format(month, "MMM"),
      value: rows.filter((r) => r.createdAt >= month && r.createdAt < next)
        .length,
    };
  });
}

export type Period = "week" | "month" | "year";

/** Bucket definition per reporting period: how far back, and how to slice. */
const PERIODS: Record<
  Period,
  {
    label: string;
    buckets: number;
    step: (d: Date, n: number) => Date;
    start: (d: Date) => Date;
    format: string;
  }
> = {
  week: {
    label: "Last 12 weeks",
    buckets: 12,
    step: (d, n) => addDays(d, n * 7),
    start: (d) => startOfWeek(d, { weekStartsOn: 1 }),
    format: "dd MMM",
  },
  month: {
    label: "Last 12 months",
    buckets: 12,
    step: (d, n) => addMonths(d, n),
    start: startOfMonth,
    format: "MMM",
  },
  year: {
    label: "Last 5 years",
    buckets: 5,
    step: (d, n) => addMonths(d, n * 12),
    start: startOfYear,
    format: "yyyy",
  },
};

function bucketSeries(
  rows: { createdAt: Date; totalPrice: unknown; status: string }[],
  period: Period,
  pick: (row: { totalPrice: unknown; status: string }) => number
): SeriesPoint[] {
  const cfg = PERIODS[period];
  const anchor = cfg.start(new Date());
  return Array.from({ length: cfg.buckets }, (_, i) => {
    const from = cfg.step(anchor, i - (cfg.buckets - 1));
    const to = cfg.step(anchor, i - (cfg.buckets - 2));
    const value = rows
      .filter((r) => r.createdAt >= from && r.createdAt < to)
      .reduce((sum, r) => sum + pick(r), 0);
    return { label: format(from, cfg.format), value: Math.round(value) };
  });
}

export async function getAnalytics(period: Period = "month") {
  const now = new Date();
  const cfg = PERIODS[period];
  // Window the whole page to the selected period, KPIs included.
  const since = cfg.step(cfg.start(now), -(cfg.buckets - 1));

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
