"use client";

import { format } from "date-fns";
import { Mail, Phone, Receipt, IdCard } from "lucide-react";
import type { CustomerDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/utils/vehicle";
import { SectionTitle, Row } from "./detail-primitives";

const eur = (v: unknown) => `${Number(v).toFixed(2)} EUR`;

export function CustomerDetailBody({ detail }: { detail: CustomerDetail }) {
  const all = detail.reservations;
  const active = all.filter(
    (r) => r.status === "ACTIVE" || r.status === "CONFIRMED"
  );
  const cancelled = all.filter((r) => r.status === "CANCELLED");
  const spend = all
    .filter((r) => r.status === "ACTIVE" || r.status === "COMPLETED")
    .reduce((sum, r) => sum + Number(r.totalPrice), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Rentals" value={String(all.length)} />
        <Metric label="Lifetime" value={`${Math.round(spend)} EUR`} />
        <Metric label="Cancelled" value={String(cancelled.length)} />
      </div>

      <section>
        <SectionTitle icon={Mail}>Contact</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label="Email">
            <span className="truncate">{detail.email}</span>
          </Row>
          <Row label="Phone">
            <span className="flex items-center gap-1.5">
              <Phone className="text-muted-foreground h-3 w-3" />
              {detail.phone}
            </span>
          </Row>
          <Row label="Customer since">
            {format(detail.createdAt, "dd MMM yyyy")}
          </Row>
        </div>
        {detail.notes && (
          <p className="bg-secondary text-muted-foreground mt-2 rounded-lg p-3 text-xs">
            {detail.notes}
          </p>
        )}
      </section>

      <section>
        <SectionTitle icon={IdCard}>Driver&apos;s licence</SectionTitle>
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-xs">
          Not captured yet — licence details are collected at the counter.
        </p>
      </section>

      {active.length > 0 && (
        <section>
          <SectionTitle icon={Receipt}>Active and upcoming</SectionTitle>
          <ul className="divide-y">
            {active.map((r) => (
              <ReservationRow key={r.id} reservation={r} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle icon={Receipt}>Full history ({all.length})</SectionTitle>
        <ul className="divide-y">
          {all.map((r) => (
            <ReservationRow key={r.id} reservation={r} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReservationRow({
  reservation: r,
}: {
  reservation: CustomerDetail["reservations"][number];
}) {
  return (
    <li className="flex items-center gap-2 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{vehicleLabel(r.vehicle)}</p>
        <p className="text-muted-foreground">
          {format(r.pickupDate, "dd MMM")} -{" "}
          {format(r.returnDate, "dd MMM yyyy")}
        </p>
      </div>
      <span className="tabular-nums">{eur(r.totalPrice)}</span>
      <StatusBadge status={r.status} />
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary rounded-lg border p-3 text-center">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="font-display mt-0.5 text-base font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}
