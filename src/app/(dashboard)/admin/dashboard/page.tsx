import Link from "next/link";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
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
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import { getI18n } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireUser();
  const { locale, t } = await getI18n();
  const {
    kpis,
    revenueSeries,
    upcomingPickups,
    upcomingReturns,
    recentReservations,
    pendingRequests,
  } = await getDashboardData();

  return (
    <PageBody>
      <PageHeader
        title={t("admin.dashboard")}
        description={format(new Date(), "EEEE, dd MMMM yyyy", {
          locale: locale === "sq" ? sq : enUS,
        })}
      >
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link href="/admin/reservations?status=PENDING" />}
        >
          {t("admin.pendingRequests")}
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
          {t("admin.addVehicle")}
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
            label: t("admin.rentedNow"),
            value: kpis.rentedNow,
            hint: t("admin.ofVehicles", { count: kpis.fleetTotal }),
          },
          {
            label: t("admin.utilization"),
            value: `${kpis.utilization}%`,
            tone: kpis.utilization > 60 ? "good" : "default",
          },
          {
            label: t("admin.needsAttention"),
            value: kpis.overdue,
            tone: kpis.overdue > 0 ? "danger" : "default",
          },
          { label: t("admin.available"), value: kpis.available, tone: "good" },
          {
            // A vehicle in service earns nothing and is invisible on the
            // storefront, and nothing else on the dashboard reports it. Without
            // this, a car parked in SERVICE — including one left there by a
            // return that could not release it — stays forgotten.
            label: t("admin.inService"),
            value: kpis.maintenance,
            tone: kpis.maintenance > 0 ? "warn" : "default",
          },
          {
            label: t("admin.revenueWeek"),
            value: `${kpis.revenueWeek.toLocaleString()} EUR`,
          },
          {
            label: t("admin.revenueMonth"),
            value: `${kpis.revenueMonth.toLocaleString()} EUR`,
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title={t("admin.revenueTrend")}
          subtitle={t("admin.revenueTrendSubtitle")}
          className="lg:col-span-2"
        >
          <AreaChart data={revenueSeries} suffix=" EUR" />
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <Panel
            title={t("admin.upcomingPickups")}
            subtitle={t("admin.nextSevenDays")}
          >
            <ScheduleList items={upcomingPickups} kind="pickup" />
          </Panel>
          <Panel
            title={t("admin.upcomingReturns")}
            subtitle={t("admin.nextSevenDays")}
          >
            <ScheduleList items={upcomingReturns} kind="return" />
          </Panel>
        </div>
      </div>

      <Panel
        title={t("admin.recentReservations")}
        subtitle={t("admin.clickRow")}
        action={
          <Link
            href="/admin/reservations"
            className="text-brand text-xs font-semibold hover:underline"
          >
            {t("admin.viewAll")}
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
    </PageBody>
  );
}
