import { requireUser } from "@/lib/auth/guards";
import { getCustomers } from "@/services/customer.service";
import { getCustomerInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard, StatGrid } from "@/components/dashboard/stat-card";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { BarList } from "@/components/dashboard/bar-list";
import { CustomerList } from "./customer-list";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  await requireUser();
  const [{ items }, insights] = await Promise.all([
    getCustomers({ page: 1, perPage: 50 }),
    getCustomerInsights(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Everyone who has booked with Alfa"
      />

      <StatGrid className="lg:grid-cols-4">
        <StatCard label="Total customers" value={insights.total} />
        <StatCard
          label="New this month"
          value={insights.newThisMonth}
          tone={insights.newThisMonth > 0 ? "good" : "default"}
        />
        <StatCard
          label="Returning"
          value={insights.returning}
          hint="more than one booking"
        />
        <StatCard
          label="Top spender"
          value={
            insights.topSpenders[0]
              ? `${insights.topSpenders[0].value.toLocaleString()} EUR`
              : "0 EUR"
          }
          hint={insights.topSpenders[0]?.label}
        />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Customer growth" subtitle="New registrations by month">
          <AreaChart data={insights.growthSeries} height={140} />
        </Panel>
        <Panel
          title="Top spending customers"
          subtitle="Active and completed rentals"
        >
          <BarList items={insights.topSpenders} suffix=" EUR" />
        </Panel>
      </div>

      <Panel title="All customers" subtitle="Click a customer for full profile">
        <CustomerList items={items} />
      </Panel>
    </div>
  );
}
