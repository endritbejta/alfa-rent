"use client";

import { enUS, sq } from "date-fns/locale";
import type { ReservationStatus } from "@prisma/client";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleIdentifier, vehicleLabel } from "@/lib/vehicle-label";
import { formatEur } from "@/lib/money";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { rentalDaysBetween } from "@/lib/rental-dates";
import { ReservationAttention } from "@/components/shared/reservation-attention";
import { RowActions } from "./row-actions";
import { formatRentalPeriod } from "./format-day";
import { LateReturnNote } from "@/components/shared/late-return-note";
import { EarlyReturnNote } from "@/components/shared/early-return-note";
import type { LateReturnSummary } from "@/lib/late-return";
import type { EarlyReturnSummary } from "@/lib/early-return";
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
  /** The car's rate today, for a late return's charge. */
  pricePerDay: number;
  /** The rate the booking was agreed at, for an early return's bill. */
  dailyRate: number | null;
  /** How a return after the booked return day was settled, if it was. */
  late: LateReturnSummary | null;
  /** How a return before it was billed, if it was. */
  early: EarlyReturnSummary | null;
  vehicle: { brand: string; model: string; plate: string | null };
  customer: { firstName: string; lastName: string; email: string };
};

/** What both layouts derive from a row, in the operator's language. */
function useRowText() {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  return (r: Row) => {
    const days = rentalDaysBetween(r.timing.pickupDay, r.timing.returnDay);
    return {
      name: `${r.customer.firstName} ${r.customer.lastName}`,
      model: `${r.vehicle.brand} ${r.vehicle.model}`,
      plate: vehicleIdentifier(r.vehicle),
      period: formatRentalPeriod(
        r.timing.pickupDay,
        r.timing.returnDay,
        dateLocale
      ),
      days: t(days === 1 ? "admin.dayCount" : "admin.dayCountPlural", {
        count: days,
      }),
      total: formatEur(r.totalPrice, locale),
    };
  };
}

function actionsFor(r: Row, name: string) {
  return (
    <RowActions
      reservationId={r.id}
      status={r.status}
      timing={r.timing}
      customerName={name}
      pricePerDay={r.pricePerDay}
      totalPrice={Number(r.totalPrice)}
      dailyRate={r.dailyRate}
      vehicleName={vehicleLabel(r.vehicle)}
    />
  );
}

/**
 * The whole row opens the detail drawer.
 *
 * The row is the target because the record is what staff want — hunting for
 * a link inside it is the click this removes. The action buttons stop the
 * event: a row that opened a drawer *and* started a rental would be a trap.
 *
 * Each cell is a short primary line over a muted secondary one — name over
 * email, model over plate, period over day count, total over how a return
 * was billed — so the table stays dense without a sentence in any cell.
 */
export function ReservationRows({ rows }: { rows: Row[] }) {
  const { openReservation } = useDetailDrawer();
  const { t } = useI18n();
  const text = useRowText();

  if (rows.length === 0) {
    return (
      <TableBody>
        <TableRow>
          <TableCell
            colSpan={6}
            className="text-muted-foreground py-10 text-center"
          >
            {t("admin.noReservations")}
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }

  return (
    <TableBody>
      {rows.map((r) => {
        const row = text(r);
        return (
          /*
           * The whole row is the pointer target, but it is a row, not a
           * button. role="button" on a <tr> costs the table its semantics —
           * no row, no association with the column headers — and it is
           * invalid besides, because a button may not contain the Confirm
           * and Cancel buttons this row holds. The keyboard path is a real
           * button on the name.
           */
          <TableRow
            key={r.id}
            onClick={() => openReservation(r.id)}
            className="hover:bg-surface-hover cursor-pointer align-top transition-colors"
          >
            <TableCell className="max-w-56 py-3 pl-0">
              <button
                type="button"
                aria-label={t("admin.openReservation", { name: row.name })}
                // The row handles the same click; without this the drawer
                // would be opened twice, and each open is a history entry.
                onClick={(e) => {
                  e.stopPropagation();
                  openReservation(r.id);
                }}
                className="focus-visible:ring-ring/40 block max-w-full cursor-pointer truncate rounded-none text-left font-medium hover:underline focus-visible:ring-2 focus-visible:outline-none"
              >
                {row.name}
              </button>
              <p className="text-muted-foreground truncate text-xs">
                {r.customer.email}
              </p>
            </TableCell>
            <TableCell className="max-w-52 py-3">
              <p className="truncate">{row.model}</p>
              <p className="text-muted-foreground truncate text-xs tracking-wide tabular-nums">
                {row.plate}
              </p>
            </TableCell>
            <TableCell className="py-3">
              <p className="tabular-nums">{row.period}</p>
              <p className="text-muted-foreground text-xs">{row.days}</p>
            </TableCell>
            <TableCell className="py-3 text-right">
              <p className="font-medium tabular-nums">{row.total}</p>
              <LateReturnNote late={r.late} />
              <EarlyReturnNote early={r.early} />
            </TableCell>
            <TableCell className="py-3">
              <StatusBadge status={r.status} dot />
              <p>
                <ReservationAttention attention={r.timing.attention} />
              </p>
            </TableCell>
            <TableCell
              className="py-2.5 pr-0 text-right align-middle"
              // Buttons live inside the row's hit area; without this,
              // confirming a rental would also fling the drawer open behind
              // the click.
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {actionsFor(r, row.name)}
            </TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  );
}

/**
 * The narrow layout — same rule: the item is the target, buttons are not.
 * Still a list with dividers rather than cards: the same two-line pairs,
 * stacked, with the actions on their own line at the item's right edge.
 */
export function ReservationCards({ rows }: { rows: Row[] }) {
  const { openReservation } = useDetailDrawer();
  const { t } = useI18n();
  const text = useRowText();

  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        {t("admin.noReservations")}
      </p>
    );
  }

  return (
    <ul className="divide-y border-y">
      {rows.map((r) => {
        const row = text(r);
        const actions = actionsFor(r, row.name);
        return (
          <li key={r.id}>
            {/*
              The item is the pointer target, not a control: the keyboard
              path is the real button on the name inside it. Making the item
              itself a button would put the Confirm and Cancel buttons
              inside one.
            */}
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div
              onClick={() => openReservation(r.id)}
              className="hover:bg-surface-hover cursor-pointer py-3.5 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    aria-label={t("admin.openReservation", { name: row.name })}
                    onClick={(e) => {
                      e.stopPropagation();
                      openReservation(r.id);
                    }}
                    className="focus-visible:ring-ring/40 block max-w-full cursor-pointer truncate rounded-none text-left text-sm font-semibold hover:underline focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {row.name}
                  </button>
                  <p className="text-muted-foreground truncate text-xs">
                    {row.model}
                    {row.plate && ` · ${row.plate}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <StatusBadge status={r.status} dot />
                  <ReservationAttention attention={r.timing.attention} />
                </div>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-3 text-xs">
                <span className="text-muted-foreground min-w-0 truncate tabular-nums">
                  {row.period} · {row.days}
                </span>
                <span className="text-right">
                  <span className="text-foreground block text-sm font-semibold tabular-nums">
                    {row.total}
                  </span>
                  <LateReturnNote late={r.late} />
                  <EarlyReturnNote early={r.early} />
                </span>
              </div>
              {/*
                This one only stops the item's click from reaching the drawer;
                it adds no interaction of its own.
              */}
              {r.status !== "COMPLETED" && r.status !== "CANCELLED" && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions
                <div
                  className="mt-3"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {actions}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
