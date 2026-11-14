import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { vehicleLabel } from "@/lib/vehicle-label";
import { BUSINESS_TIME_ZONE } from "@/lib/business-time";
import type { BucketUnit } from "@/lib/business-buckets";
import {
  addDays,
  elapsedPart,
  periodBuckets,
  type PeriodBucket,
} from "@/lib/analytics-period";
import {
  averageFleet,
  cents,
  fleetWindow,
  overlapDays,
  ratio,
  type FleetWindow,
} from "@/lib/analytics-metrics";
import { revenueRows, type RevenueRow } from "@/services/analytics.service";

/**
 * The analytics page's report for one period: every figure computed in
 * Postgres from the reservations themselves, summed per bucket, and shaped
 * here into plain numbers (no Decimal leaves this module).
 *
 * The definitions — what each figure counts and why — live with the code
 * that computes them, below, and are restated in the page's own glossary.
 *
 * Two dates attribute a reservation to a period, deliberately:
 *
 * - **Money** follows the rental days (revenueRows): a rental from 28 Oct to
 *   3 Nov is part October revenue and part November revenue.
 * - **Counts** follow the pickup day: a reservation is one event, and
 *   counting it in every month it touches would count it twice.
 *
 * Rental dates are naive calendar values, so `"pickupDate"::date` is already
 * the branch day. `createdAt` is a real instant and is converted to branch
 * time before it is bucketed.
 */

type Range = { from: string; to: string };

/** Statuses whose money is earned: the rental has happened or is happening. */
const RENTED = ["ACTIVE", "COMPLETED"] as const;

/** Statuses that hold a car: everything but undecided and cancelled. */
const BOOKED = ["CONFIRMED", "ACTIVE", "COMPLETED"] as const;

const exclusive = (range: Range) => addDays(range.to, 1);

// --- Vehicles ---------------------------------------------------------------

export type FleetVehicle = {
  id: string;
  label: string;
  plate: string | null;
  category: string;
  status: string;
  window: FleetWindow;
};

/**
 * Every vehicle with the days it was part of the fleet (see fleetWindow).
 * One row per car, not per reservation: the first and last rental days are
 * aggregated in the query.
 */
async function fleetVehicles(): Promise<FleetVehicle[]> {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      brand: string;
      model: string;
      plate: string | null;
      year: number;
      category: string;
      status: string;
      added: string;
      first_rental: string | null;
      last_rental: string | null;
      retired: string | null;
    }[]
  >(Prisma.sql`
    SELECT v.id, v.brand, v.model, v.plate, v.year,
           v.category::text AS category, v.status::text AS status,
           to_char((v."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD') AS added,
           to_char(r.first_day, 'YYYY-MM-DD') AS first_rental,
           to_char(r.last_day, 'YYYY-MM-DD') AS last_rental,
           CASE WHEN v.status = 'INACTIVE' THEN to_char(
             (COALESCE(
               (SELECT MAX(a."createdAt") FROM audit_events a
                WHERE a.entity = 'vehicle' AND a."entityId" = v.id
                  AND (a.action = 'vehicle.retire'
                       OR (a.action = 'vehicle.update' AND a.after->>'status' = 'INACTIVE'))),
               v."updatedAt"
             ) AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}, 'YYYY-MM-DD')
           END AS retired
    FROM vehicles v
    LEFT JOIN (
      SELECT "vehicleId",
             MIN("pickupDate"::date) AS first_day,
             MAX(CASE WHEN "actualDays" IS NOT NULL
                      THEN "pickupDate"::date + "actualDays" - 1
                      ELSE "returnDate"::date END) AS last_day
      FROM reservations
      WHERE status::text = ANY(${[...RENTED]})
      GROUP BY 1
    ) r ON r."vehicleId" = v.id
  `);
  return rows.map((row) => ({
    id: row.id,
    label: vehicleLabel(row),
    plate: row.plate,
    category: row.category,
    status: row.status,
    window: fleetWindow({
      added: row.added,
      firstRental: row.first_rental,
      retired: row.retired,
      lastRental: row.last_rental,
    }),
  }));
}

// --- Rented days (utilisation) ----------------------------------------------

type OccupancyRow = { bucket: string; vehicleId: string; days: number };

