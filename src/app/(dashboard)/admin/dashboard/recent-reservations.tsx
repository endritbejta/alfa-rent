"use client";

import { format } from "date-fns";
import { useReservationDetail } from "@/app/(dashboard)/admin/reservation-detail";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/utils/vehicle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Item = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  totalPrice: string;
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  vehicle: { brand: string; model: string; plate: string | null };
  customer: { firstName: string; lastName: string };
};

/** Recent reservations, each row opening the shared detail drawer. */
export function RecentReservations({ items }: { items: Item[] }) {
  const { openReservation } = useReservationDetail();

  return (
    <>
      <ul className="divide-y md:hidden">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => openReservation(r.id)}
              className="hover:bg-secondary flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.customer.firstName} {r.customer.lastName}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {vehicleLabel(r.vehicle)} - {format(r.pickupDate, "dd MMM")}
                </p>
              </div>
              <StatusBadge status={r.status} />
            </button>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => (
              <TableRow
                key={r.id}
                onClick={() => openReservation(r.id)}
                className="hover:bg-secondary cursor-pointer transition-colors"
              >
                <TableCell>
                  {r.customer.firstName} {r.customer.lastName}
                </TableCell>
                <TableCell>{vehicleLabel(r.vehicle)}</TableCell>
                <TableCell>
                  {format(r.pickupDate, "dd MMM")} -{" "}
                  {format(r.returnDate, "dd MMM")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(r.totalPrice).toFixed(2)} EUR
                </TableCell>
                <TableCell>
                  <StatusBadge status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
