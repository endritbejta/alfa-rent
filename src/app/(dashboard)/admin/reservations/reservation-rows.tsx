"use client";

import { format } from "date-fns";
import type { ReservationStatus } from "@prisma/client";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./status-actions";
import { vehicleLabel } from "@/lib/vehicle-label";
import { formatEur } from "@/lib/money";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { ReservationAttention } from "@/components/shared/reservation-attention";
import { InspectionAction } from "./inspection-action";
import { useI18n } from "@/components/shared/locale-provider";

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
  timing: ReservationTiming;
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
  const { locale, t } = useI18n();

  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={6} className="text-muted-foreground text-center">
            {t("admin.noReservations")}
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((r) => (
        /*
         * The whole row is the pointer target, but it is a row, not a button.
         * role="button" on a <tr> costs the table its semantics — no row, no
         * association with the column headers — and it is invalid besides,
         * because a button may not contain the Confirm and Cancel buttons
         * this row holds. The keyboard path is a real button on the name.
         */
        <TableRow
          key={r.id}
          onClick={() => openReservation(r.id)}
          className="hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <TableCell>
            <button
              type="button"
              aria-label={t("admin.openReservation", {
                name: `${r.customer.firstName} ${r.customer.lastName}`,
              })}
              // The row handles the same click; without this the drawer would
              // be opened twice, and each open is a history entry.
              onClick={(e) => {
                e.stopPropagation();
                openReservation(r.id);
              }}
              className="focus-visible:ring-ring/40 cursor-pointer rounded text-left font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {r.customer.firstName} {r.customer.lastName}
            </button>
            <p className="text-muted-foreground text-sm">{r.customer.email}</p>
          </TableCell>
          <TableCell>{vehicleLabel(r.vehicle)}</TableCell>
          <TableCell>
            {format(r.pickupDate, "dd MMM")} -{" "}
            {format(r.returnDate, "dd MMM yyyy")}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEur(r.totalPrice, locale)}
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={r.status} />
              <ReservationAttention attention={r.timing.attention} />
            </div>
          </TableCell>
          <TableCell
            className="text-right"
            // Buttons live inside the row's hit area; without this, confirming
            // a rental would also fling the drawer open behind the click.
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap justify-end gap-2">
              <InspectionAction
                reservationId={r.id}
                status={r.status}
                timing={r.timing}
                signerName={`${r.customer.firstName} ${r.customer.lastName}`}
              />
              <StatusActions reservationId={r.id} status={r.status} />
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

/** Mobile equivalent — same rule: the card is the target, buttons are not. */
export function ReservationCards({ rows }: { rows: Row[] }) {
  const { openReservation } = useDetailDrawer();
  const { locale, t } = useI18n();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {t("admin.noReservations")}
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id}>
          {/*
            The card is the pointer target, not a control: the keyboard path
            is the real button on the name inside it. Making the card itself
            a button would put the Confirm and Cancel buttons inside one.
          */}
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
          <div
            onClick={() => openReservation(r.id)}
            className="hover:bg-surface-hover cursor-pointer rounded-lg border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <button
                  type="button"
                  aria-label={t("admin.openReservation", {
                    name: `${r.customer.firstName} ${r.customer.lastName}`,
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    openReservation(r.id);
                  }}
                  className="focus-visible:ring-ring/40 max-w-full cursor-pointer truncate rounded text-left text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {r.customer.firstName} {r.customer.lastName}
                </button>
                <p className="text-muted-foreground truncate text-xs">
                  {vehicleLabel(r.vehicle)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StatusBadge status={r.status} />
                <ReservationAttention attention={r.timing.attention} />
              </div>
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-xs">
              <span>
                {format(r.pickupDate, "dd MMM")} -{" "}
                {format(r.returnDate, "dd MMM yyyy")}
              </span>
              <span className="text-foreground font-semibold tabular-nums">
                {formatEur(r.totalPrice, locale)}
              </span>
            </div>
            {/*
              This one only stops the card's click from reaching the drawer;
              it adds no interaction of its own.
            */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              className="mt-3"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap justify-end gap-2">
                <InspectionAction
                  reservationId={r.id}
                  status={r.status}
                  timing={r.timing}
                  signerName={`${r.customer.firstName} ${r.customer.lastName}`}
                />
                <StatusActions reservationId={r.id} status={r.status} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
