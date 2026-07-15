import Link from "next/link";
import { format } from "date-fns";
import { ReservationStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth/guards";
import { getReservations } from "@/services/reservation.service";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./status-actions";
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

  const { items } = await getReservations({
    status: statusFilter,
    page: 1,
    perPage: 50,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reservations</h1>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/reservations"
          className={`rounded-full px-3 py-1 ${!statusFilter ? "bg-neutral-900 text-white" : "bg-neutral-200"}`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/reservations?status=${s}`}
            className={`rounded-full px-3 py-1 ${statusFilter === s ? "bg-neutral-900 text-white" : "bg-neutral-200"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Customer</TableHead>
            <TableHead>Vehicle</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Total</TableHead>
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
              <TableCell>
                {r.vehicle.brand} {r.vehicle.model}
              </TableCell>
              <TableCell>
                {format(r.pickupDate, "dd MMM")} -{" "}
                {format(r.returnDate, "dd MMM yyyy")}
              </TableCell>
              <TableCell>{Number(r.totalPrice).toFixed(2)} EUR</TableCell>
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
  );
}
