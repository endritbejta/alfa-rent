"use client";

import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
} from "date-fns";
import { CalendarRange, Clock, Mail, Phone, Car } from "lucide-react";
import { useDetailDrawer } from "@/app/(dashboard)/admin/reservation-detail";
import { StatusActions } from "./status-actions";
import { vehicleLabel } from "@/utils/vehicle";

export type PendingRequest = {
  id: string;
  pickupDate: Date;
  returnDate: Date;
  totalPrice: string;
  createdAt: Date;
  notes: string | null;
  vehicle: { brand: string; model: string; plate: string | null };
  customer: { firstName: string; lastName: string; email: string };
};

/**
 * A pending request is a decision, not a row: each one is a self-contained
 * module carrying the whole case — who, which car, when, how much, how long
 * it has waited — so staff can act without opening anything else.
 */
export function PendingRequestCard({ request }: { request: PendingRequest }) {
  const { openReservation } = useDetailDrawer();
  const days = differenceInCalendarDays(request.returnDate, request.pickupDate);
  const waiting = formatDistanceToNow(request.createdAt, { addSuffix: false });
  const stale = differenceInCalendarDays(new Date(), request.createdAt) >= 2;

  return (
    <article className="bg-card hover:border-brand/30 rounded-xl border p-4 shadow-xs transition-colors sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => openReservation(request.id)}
          className="min-w-0 cursor-pointer text-left"
        >
          <p className="font-display truncate text-base font-bold hover:underline">
            {request.customer.firstName} {request.customer.lastName}
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
            <Mail className="h-3 w-3 shrink-0" />
            {request.customer.email}
          </p>
        </button>

        <span
          className={
            stale
              ? "bg-destructive/10 text-destructive flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              : "bg-status-maint/12 text-status-maint flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          }
        >
          <Clock className="h-3 w-3" />
          waiting {waiting}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact
          icon={Car}
          label="Vehicle"
          value={vehicleLabel(request.vehicle)}
        />
        <Fact
          icon={CalendarRange}
          label="Dates"
          value={`${format(request.pickupDate, "dd MMM")} - ${format(request.returnDate, "dd MMM")}`}
          hint={`${days} day${days === 1 ? "" : "s"}`}
        />
        <Fact
          icon={Phone}
          label="Requested"
          value={format(request.createdAt, "dd MMM yyyy")}
        />
        <div>
          <dt className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
            Total
          </dt>
          <dd className="font-display mt-0.5 text-lg font-bold tabular-nums">
            {Number(request.totalPrice).toFixed(2)} EUR
          </dd>
        </div>
      </dl>

      {request.notes && (
        <p className="bg-secondary text-muted-foreground mt-3 rounded-lg px-3 py-2 text-xs">
          {request.notes}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <button
          type="button"
          onClick={() => openReservation(request.id)}
          className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold transition-colors"
        >
          View full detail
        </button>
        <StatusActions reservationId={request.id} status="PENDING" />
      </div>
    </article>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground flex items-center gap-1 text-[10px] font-semibold tracking-[0.08em] uppercase">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{value}</dd>
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
    </div>
  );
}
