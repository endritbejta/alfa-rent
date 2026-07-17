import { requireUser } from "@/lib/auth/guards";
import { getCustomers } from "@/services/customer.service";
import { getCustomerInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatStrip } from "@/components/dashboard/stat-strip";
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

      {/* "Returning" loses its "more than one booking" hint — the word
          carries it. The top spender keeps theirs: it is their name. */}
      <StatStrip
        stats={[
          { label: "Customers", value: insights.total },
          {
            label: "New this month",
            value: insights.newThisMonth,
            tone: insights.newThisMonth > 0 ? "good" : "default",
          },
          { label: "Returning", value: insights.returning },
          {
            label: "Top spender",
            value: insights.topSpenders[0]
              ? `${insights.topSpenders[0].value.toLocaleString()} EUR`
              : "0 EUR",
            hint: insights.topSpenders[0]?.label,
          },
        ]}
      />

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