/**
 * Days each car was actually out, per bucket, up to and including `today`.
 *
 * A completed rental occupies its pickup day through the day it came back
 * (`actualDays`, recorded at every completion since early-return billing;
 * older rows fall back to the booked return day plus any late days). An
 * active rental occupies through its return day, or through today if it is
 * overdue — the car is still out. Future days are not "rented" yet.
 */
async function occupancyRows(
  unit: BucketUnit,
  range: Range,
  today: string
): Promise<OccupancyRow[]> {
  const elapsed = elapsedPart(range, today);
  if (!elapsed) return [];
  return prisma.$queryRaw<OccupancyRow[]>(Prisma.sql`
    SELECT to_char(date_trunc(${unit}, d.day), 'YYYY-MM-DD') AS bucket,
           o."vehicleId", COUNT(*)::int AS days
    FROM (
      SELECT "vehicleId", "pickupDate"::date AS first_day,
             CASE WHEN status = 'ACTIVE'
                    THEN GREATEST("returnDate"::date, ${today}::date)
                  WHEN "actualDays" IS NOT NULL
                    THEN "pickupDate"::date + "actualDays" - 1
                  ELSE "returnDate"::date + COALESCE("lateDays", 0)
             END AS last_day
      FROM reservations
      WHERE status::text = ANY(${[...RENTED]})
        AND "pickupDate" < ${addDays(elapsed.to, 1)}::date
    ) o
    CROSS JOIN LATERAL generate_series(
      GREATEST(o.first_day, ${elapsed.from}::date),
      LEAST(o.last_day, ${elapsed.to}::date),
      interval '1 day'
    ) AS d(day)
    GROUP BY 1, 2
  `);
}

// --- Reservations -----------------------------------------------------------

type ReservationRow = {
  bucket: string;
  status: string;
  /** Pickup day already passed: a PENDING row like this is a lapsed request. */
  past: boolean;
  count: number;
  value: number;
  /** Rental days: the days actually out once completed, else the booked days. */
  days: number;
  /** Original amounts of rentals billed for the days used, and what was charged. */
  earlyBooked: number;
  earlyCharged: number;
};

async function reservationRows(
  unit: BucketUnit,
  range: Range,
  today: string
): Promise<ReservationRow[]> {
  const rows = await prisma.$queryRaw<
    (Omit<ReservationRow, "value" | "earlyBooked" | "earlyCharged"> & {
      value: Prisma.Decimal;
      early_booked: Prisma.Decimal | null;
      early_charged: Prisma.Decimal | null;
    })[]
  >(Prisma.sql`
    SELECT to_char(date_trunc(${unit}, "pickupDate"::date), 'YYYY-MM-DD') AS bucket,
           status::text AS status,
           ("pickupDate"::date < ${today}::date) AS past,
           COUNT(*)::int AS count,
           SUM("totalPrice") AS value,
           SUM(CASE WHEN "actualDays" IS NOT NULL THEN "actualDays"
                    ELSE "returnDate"::date - "pickupDate"::date + 1 END)::int AS days,
           SUM("bookedTotal") FILTER (WHERE "earlyReturnBilling" = 'ACTUAL_DAYS') AS early_booked,
           SUM("totalPrice") FILTER (WHERE "earlyReturnBilling" = 'ACTUAL_DAYS') AS early_charged
    FROM reservations
    WHERE "pickupDate" >= ${range.from}::date
      AND "pickupDate" < ${exclusive(range)}::date
    GROUP BY 1, 2, 3
  `);
  return rows.map(({ early_booked, early_charged, ...row }) => ({
    ...row,
    value: Number(row.value),
    earlyBooked: Number(early_booked ?? 0),
    earlyCharged: Number(early_charged ?? 0),
  }));
}

/** Pickups per weekday (ISO: 1 = Monday) of reservations that hold a car. */
async function pickupWeekdays(range: Range): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ dow: number; count: number }[]>(
    Prisma.sql`
      SELECT EXTRACT(ISODOW FROM "pickupDate")::int AS dow, COUNT(*)::int AS count
      FROM reservations
      WHERE status::text = ANY(${[...BOOKED]})
        AND "pickupDate" >= ${range.from}::date
        AND "pickupDate" < ${exclusive(range)}::date
      GROUP BY 1
    `
  );
  return Array.from(
    { length: 7 },
    (_, i) => rows.find((row) => row.dow === i + 1)?.count ?? 0
  );
}

