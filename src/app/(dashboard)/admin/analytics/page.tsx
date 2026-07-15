import { requireUser } from "@/lib/auth/guards";
import { getAnalytics } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard, StatGrid } from "@/components/dashboard/stat-card";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { BarList } from "@/components/dashboard/bar-list";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireUser();
  const data = await getAnalytics();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Business performance over the last 12 months"
      />

      <StatGrid className="lg:grid-cols-4">
        <StatCard
          label="Total revenue"
          value={`${Math.round(data.totalRevenue).toLocaleString()} EUR`}
          hint="last 12 months"
        />
        <StatCard label="Total bookings" value={data.totalReservations} />
        <StatCard
          label="Cancellation rate"
          value={`${data.cancellationRate}%`}
          tone={data.cancellationRate > 25 ? "danger" : "default"}
        />
        <StatCard label="Active fleet" value={data.fleet} hint="vehicles" />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue" subtitle="Booked revenue by month">
          <AreaChart data={data.revenueByMonth} suffix=" EUR" />
        </Panel>
        <Panel title="Bookings" subtitle="Reservations created by month">
          <AreaChart data={data.bookingsByMonth} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Most booked vehicles"
          subtitle="Confirmed and completed rentals"
        >
          <BarList items={data.topVehicles} />
        </Panel>
        <Panel title="Fleet by category" subtitle="Active vehicles">
          <BarList
            items={data.categoryDistribution}
            barClassName="bg-status-reserved"
          />
        </Panel>
        <Panel title="Customer growth" subtitle="New customers by month">
          <AreaChart data={data.customerGrowth} height={140} />
        </Panel>
      </div>
    </div>
  );
}
