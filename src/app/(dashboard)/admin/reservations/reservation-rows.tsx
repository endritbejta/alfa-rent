"use client";

import { format } from "date-fns";
import type { ReservationStatus } from "@prisma/client";
import { useDetailDrawer } from "@/app/(dashboard)/admin/reservation-detail";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./status-actions";
import { vehicleLabel } from "@/utils/vehicle";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

/**
 * Plain props: totalPrice is a Decimal on the model and cannot cross into a
 * client component, so the page hands it over already stringified.
 */
export type Row = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  totalPrice: string;
  status: ReservationStatus;
  vehicle: { brand: string; model: string; plate: string | null };
  customer: { firstName: string; lastName: string; email: string };
};

/**
 * The whole row opens the detail drawer.
 *
 * The row is the target because the record is what staff want — hunting for
 * a link inside it is the click this removes. The action buttons stop the
 * event: a row that opened a drawer *and* started a rental would be a trap.
 */
export function ReservationRows({ rows }: { rows: Row[] }) {
  const { openReservation } = useDetailDrawer();

  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={6} className="text-muted-foreground text-center">
            No reservations
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((r) => (
        <TableRow
          key={r.id}
          role="button"
          tabIndex={0}
          aria-label={`Open reservation for ${r.customer.firstName} ${r.customer.lastName}`}
          onClick={() => openReservation(r.id)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            openReservation(r.id);
          }}
          className="hover:bg-secondary/70 focus-visible:ring-ring/40 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <TableCell>
            <p className="font-medium">
              {r.customer.firstName} {r.customer.lastName}
            </p>
            <p className="text-muted-foreground text-sm">{r.customer.email}</p>
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
          <TableCell
            className="text-right"
            // Buttons live inside the row's hit area; without this, confirming
            // a rental would also fling the drawer open behind the click.
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <StatusActions reservationId={r.id} status={r.status} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

/** Mobile equivalent — same rule: the card is the target, buttons are not. */
export function ReservationCards({ rows }: { rows: Row[] }) {
  const { openReservation } = useDetailDrawer();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        No reservations
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id}>
          <div
            role="button"
            tabIndex={0}
            aria-label={`Open reservation for ${r.customer.firstName} ${r.customer.lastName}`}
            onClick={() => openReservation(r.id)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              openReservation(r.id);
            }}
            className="hover:bg-secondary/70 focus-visible:ring-ring/40 cursor-pointer rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
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
            <div
              className="mt-3"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <StatusActions reservationId={r.id} status={r.status} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