/** Per vehicle: rentals (active or completed) picked up in the range. */
async function vehicleRentals(range: Range) {
  const rows = await prisma.$queryRaw<
    { vehicleId: string; count: number; value: Prisma.Decimal; days: number }[]
  >(Prisma.sql`
    SELECT "vehicleId", COUNT(*)::int AS count, SUM("totalPrice") AS value,
           SUM(CASE WHEN "actualDays" IS NOT NULL THEN "actualDays"
                    ELSE "returnDate"::date - "pickupDate"::date + 1 END)::int AS days
    FROM reservations
    WHERE status::text = ANY(${[...RENTED]})
      AND "pickupDate" >= ${range.from}::date
      AND "pickupDate" < ${exclusive(range)}::date
    GROUP BY 1
  `);
  return new Map(
    rows.map((row) => [
      row.vehicleId,
      { count: row.count, value: Number(row.value), days: row.days },
    ])
  );
}

// --- Customers --------------------------------------------------------------

/**
 * Customers who rented in the range, split by whether they had rented
 * before it. A customer record is made by any booking request, so a record
 * is not a renter: only an active or completed rental makes one.
 */
async function customerSummary(range: Range) {
  const [row] = await prisma.$queryRaw<
    {
      renting: number;
      first_time: number;
      returning: number;
      rentals: number;
      multi: number;
      new_records: number;
      ever_rented: number;
      ever_repeat: number;
    }[]
  >(Prisma.sql`
    WITH rentals AS (
      SELECT "customerId", "pickupDate"::date AS day
      FROM reservations
      WHERE status::text = ANY(${[...RENTED]})
        AND "pickupDate" < ${exclusive(range)}::date
    ),
    firsts AS (SELECT "customerId", MIN(day) AS first FROM rentals GROUP BY 1),
    in_range AS (
      SELECT "customerId", COUNT(*)::int AS n
      FROM rentals WHERE day >= ${range.from}::date GROUP BY 1
    ),
    to_date AS (SELECT "customerId", COUNT(*) AS n FROM rentals GROUP BY 1)
    SELECT
      COUNT(i.*)::int AS renting,
      COUNT(i.*) FILTER (WHERE f.first >= ${range.from}::date)::int AS first_time,
      COUNT(i.*) FILTER (WHERE f.first < ${range.from}::date)::int AS returning,
      COALESCE(SUM(i.n), 0)::int AS rentals,
      COUNT(i.*) FILTER (WHERE i.n > 1)::int AS multi,
      (SELECT COUNT(*)::int FROM customers
        WHERE ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}
              >= ${range.from}::date
          AND ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE}
              < ${exclusive(range)}::date) AS new_records,
      (SELECT COUNT(*)::int FROM to_date) AS ever_rented,
      (SELECT COUNT(*)::int FROM to_date WHERE n > 1) AS ever_repeat
    FROM in_range i JOIN firsts f USING ("customerId")
  `);
  return {
    renting: row.renting,
    firstTime: row.first_time,
    returning: row.returning,
    rentals: row.rentals,
    /** Renters with more than one rental starting inside the range. */
    multi: row.multi,
    newRecords: row.new_records,
    everRented: row.ever_rented,
    everRepeat: row.ever_repeat,
  };
}

/** New customer records and first rentals, per bucket. */
async function customerSeries(unit: BucketUnit, range: Range) {
  const rows = await prisma.$queryRaw<
    { bucket: string; kind: "record" | "first"; count: number }[]
  >(Prisma.sql`
    SELECT to_char(date_trunc(${unit}, local), 'YYYY-MM-DD') AS bucket,
           'record' AS kind, COUNT(*)::int AS count
    FROM (SELECT ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${BUSINESS_TIME_ZONE} AS local
          FROM customers) c
    WHERE local >= ${range.from}::date AND local < ${exclusive(range)}::date
    GROUP BY 1
    UNION ALL
    SELECT to_char(date_trunc(${unit}, first), 'YYYY-MM-DD'), 'first', COUNT(*)::int
    FROM (SELECT MIN("pickupDate"::date) AS first FROM reservations
          WHERE status::text = ANY(${[...RENTED]}) GROUP BY "customerId") f
    WHERE first >= ${range.from}::date AND first < ${exclusive(range)}::date
    GROUP BY 1
  `);
  return rows;
}

