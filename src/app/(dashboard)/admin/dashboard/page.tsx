import Link from "next/link";
import { format } from "date-fns";
import { requireUser } from "@/lib/auth/guards";
import { getDashboardData } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard, StatGrid } from "@/components/dashboard/stat-card";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { ScheduleList } from "@/components/dashboard/schedule-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/utils/vehicle";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const {
    kpis,
    revenueSeries,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
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

      <StatGrid>
        <StatCard
          label="Rented now"
          value={kpis.rentedNow}
          hint={`of ${kpis.fleetTotal} vehicles`}
        />
        <StatCard
          label="Fleet utilization"
          value={`${kpis.utilization}%`}
          tone={kpis.utilization > 60 ? "good" : "default"}
        />
        <StatCard label="Available" value={kpis.available} tone="good" />
        <StatCard
          label="Revenue this week"
          value={`${kpis.revenueWeek.toLocaleString()} EUR`}
        />
        <StatCard
          label="Revenue this month"
          value={`${kpis.revenueMonth.toLocaleString()} EUR`}
        />
      </StatGrid>

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
        action={
          <Link
            href="/admin/reservations"
            className="text-brand text-xs font-semibold hover:underline"
          >
            View all
          </Link>
        }
      >
        {/* Mobile: card list */}
        <ul className="divide-y md:hidden">
          {recentReservations.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.customer.firstName} {r.customer.lastName}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {r.vehicle.brand} {r.vehicle.model} -{" "}
                  {format(r.pickupDate, "dd MMM")}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
        {/* Desktop: table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentReservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.customer.firstName} {r.customer.lastName}
                  </TableCell>
                  <TableCell>{vehicleLabel(r.vehicle)}</TableCell>
                  <TableCell>
                    {format(r.pickupDate, "dd MMM")} -{" "}
                    {format(r.returnDate, "dd MMM")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.totalPrice).toFixed(2)} EUR
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </div>
  );
}
