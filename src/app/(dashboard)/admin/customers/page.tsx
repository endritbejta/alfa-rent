import { requireUser } from "@/lib/auth/guards";
import { redirect } from "next/navigation";
import { getCustomers } from "@/services/customer.service";
import { getCustomerInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { BarList } from "@/components/dashboard/bar-list";
import { CustomerList } from "./customer-list";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { parsePageParam } from "@/lib/validations/common";
import { Pagination } from "@/components/dashboard/pagination";
import { getI18n } from "@/lib/i18n/server";
import { formatEur } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireUser();
  const { locale, t } = await getI18n();
  const { page: rawPage } = await searchParams;
  const page = parsePageParam(rawPage);
  const [customers, insights] = await Promise.all([
    getCustomers({ page, perPage: 25 }),
    getCustomerInsights(),
  ]);
  const { items, total, perPage, totalPages } = customers;
  if (total > 0 && page > totalPages) redirect("/admin/customers");

  return (
    <PageBody>
      <PageHeader
        title={t("admin.customers")}
        description={t("admin.customerDescription")}
      />

      {/* "Returning" loses its "more than one booking" hint — the word
          carries it. The top spender keeps theirs: it is their name. */}
      <StatStrip
        stats={[
          { label: t("admin.customers"), value: insights.total },
          {
            label: t("admin.newThisMonth"),
            value: insights.newThisMonth,
            tone: insights.newThisMonth > 0 ? "good" : "default",
          },
          { label: t("admin.returning"), value: insights.returning },
          {
            label: t("admin.topSpender"),
            value: insights.topSpenders[0]
              ? formatEur(insights.topSpenders[0].value, locale, {
                  precision: 0,
                })
              : formatEur(0, locale, { precision: 0 }),
            hint: insights.topSpenders[0]?.label,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t("admin.customerGrowth")}
          subtitle={t("admin.newRegistrations")}
        >
          <AreaChart data={insights.growthSeries} height={140} />
        </Panel>
        <Panel
          title={t("admin.topCustomers")}
          subtitle={t("admin.activeCompleted")}
        >
          <BarList items={insights.topSpenders} suffix=" EUR" />
        </Panel>
      </div>

      <Panel
        title={t("admin.allCustomers")}
        subtitle={t("admin.clickCustomer")}
      >
        <CustomerList items={items} />
      </Panel>
      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        perPage={perPage}
        basePath="/admin/customers"
        labelKey="common.customers"
      />
    </PageBody>
  );
}