/**
 * The customers who brought the most money in the range. Names only — no
 * contact details in an aggregate view — and an anonymised customer is
 * flagged so the page says so instead of printing the placeholder.
 */
async function topCustomers(range: Range) {
  const rows = await prisma.$queryRaw<
    {
      id: string;
      firstName: string;
      lastName: string;
      anonymised: boolean;
      count: number;
      value: Prisma.Decimal;
    }[]
  >(Prisma.sql`
    SELECT c.id, c."firstName", c."lastName",
           (c."anonymisedAt" IS NOT NULL) AS anonymised,
           COUNT(*)::int AS count, SUM(r."totalPrice") AS value
    FROM reservations r JOIN customers c ON c.id = r."customerId"
    WHERE r.status::text = ANY(${[...RENTED]})
      AND r."pickupDate" >= ${range.from}::date
      AND r."pickupDate" < ${exclusive(range)}::date
    GROUP BY c.id
    ORDER BY SUM(r."totalPrice") DESC, COUNT(*) DESC, c.id
    LIMIT 8
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.anonymised ? null : `${row.firstName} ${row.lastName}`.trim(),
    rentals: row.count,
    value: cents(Number(row.value)),
  }));
}

/** The first and last rental day on record, for "all time" and the month picker. */
export async function getDataSpan(): Promise<{
  first: string;
  last: string;
} | null> {
  const [row] = await prisma.$queryRaw<
    { first: string | null; last: string | null }[]
  >(Prisma.sql`
    SELECT to_char(MIN("pickupDate"::date), 'YYYY-MM-DD') AS first,
           to_char(MAX("returnDate"::date), 'YYYY-MM-DD') AS last
    FROM reservations
  `);
  return row?.first && row.last ? { first: row.first, last: row.last } : null;
}

// --- Assembly ---------------------------------------------------------------

export type RevenueSplit = {
  /** COMPLETED rentals: final amounts, early returns at what was charged. */
  realised: number;
  /** ACTIVE rentals, their days up to today. May still change at return. */
  accruing: number;
  /** CONFIRMED bookings, plus active rentals' days after today. */
  upcoming: number;
};

export type BucketFigures = PeriodBucket & {
  revenue: RevenueSplit;
  reservations: Record<string, number>;
  lapsed: number;
  cancelledValue: number;
  fleetDays: number;
  rentedDays: number;
  newRecords: number;
  firstRentals: number;
};

const emptySplit = (): RevenueSplit => ({
  realised: 0,
  accruing: 0,
  upcoming: 0,
});

function addRevenue(split: RevenueSplit, row: RevenueRow) {
  if (row.status === "CONFIRMED" || row.ahead) split.upcoming += row.revenue;
  else if (row.status === "ACTIVE") split.accruing += row.revenue;
  else split.realised += row.revenue;
}

const roundSplit = (split: RevenueSplit): RevenueSplit => ({
  realised: cents(split.realised),
  accruing: cents(split.accruing),
  upcoming: cents(split.upcoming),
});

/**
 * The figures for one period: totals and per-bucket series. The comparison
 * period goes through this same function, so the two can only differ by
 * their data.
 */
async function periodFigures(
  range: Range,
  unit: BucketUnit,
  today: string,
  vehicles: FleetVehicle[]
) {
  const [revenue, occupancy, reservations, customers, customerBuckets] =
    await Promise.all([
      revenueRows(unit, range.from, exclusive(range), today),
      occupancyRows(unit, range, today),
      reservationRows(unit, range, today),
      customerSummary(range),
      customerSeries(unit, range),
    ]);

  const buckets: BucketFigures[] = periodBuckets(range, unit).map((b) => {
    const elapsed = elapsedPart(b, today);
    return {
      ...b,
      revenue: emptySplit(),
      reservations: {},
      lapsed: 0,
      cancelledValue: 0,
      // Vehicle-days in the fleet, counted only for days already lived, so
      // utilisation compares like with like.
      fleetDays: elapsed
        ? vehicles.reduce((sum, v) => sum + overlapDays(v.window, elapsed), 0)
        : 0,
      rentedDays: 0,
      newRecords: 0,
      firstRentals: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  const total = emptySplit();
  /** Rental days that earned money, up to today: the base of the daily rate. */
  let earnedDays = 0;
  for (const row of revenue) {
    addRevenue(total, row);
    const bucket = byKey.get(row.bucket);
    if (bucket) addRevenue(bucket.revenue, row);
    if (row.status !== "CONFIRMED" && !row.ahead) earnedDays += row.days;
  }
  for (const bucket of buckets) bucket.revenue = roundSplit(bucket.revenue);

  for (const row of occupancy) {
    const bucket = byKey.get(row.bucket);
    if (bucket) bucket.rentedDays += row.days;
  }

  const status: Record<string, number> = {};
  let lapsed = 0;
  let cancelledValue = 0;
  let rentedValue = 0;
  let rentedCount = 0;
  let durationDays = 0;
  let durationCount = 0;
  let earlyBooked = 0;
  let earlyCharged = 0;
  for (const row of reservations) {
    status[row.status] = (status[row.status] ?? 0) + row.count;
    const bucket = byKey.get(row.bucket);
    if (bucket) {
      bucket.reservations[row.status] =
        (bucket.reservations[row.status] ?? 0) + row.count;
    }
    if (row.status === "PENDING" && row.past) {
      lapsed += row.count;
      if (bucket) bucket.lapsed += row.count;
    }
    if (row.status === "CANCELLED") {
      cancelledValue += row.value;
      if (bucket)
        bucket.cancelledValue = cents(bucket.cancelledValue + row.value);
    }
    if (row.status === "ACTIVE" || row.status === "COMPLETED") {
      rentedValue += row.value;
      rentedCount += row.count;
    }
    if (row.status !== "PENDING" && row.status !== "CANCELLED") {
      durationDays += row.days;
      durationCount += row.count;
    }
    earlyBooked += row.earlyBooked;
    earlyCharged += row.earlyCharged;
  }

  for (const row of customerBuckets) {
    const bucket = byKey.get(row.bucket);
    if (!bucket) continue;
    if (row.kind === "record") bucket.newRecords += row.count;
    else bucket.firstRentals += row.count;
  }

  const elapsed = elapsedPart(range, today);
  const fleetDays = buckets.reduce((sum, b) => sum + b.fleetDays, 0);
  const rentedDays = buckets.reduce((sum, b) => sum + b.rentedDays, 0);
  const earned = total.realised + total.accruing;
  const fleetSize = averageFleet(fleetDays, elapsed);
  const reservationsTotal = Object.values(status).reduce((a, b) => a + b, 0);

  return {
    revenue: {
      ...roundSplit(total),
      earned: cents(earned),
      /** Booked value of the reservations cancelled, by pickup day. */
      cancelled: cents(cancelledValue),
      /** What early returns billed for the days used took off their bookings. */
      earlyReturnAdjustment: cents(earlyBooked - earlyCharged),
      /** Mean charged amount of a rental (active or completed) picked up in the period. */
      perRental: ratio(rentedValue, rentedCount),
      /** Earned revenue per rental day that earned it. */
      dailyRate: ratio(earned, earnedDays),
      /** Earned revenue per average car in the fleet. */
      perVehicle: ratio(earned, fleetSize),
    },
    reservations: {
      total: reservationsTotal,
      status,
      /** PENDING requests whose pickup day passed without a decision. */
      lapsed,
      /** CANCELLED among reservations picked up in the period. */
      cancellationRate: ratio(status.CANCELLED ?? 0, reservationsTotal),
      /** Mean days out of a confirmed, active or completed reservation. */
      averageDuration: ratio(durationDays, durationCount),
    },
    fleet: {
      fleetDays,
      rentedDays,
      idleDays: fleetDays - rentedDays,
      utilization: ratio(rentedDays, fleetDays),
      averageFleet: fleetSize,
    },
    customers: {
      ...customers,
      /** Renters in the period who had rented before it. */
      repeatRate: ratio(customers.returning, customers.renting),
      rentalsPerCustomer: ratio(customers.rentals, customers.renting),
    },
    buckets,
    /** Raw rows for per-vehicle slices; never sent to the client as-is. */
    revenueRows: revenue,
    occupancyRows: occupancy,
  };
}

export type PeriodFigures = Awaited<ReturnType<typeof periodFigures>>;

export type VehiclePerformance = {
  id: string;
  label: string;
  plate: string | null;
  category: string;
  status: string;
  revenue: number;
  upcoming: number;
  rentals: number;
  /** Mean charged amount of its rentals picked up in the period. */
  averageValue: number | null;
  /** Mean days out of those rentals. */
  averageDuration: number | null;
  rentedDays: number;
  fleetDays: number;
  utilization: number | null;
  /** Share of the fleet's earned revenue. */
  share: number | null;
};

function vehiclePerformance(
  vehicles: FleetVehicle[],
  figures: PeriodFigures,
  rentals: Awaited<ReturnType<typeof vehicleRentals>>,
  range: Range,
  today: string
): VehiclePerformance[] {
  const earned = new Map<string, number>();
  const upcoming = new Map<string, number>();
  for (const row of figures.revenueRows) {
    const target = row.status === "CONFIRMED" || row.ahead ? upcoming : earned;
    target.set(row.vehicleId, (target.get(row.vehicleId) ?? 0) + row.revenue);
  }
  const rented = new Map<string, number>();
  for (const row of figures.occupancyRows) {
    rented.set(row.vehicleId, (rented.get(row.vehicleId) ?? 0) + row.days);
  }
  const elapsed = elapsedPart(range, today);
  const total = figures.revenue.earned;

  return vehicles.flatMap((v): VehiclePerformance[] => {
    const fleetDays = elapsed ? overlapDays(v.window, elapsed) : 0;
    const own = rentals.get(v.id);
    const revenue = cents(earned.get(v.id) ?? 0);
    const rentedDays = rented.get(v.id) ?? 0;
    // Listed only while it was in the fleet or earned something here.
    const relevant =
      fleetDays > 0 ||
      revenue > 0 ||
      (own?.count ?? 0) > 0 ||
      (upcoming.get(v.id) ?? 0) > 0 ||
      (!elapsed && overlapDays(v.window, range) > 0);
    if (!relevant) return [];
    return [
      {
        id: v.id,
        label: v.label,
        plate: v.plate,
        category: v.category,
        status: v.status,
        revenue,
        upcoming: cents(upcoming.get(v.id) ?? 0),
        rentals: own?.count ?? 0,
        averageValue: own ? ratio(own.value, own.count) : null,
        averageDuration: own ? ratio(own.days, own.count) : null,
        rentedDays,
        fleetDays,
        utilization: ratio(rentedDays, fleetDays),
        share: ratio(revenue, total),
      },
    ];
  });
}

export type VehicleSeriesPoint = {
  key: string;
  from: string;
  to: string;
  revenue: number;
  rentedDays: number;
  fleetDays: number;
};

/** One car's revenue and rented days per bucket — no extra query. */
function vehicleSeries(
  vehicle: FleetVehicle,
  figures: PeriodFigures,
  today: string
): VehicleSeriesPoint[] {
  return figures.buckets.map((b) => {
    const elapsed = elapsedPart(b, today);
    const revenue = figures.revenueRows
      .filter(
        (row) =>
          row.vehicleId === vehicle.id &&
          row.bucket === b.key &&
          row.status !== "CONFIRMED" &&
          !row.ahead
      )
      .reduce((sum, row) => sum + row.revenue, 0);
    const rentedDays = figures.occupancyRows
      .filter((row) => row.vehicleId === vehicle.id && row.bucket === b.key)
      .reduce((sum, row) => sum + row.days, 0);
    return {
      key: b.key,
      from: b.from,
      to: b.to,
      revenue: cents(revenue),
      rentedDays,
      fleetDays: elapsed ? overlapDays(vehicle.window, elapsed) : 0,
    };
  });
}

/**
 * Earned revenue and pickups per calendar month across every year on record,
 * for the seasonality view. Independent of the selected period on purpose:
 * seasonality is a comparison between years.
 */
async function seasonality(span: Range | null, today: string) {
  if (!span) return { years: [] as number[], months: [] as SeasonCell[] };
  const range = {
    from: `${span.from.slice(0, 4)}-01-01`,
    to: `${span.to.slice(0, 4)}-12-31`,
  };
  const [revenue, reservations] = await Promise.all([
    revenueRows("month", range.from, exclusive(range), today),
    reservationRows("month", range, today),
  ]);
  const cells = new Map<string, SeasonCell>();
  const cell = (key: string) => {
    const existing = cells.get(key);
    if (existing) return existing;
    const created: SeasonCell = {
      month: key.slice(0, 7),
      revenue: 0,
      pickups: 0,
      cancelled: 0,
    };
    cells.set(key, created);
    return created;
  };
  for (const row of revenue) {
    if (row.status === "CONFIRMED" || row.ahead) continue;
    cell(row.bucket).revenue += row.revenue;
  }
  for (const row of reservations) {
    if (row.status === "PENDING") continue;
    if (row.status === "CANCELLED") cell(row.bucket).cancelled += row.count;
    else cell(row.bucket).pickups += row.count;
  }
  const years: number[] = [];
  for (
    let y = Number(range.from.slice(0, 4));
    y <= Number(range.to.slice(0, 4));
    y++
  ) {
    years.push(y);
  }
  return {
    years,
    months: [...cells.values()]
      .map((c) => ({ ...c, revenue: cents(c.revenue) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export type SeasonCell = {
  month: string;
  revenue: number;
  pickups: number;
  cancelled: number;
};

/** The fleet as it stands today, for the "now" figures beside the period's. */
function fleetToday(vehicles: FleetVehicle[]) {
  const count = (status: string) =>
    vehicles.filter((v) => v.status === status).length;
  return {
    total: vehicles.filter((v) => v.status !== "INACTIVE").length,
    available: count("AVAILABLE"),
    rented: count("RENTED"),
    service: count("SERVICE"),
  };
}

/**
 * Everything the analytics page shows for one period and, optionally, its
 * comparison period. `today` is the branch's calendar day (businessDay).
 */
export async function getAnalyticsReport(input: {
  range: Range;
  unit: BucketUnit;
  today: string;
  comparison: Range | null;
  vehicleId?: string | null;
  span: { first: string; last: string } | null;
}) {
  const { range, unit, today, comparison, span } = input;
  const vehicles = await fleetVehicles();

  const [
    current,
    previous,
    rentals,
    weekdays,
    customers,
    seasons,
    activeNow,
    customerRecords,
  ] = await Promise.all([
    periodFigures(range, unit, today, vehicles),
    comparison ? periodFigures(comparison, unit, today, vehicles) : null,
    vehicleRentals(range),
    pickupWeekdays(range),
    topCustomers(range),
    seasonality(span ? { from: span.first, to: span.last } : null, today),
    prisma.reservation.count({ where: { status: "ACTIVE" } }),
    prisma.customer.count(),
  ]);

  const performance = vehiclePerformance(
    vehicles,
    current,
    rentals,
    range,
    today
  );
  const selected = input.vehicleId
    ? vehicles.find((v) => v.id === input.vehicleId)
    : undefined;

  const categories = new Map<
    string,
    { revenue: number; rentedDays: number; fleetDays: number; vehicles: number }
  >();
  for (const v of performance) {
    const c = categories.get(v.category) ?? {
      revenue: 0,
      rentedDays: 0,
      fleetDays: 0,
      vehicles: 0,
    };
    c.revenue += v.revenue;
    c.rentedDays += v.rentedDays;
    c.fleetDays += v.fleetDays;
    c.vehicles += 1;
    categories.set(v.category, c);
  }

  // The raw rows served the per-vehicle slices; the page needs only totals.
  const strip = (figures: PeriodFigures) => {
    const rest: Partial<PeriodFigures> = { ...figures };
    delete rest.revenueRows;
    delete rest.occupancyRows;
    return rest as Omit<PeriodFigures, "revenueRows" | "occupancyRows">;
  };

  return {
    range,
    unit,
    today,
    current: strip(current),
    previous: previous ? strip(previous) : null,
    comparison,
    fleetNow: { ...fleetToday(vehicles), activeRentals: activeNow },
    /** Every customer record on file today, renter or not. */
    customerRecords,
    vehicles: performance,
    categories: [...categories.entries()]
      .map(([category, c]) => ({
        category,
        ...c,
        revenue: cents(c.revenue),
        utilization: ratio(c.rentedDays, c.fleetDays),
      }))
      .sort((a, b) => b.revenue - a.revenue),
    selectedVehicle: selected
      ? {
          id: selected.id,
          label: selected.label,
          plate: selected.plate,
          series: vehicleSeries(selected, current, today),
        }
      : null,
    weekdays,
    topCustomers: customers,
    seasonality: seasons,
  };
}

export type AnalyticsReport = Awaited<ReturnType<typeof getAnalyticsReport>>;
