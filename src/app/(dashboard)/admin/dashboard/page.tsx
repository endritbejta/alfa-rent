import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { ScheduleList } from "@/components/dashboard/schedule-list";

import { Button } from "@/components/ui/button";
import { RecentReservations } from "./recent-reservations";
import { PendingQueue } from "../reservations/pending-queue";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const {
    kpis,
    revenueSeries,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
    pendingRequests,
  } = await getDashboardData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={format(new Date(), "EEEE, dd MMMM yyyy")}
      >
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/reservations?status=PENDING" />}
        >
          Pending requests
          {kpis.pending > 0 && (
            <span className="bg-brand ml-1 rounded-full px-1.5 text-xs font-bold text-white">
              {kpis.pending}
            </span>
          )}
        </Button>
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/admin/vehicles/new" />}
        >
          Add vehicle
        </Button>
      </PageHeader>

      {/* Today's decisions come before today's numbers. */}
      <PendingQueue
        compact
        requests={pendingRequests.map((r) => ({
          id: r.id,
          pickupDate: r.pickupDate,
          returnDate: r.returnDate,
          totalPrice: String(r.totalPrice),
          createdAt: r.createdAt,
          notes: r.notes,
          vehicle: r.vehicle,
          customer: r.customer,
        }))}
      />

      {/* "of N vehicles" stays: it is what makes the rented count mean
          anything. 3 is a different day at a fleet of 43 than at 5. */}
      <StatStrip
        stats={[
          {
            label: "Rented now",
            value: kpis.rentedNow,
            hint: `of ${kpis.fleetTotal} vehicles`,
          },
          {
            label: "Utilization",
            value: `${kpis.utilization}%`,
            tone: kpis.utilization > 60 ? "good" : "default",
          },
          { label: "Available", value: kpis.available, tone: "good" },
          {
            label: "Revenue this week",
            value: `${kpis.revenueWeek.toLocaleString()} EUR`,
          },
          {
            label: "Revenue this month",
            value: `${kpis.revenueMonth.toLocaleString()} EUR`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Revenue trend"
          subtitle="Booked revenue, last 6 months"
          className="lg:col-span-2"
        >
          <AreaChart data={revenueSeries} suffix=" EUR" />
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Panel title="Upcoming pickups" subtitle="Next 7 days">
            <ScheduleList items={upcomingPickups} kind="pickup" />
          </Panel>
          <Panel title="Upcoming returns" subtitle="Next 7 days">
            <ScheduleList items={upcomingReturns} kind="return" />
          </Panel>
        </div>
      </div>

      <Panel
        title="Recent reservations"
        subtitle="Click a row for full detail"
        action={
          <Link
            href="/admin/reservations"
            className="text-brand text-xs font-semibold hover:underline"
          >
            View all
          </Link>
        }
      >
        <RecentReservations
          items={recentReservations.map((r) => ({
            id: r.id,
            pickupDate: r.pickupDate,
            returnDate: r.returnDate,
            totalPrice: String(r.totalPrice),
            status: r.status,
            vehicle: r.vehicle,
            customer: r.customer,
          }))}
        />
      </Panel>
    </div>
  );
}
