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
import { getI18n } from "@/lib/i18n/server";
import type { TranslationKey } from "@/lib/i18n/translations";

export const dynamic = "force-dynamic";

const PERIODS: { key: Period; label: TranslationKey }[] = [
  { key: "week", label: "admin.weekly" },
  { key: "month", label: "admin.monthly" },
  { key: "year", label: "admin.yearly" },
];

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireUser();
  const { t } = await getI18n();
  const { period: raw } = await searchParams;
  const period: Period = PERIODS.some((p) => p.key === raw)
    ? (raw as Period)
    : "month";
  const data = await getAnalytics(period);
  const periodDescription = t(
    period === "week"
      ? "admin.last12Weeks"
      : period === "month"
        ? "admin.last12Months"
        : "admin.last5Years"
  );

  return (
    <PageBody>
      <PageHeader title={t("admin.analytics")} description={periodDescription}>
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
              {t(p.label)}
            </Link>
          ))}
        </div>
      </PageHeader>

      {/* No period hint on Revenue: the page header already states it. */}
      <StatStrip
        stats={[
          {
            label: t("admin.revenue"),
            value: `${Math.round(data.totalRevenue).toLocaleString()} EUR`,
          },
          { label: t("admin.bookings"), value: data.totalReservations },
          {
            label: t("admin.cancelled"),
            value: `${data.cancellationRate}%`,
            tone: data.cancellationRate > 25 ? "danger" : "default",
          },
          { label: t("admin.activeFleet"), value: data.fleet },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t("admin.revenue")} subtitle={periodDescription}>
          <AreaChart data={data.revenueByMonth} suffix=" EUR" />
        </Panel>
        <Panel title={t("admin.bookings")} subtitle={periodDescription}>
          <AreaChart data={data.bookingsByMonth} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={t("admin.mostBooked")}
          subtitle={t("admin.confirmedCompleted")}
        >
          <BarList items={data.topVehicles} />
        </Panel>
        <Panel
          title={t("admin.fleetCategory")}
          subtitle={t("admin.activeVehicles")}
        >
          <BarList
            items={data.categoryDistribution}
            barClassName="bg-status-reserved"
          />
        </Panel>
        <Panel
          title={t("admin.customerGrowth")}
          subtitle={t("admin.newCustomers")}
        >
          <AreaChart data={data.customerGrowth} height={140} />
        </Panel>
      </div>
    </PageBody>
  );
}
