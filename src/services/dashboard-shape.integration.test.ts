import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma";
import {
  getDashboardData,
  getUpcomingSchedule,
} from "@/services/analytics.service";

/**
 * getDashboardData reads eleven queries out of one batched transaction by
 * position. Most mis-alignments would fail to typecheck — a count is a number
 * and a findMany is an array — but two lists of reservations are
 * interchangeable to the compiler, and inserting a query in the middle of the
 * array silently shifts everything after it.
 *
 * So these assert what the figures mean rather than what they are, which is
 * the part a positional shift breaks.
 */
describe("the dashboard's figures", () => {
  it("agrees with itself", async () => {
    const { kpis, pendingRequests, recentReservations, revenueSeries } =
      await getDashboardData();

    // pendingRequests takes 10; below that it must equal the count.
    if (pendingRequests.length < 10) {
      expect(kpis.pending).toBe(pendingRequests.length);
    }
    expect(pendingRequests.every((r) => r.status === "PENDING")).toBe(true);

    // recentReservations is the newest 6 of everything, not a filtered list.
    expect(recentReservations.length).toBeLessThanOrEqual(6);
    const created = recentReservations.map((r) => r.createdAt.getTime());
    expect([...created].sort((a, b) => b - a)).toEqual(created);

    expect(kpis.available).toBeLessThanOrEqual(kpis.fleetTotal);
    expect(kpis.utilization).toBeGreaterThanOrEqual(0);
    expect(kpis.utilization).toBeLessThanOrEqual(100);
    expect(revenueSeries).toHaveLength(6);

    const [fleetTotal, available, service] = await Promise.all([
      prisma.vehicle.count({ where: { status: { not: "INACTIVE" } } }),
      prisma.vehicle.count({ where: { status: "AVAILABLE" } }),
      prisma.vehicle.count({ where: { status: "SERVICE" } }),
    ]);
    expect(kpis.fleetTotal).toBe(fleetTotal);
    expect(kpis.available).toBe(available);
    expect(kpis.maintenance).toBe(service);
  });

  /**
   * The calendar reads the handovers from getUpcomingSchedule now, rather
   * than paying for the whole dashboard to get two lists. Both must agree.
   */
  it("reports the same handovers as the narrow reader the calendar uses", async () => {
    const [wide, narrow] = await Promise.all([
      getDashboardData(),
      getUpcomingSchedule(),
    ]);
    expect(narrow.upcomingPickups).toEqual(wide.upcomingPickups);
    expect(narrow.upcomingReturns).toEqual(wide.upcomingReturns);
    expect(
      narrow.upcomingPickups.every((r) => r.pickupDate <= r.returnDate)
    ).toBe(true);
  });
});
