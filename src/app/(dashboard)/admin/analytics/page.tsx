import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { getAnalytics, type Period } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { BarList } from "@/components/dashboard/bar-list";
import { cn } from "@/lib/utils";
import { PageBody } from "@/app/(dashboard)/admin/page-body";

export const dynamic = "force-dynamic";

const PERIODS: { key: Period; label: string }[] = [
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "year", label: "Yearly" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireUser();
  const { period: raw } = await searchParams;
  const period: Period = PERIODS.some((p) => p.key === raw)
    ? (raw as Period)
    : "month";
  const data = await getAnalytics(period);

  return (
    <PageBody>
      <PageHeader title="Analytics" description={data.periodLabel}>
        {/* Period switch: a soft navigation, so charts re-render on the
            server without a full page load. */}
        <div className="bg-secondary inline-flex rounded-full border p-0.5">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/admin/analytics?period=${p.key}`}
              scroll={false}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
                period === p.key
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </PageHeader>

      {/* No period hint on Revenue: the page header already states it. */}
      <StatStrip
        stats={[
          {
            label: "Revenue",
            value: `${Math.round(data.totalRevenue).toLocaleString()} EUR`,
          },
          { label: "Bookings", value: data.totalReservations },
          {
            label: "Cancelled",
            value: `${data.cancellationRate}%`,
            tone: data.cancellationRate > 25 ? "danger" : "default",
          },
          { label: "Active fleet", value: data.fleet },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Revenue" subtitle={data.periodLabel}>
          <AreaChart data={data.revenueByMonth} suffix=" EUR" />
        </Panel>
        <Panel title="Bookings" subtitle={data.periodLabel}>
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
    </PageBody>
  );
}
