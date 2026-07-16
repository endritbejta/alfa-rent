import Link from "next/link";
import { format } from "date-fns";
import { ReservationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { getReservations } from "@/services/reservation.service";
import { getReservationInsights } from "@/services/analytics.service";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel } from "@/components/dashboard/panel";
import { AreaChart } from "@/components/dashboard/area-chart";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./status-actions";
import { PendingQueue } from "./pending-queue";
import { cn } from "@/lib/utils";
import { vehicleLabel } from "@/utils/vehicle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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

  // "Open work" = anything still on staff's plate, not lifetime history.
  const openCount =
    (insights.statusCounts.PENDING ?? 0) +
    (insights.statusCounts.CONFIRMED ?? 0) +
    (insights.statusCounts.ACTIVE ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations"
        count={openCount}
        description={`${insights.todaysPickups} pickup${insights.todaysPickups === 1 ? "" : "s"} and ${insights.todaysReturns} return${insights.todaysReturns === 1 ? "" : "s"} today - ${openCount} need attention`}
      />

      {/* Status summary — each card is also the filter */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Link
          href="/admin/reservations"
          className={cn(
            "bg-card rounded-xl border p-4 transition-colors",
            !statusFilter && "ring-brand ring-2"
          )}
        >
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
            All
          </p>
          <p className="font-display mt-1 text-2xl font-bold tabular-nums">
            {Object.values(insights.statusCounts).reduce((a, b) => a + b, 0)}
          </p>
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/reservations?status=${s}`}
            className={cn(
              "bg-card rounded-xl border p-4 transition-colors",
              statusFilter === s && "ring-brand ring-2"
            )}
          >
            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.08em] uppercase">
              {s.toLowerCase()}
            </p>
            <p className="font-display mt-1 text-2xl font-bold tabular-nums">
              {insights.statusCounts[s] ?? 0}
            </p>
          </Link>
        ))}
      </div>

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
            vehicle: r.vehicle,
            customer: r.customer,
          }))}
        />
      ) : (
        <Panel
          title={
            statusFilter
              ? `${statusFilter.toLowerCase()} reservations`
              : "All reservations"
          }
        >
          {/* Mobile: cards */}
          <ul className="space-y-3 md:hidden">
            {items.length === 0 && (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No reservations
              </p>
            )}
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {r.customer.firstName} {r.customer.lastName}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {vehicleLabel(r.vehicle)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
                  <span>
                    {format(r.pickupDate, "dd MMM")} -{" "}
                    {format(r.returnDate, "dd MMM yyyy")}
                  </span>
                  <span className="text-foreground font-semibold tabular-nums">
                    {Number(r.totalPrice).toFixed(2)} EUR
                  </span>
                </div>
                <div className="mt-3">
                  <StatusActions reservationId={r.id} status={r.status} />
                </div>
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground text-center"
                    >
                      No reservations
                    </TableCell>
                  </TableRow>
                )}
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <p className="font-medium">
                        {r.customer.firstName} {r.customer.lastName}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {r.customer.email}
                      </p>
                    </TableCell>
                    <TableCell>{vehicleLabel(r.vehicle)}</TableCell>
                    <TableCell>
                      {format(r.pickupDate, "dd MMM")} -{" "}
                      {format(r.returnDate, "dd MMM yyyy")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(r.totalPrice).toFixed(2)} EUR
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <StatusActions reservationId={r.id} status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
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
