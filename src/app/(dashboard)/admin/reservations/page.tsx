import { ReservationStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { getReservations } from "@/services/reservation.service";
import { getReservationInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { reservationContactDifference } from "@/lib/booking-contact";
import { PendingQueue } from "./pending-queue";
import { StatusFilter } from "./status-filter";
import {
  ReservationCards,
  ReservationRows,
  type Row,
} from "./reservation-rows";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageBody } from "@/app/(dashboard)/admin/page-body";
import {
  getReservationTiming,
  isExpiredRequest,
} from "@/lib/reservation-lifecycle";
import { parsePageParam } from "@/lib/validations/common";
import { Pagination } from "@/components/dashboard/pagination";
import { getI18n } from "@/lib/i18n/server";
import { RESERVATION_STATUS_KEYS as STATUS_KEYS } from "@/lib/status-labels";
import { lateReturnSummary } from "@/lib/late-return";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(ReservationStatus);

/** The list's vehicle without its Decimal rate, which cannot reach a client. */
function listVehicle(vehicle: {
  brand: string;
  model: string;
  plate: string | null;
  slug: string;
}) {
  const { brand, model, plate, slug } = vehicle;
  return { brand, model, plate, slug };
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  await requireUser();
  const { t } = await getI18n();
  const { status, page: rawPage } = await searchParams;
  const statusFilter = STATUSES.includes(status as ReservationStatus)
    ? (status as ReservationStatus)
    : undefined;
  const page = parsePageParam(rawPage);

  const [reservations, insights] = await Promise.all([
    getReservations({ status: statusFilter, page, perPage: 25 }),
    getReservationInsights(),
  ]);
  const { items, total, perPage, totalPages } = reservations;
  if (total > 0 && page > totalPages) {
    redirect(
      statusFilter
        ? `/admin/reservations?status=${statusFilter}`
        : "/admin/reservations"
    );
  }
  const now = new Date();

  // Decimal cannot cross into a client component — convert at the edge.
  const rows: Row[] = items.map((r) => ({
    id: r.id,
    pickupDate: r.pickupDate,
    returnDate: r.returnDate,
    totalPrice: String(r.totalPrice),
    status: r.status,
    timing: getReservationTiming(r, now),
    pricePerDay: Number(r.vehicle.pricePerDay),
    late: lateReturnSummary(r),
    vehicle: listVehicle(r.vehicle),
    customer: r.customer,
  }));

  // The red badge means one thing everywhere: requests awaiting a decision.
  // Confirmed and active rentals are in flight, not waiting on staff.
  const pendingCount = insights.pendingActionable;
  const inFlight =
    (insights.statusCounts.CONFIRMED ?? 0) +
    (insights.statusCounts.ACTIVE ?? 0);

  return (
    <PageBody>
      <PageHeader
        title={t("admin.reservations")}
        count={pendingCount || undefined}
        description={t("admin.reservationSummary", {
          pickups: insights.todaysPickups,
          returns: insights.todaysReturns,
          overdue: insights.overdue,
          active: inFlight,
        })}
      />

      <StatusFilter
        counts={insights.statusCounts}
        pendingActionable={insights.pendingActionable}
        urgent={{
          PENDING: insights.pendingActionable,
          CONFIRMED: insights.overduePickups,
          ACTIVE: insights.overdueReturns,
        }}
        active={statusFilter}
      />

      {/* Pending is a queue of decisions, so it renders as modules. */}
      {statusFilter === "PENDING" ? (
        <PendingQueue
          requests={items.map((r) => ({
            id: r.id,
            pickupDate: r.pickupDate,
            returnDate: r.returnDate,
            totalPrice: String(r.totalPrice),
            createdAt: r.createdAt,
            notes: r.notes,
            vehicle: listVehicle(r.vehicle),
            customerId: r.customerId,
            customer: {
              firstName: r.customer.firstName,
              lastName: r.customer.lastName,
              email: r.customer.email,
            },
            customerNotes: r.customer.notes,
            contactDifference: reservationContactDifference(r),
            expired: isExpiredRequest(r, now),
          }))}
        />
      ) : (
        <Panel
          title={
            statusFilter
              ? `${t(STATUS_KEYS[statusFilter])} ${t("admin.reservations").toLowerCase()}`
              : t("admin.allReservations")
          }
        >
          <div className="md:hidden">
            <ReservationCards rows={rows} />
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin.customer")}</TableHead>
                  <TableHead>{t("admin.vehicle")}</TableHead>
                  <TableHead>{t("admin.dates")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.total")}
                  </TableHead>
                  <TableHead>{t("admin.status")}</TableHead>
                  <TableHead className="text-right">
                    {t("admin.actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <ReservationRows rows={rows} />
            </Table>
          </div>
        </Panel>
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        perPage={perPage}
        basePath="/admin/reservations"
        labelKey="common.reservations"
      />

      <Panel
        title={t("admin.bookingActivity")}
        subtitle={t("admin.bookingActivitySubtitle")}
      >
        <AreaChart data={insights.activitySeries} height={64} />
      </Panel>
    </PageBody>
  );
}
