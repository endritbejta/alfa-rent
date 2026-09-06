"use client";

import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { Mail, Phone, Receipt, IdCard } from "lucide-react";
import type { CustomerDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/lib/vehicle-label";
import { SectionTitle, Row } from "./detail-primitives";
import { useI18n } from "@/components/shared/locale-provider";
import { formatEur } from "@/lib/money";

export function CustomerDetailBody({ detail }: { detail: CustomerDetail }) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const eur = (v: number | string) => formatEur(v, locale);
  const all = detail.reservations;
  const active = all.filter(
    (r) => r.status === "ACTIVE" || r.status === "CONFIRMED"
  );
  const cancelled = all.filter((r) => r.status === "CANCELLED");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Metric label={t("admin.rentals")} value={String(all.length)} />
        <Metric label={t("admin.lifetime")} value={eur(detail.spend)} />
        <Metric label={t("admin.cancelled")} value={String(cancelled.length)} />
      </div>

      <section>
        <SectionTitle icon={Mail}>{t("admin.contact")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.email")}>
            <span className="truncate">{detail.email}</span>
          </Row>
          <Row label={t("admin.phone")}>
            <span className="flex items-center gap-1.5">
              <Phone className="text-muted-foreground h-3 w-3" />
              {detail.phone}
            </span>
          </Row>
          <Row label={t("admin.customerSince")}>
            {format(detail.createdAt, "dd MMM yyyy", { locale: dateLocale })}
          </Row>
        </div>
        {detail.notes && (
          <p className="bg-secondary text-muted-foreground mt-2 rounded-lg p-3 text-xs">
            {detail.notes === "Repeat customer, prefers automatic."
              ? t("admin.demoRepeatCustomer")
              : detail.notes}
          </p>
        )}
      </section>

      <section>
        <SectionTitle icon={IdCard}>{t("admin.driversLicence")}</SectionTitle>
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-3 text-xs">
          {t("admin.licenceNotCaptured")}
        </p>
      </section>

      {active.length > 0 && (
        <section>
          <SectionTitle icon={Receipt}>
            {t("admin.activeUpcoming")}
          </SectionTitle>
          <ul className="divide-y">
            {active.map((r) => (
              <ReservationRow key={r.id} reservation={r} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle icon={Receipt}>
          {t("admin.fullHistory", { count: all.length })}
        </SectionTitle>
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
  const { locale } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const eur = (v: number | string) => formatEur(v, locale);
  return (
    <li className="flex items-center gap-2 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{vehicleLabel(r.vehicle)}</p>
        <p className="text-muted-foreground">
          {format(r.pickupDate, "dd MMM", { locale: dateLocale })} -{" "}
          {format(r.returnDate, "dd MMM yyyy", { locale: dateLocale })}
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
