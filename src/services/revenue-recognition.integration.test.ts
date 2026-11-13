import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { getAnalytics, getDashboardData } from "@/services/analytics.service";

/**
 * Revenue is recognised per rental day: a reservation's price is spread
 * evenly over the days it covers, and each share counts in the period its day
 * falls in. It used to count in full on the day the booking was *created*.
 *
 * Every row here sits in 2030–2032, where nothing else lives, and the
 * services are read with a `now` inside that window, so the figures are
 * exactly these rows.
 */
const suffix = randomUUID().slice(0, 8);
const ids = {
  customer: `rev-customer-${suffix}`,
  vehicle: `rev-vehicle-${suffix}`,
};

const at = (y: number, m: number, d: number, h = 10) =>
  new Date(Date.UTC(y, m - 1, d, h));

beforeAll(async () => {
  await prisma.customer.create({
    data: {
      id: ids.customer,
      firstName: "Revenue",
      lastName: "Recognition",
      email: `rev-${suffix}@example.test`,
      phone: "-",
    },
  });
  await prisma.vehicle.create({
    data: {
      id: ids.vehicle,
      slug: `rev-car-${suffix}`,
      brand: "Test",
      model: "Revenue",
      year: 2027,
      category: "SEDAN",
      transmission: "AUTOMATIC",
      fuelType: "PETROL",
      seats: 5,
      pricePerDay: 100,
      description: "Integration-test vehicle for revenue recognition.",
    },
  });

  const rows = [
    // 4 days across a month boundary: 30, 31 Jan and 1, 2 Feb. Booked months
    // earlier — the old definition put all 400 in June 2030.
    {
      pickupDate: at(2031, 1, 30),
      returnDate: at(2031, 2, 2),
      status: "CONFIRMED" as const,
      totalPrice: 400,
      createdAt: new Date("2030-06-01T09:00:00.000Z"),
    },
    // Pickup and return day both count, whatever the time: 20 and 21 Feb.
    {
      pickupDate: at(2031, 2, 20),
      returnDate: at(2031, 2, 21, 15),
      status: "ACTIVE" as const,
      totalPrice: 60,
    },
    // 3 days that do not divide evenly: 31 Mar, then 1 and 2 Apr.
    {
      pickupDate: at(2031, 3, 31),
      returnDate: at(2031, 4, 2),
      status: "COMPLETED" as const,
      totalPrice: 100,
    },
    // 2 days across a year boundary.
    {
      pickupDate: at(2031, 12, 31),
      returnDate: at(2032, 1, 1),
      status: "COMPLETED" as const,
      totalPrice: 50,
    },
    // Never revenue: undecided or abandoned.
    {
      pickupDate: at(2031, 2, 10),
      returnDate: at(2031, 2, 12),
      status: "PENDING" as const,
      totalPrice: 999,
    },
    {
      pickupDate: at(2031, 2, 12),
      returnDate: at(2031, 2, 14),
      status: "CANCELLED" as const,
      totalPrice: 999,
    },
  ];
  for (const row of rows) {
    await prisma.reservation.create({
      data: { vehicleId: ids.vehicle, customerId: ids.customer, ...row },
    });
  }
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { vehicleId: ids.vehicle } });
  await prisma.vehicle.deleteMany({ where: { id: ids.vehicle } });
  await prisma.customer.deleteMany({ where: { id: ids.customer } });
  await prisma.$disconnect();
});

const valueOf = (series: { label: string; value: number }[], label: string) =>
  series.find((point) => point.label === label)?.value;

describe("revenue per rental day", () => {
  it("splits a rental across the month boundary it spans", async () => {
    const data = await getAnalytics("month", at(2031, 2, 20));

    expect(valueOf(data.revenueByMonth, "Jan")).toBe(200);
    // 200 from the January rental's last two days, 60 from February's own.
    expect(valueOf(data.revenueByMonth, "Feb")).toBe(260);
    // Booked in June, earned in January/February: June earned nothing.
    expect(valueOf(data.revenueByMonth, "Jun")).toBe(0);
    // The booking itself still counts where it was made.
    expect(valueOf(data.bookingsByMonth, "Jun")).toBe(1);
    expect(data.totalReservations).toBe(1);
    // PENDING and CANCELLED never count; CONFIRMED and ACTIVE do.
    expect(data.totalRevenue).toBe(460);
  });

  it("splits uneven shares without losing a cent", async () => {
    const data = await getAnalytics("month", at(2031, 4, 10));

    expect(valueOf(data.revenueByMonth, "Mar")).toBe(33);
    expect(valueOf(data.revenueByMonth, "Apr")).toBe(67);
    // 400 + 60 + 33.33 + 66.67: the total is the whole prices.
    expect(data.totalRevenue).toBeCloseTo(560, 2);
  });

  it("buckets weeks from Monday, across a month boundary", async () => {
    // Monday 3 Feb 2031. The week of Monday 27 Jan holds all four days of the
    // January rental, two in each month.
    const data = await getAnalytics("week", at(2031, 2, 3));

    expect(data.revenueByMonth).toHaveLength(12);
    expect(valueOf(data.revenueByMonth, "27 Jan")).toBe(400);
    expect(data.revenueByMonth.at(-1)).toEqual({ label: "03 Feb", value: 0 });
  });

  it("splits a rental across the year boundary it spans", async () => {
    const data = await getAnalytics("year", at(2032, 3, 1));

    expect(valueOf(data.revenueByMonth, "2031")).toBe(585);
    expect(valueOf(data.revenueByMonth, "2032")).toBe(25);
  });

  it("drives the dashboard's week and month figures the same way", async () => {
    // Thursday 20 Feb 2031: the week of 17 Feb holds the two ACTIVE days.
    const { kpis, revenueSeries } = await getDashboardData(at(2031, 2, 20));

    expect(kpis.revenueWeek).toBe(60);
    expect(kpis.revenueMonth).toBe(260);
    expect(revenueSeries).toHaveLength(6);
    expect(revenueSeries.at(-1)).toEqual({ label: "Feb", value: 260 });
    expect(valueOf(revenueSeries, "Jan")).toBe(200);
  });
});
