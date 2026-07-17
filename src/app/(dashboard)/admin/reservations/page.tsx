import { ReservationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { getReservations } from "@/services/reservation.service";
import { getReservationInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { PendingQueue } from "./pending-queue";
import { StatusFilter } from "./status-filter";
import {
  ReservationCards,
  ReservationRows,
  type Row,
} from "./reservation-rows";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUSES = Object.values(ReservationStatus);

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireUser();
  const { status } = await searchParams;
  const statusFilter = STATUSES.includes(status as ReservationStatus)
    ? (status as ReservationStatus)
    : undefined;

  const [{ items }, insights] = await Promise.all([
    getReservations({ status: statusFilter, page: 1, perPage: 50 }),
    getReservationInsights(),
  ]);

  // Decimal cannot cross into a client component — convert at the edge.
  const rows: Row[] = items.map((r) => ({
    id: r.id,
    pickupDate: r.pickupDate,
    returnDate: r.returnDate,
    totalPrice: String(r.totalPrice),
    status: r.status,
    vehicle: r.vehicle,
    customer: r.customer,
  }));

  // The red badge means one thing everywhere: requests awaiting a decision.
  // Confirmed and active rentals are in flight, not waiting on staff.
  const pendingCount = insights.statusCounts.PENDING ?? 0;
  const inFlight =
    (insights.statusCounts.CONFIRMED ?? 0) +
    (insights.statusCounts.ACTIVE ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        count={pendingCount || undefined}
        description={`${insights.todaysPickups} pickup${insights.todaysPickups === 1 ? "" : "s"} and ${insights.todaysReturns} return${insights.todaysReturns === 1 ? "" : "s"} today - ${inFlight} rental${inFlight === 1 ? "" : "s"} in flight`}
      />

      {/* Pending is a queue of decisions, so it renders as modules. */}
      {statusFilter === "PENDING" ? (
        <div className="space-y-4">
          <StatusFilter counts={insights.statusCounts} active={statusFilter} />
          <PendingQueue
            requests={items.map((r) => ({
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
        </div>
      ) : (
        <Panel
          title={
            statusFilter
              ? `${statusFilter.toLowerCase()} reservations`
              : "All reservations"
          }
          action={
            <StatusFilter
              counts={insights.statusCounts}
              active={statusFilter}
            />
          }
        >
          <div className="md:hidden">
            <ReservationCards rows={rows} />
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <ReservationRows rows={rows} />
            </Table>
          </div>
        </Panel>
      )}

      <Panel
        title="Booking activity"
        subtitle="Requests received, last 14 days"
      >
        <AreaChart data={insights.activitySeries} height={64} />
      </Panel>
    </div>
  );
}
