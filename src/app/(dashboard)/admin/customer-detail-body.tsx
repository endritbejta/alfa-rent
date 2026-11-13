"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { Mail, Pencil, Phone, Receipt, IdCard, ShieldOff } from "lucide-react";
import type { CustomerDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { vehicleLabel } from "@/lib/vehicle-label";
import { SectionTitle, Row } from "./detail-primitives";
import { useI18n } from "@/components/shared/locale-provider";
import { formatEur } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { CustomerEditForm } from "./customer-edit-form";
import { AuditHistory } from "./audit-history";
import { anonymiseCustomerAction } from "./customers/actions";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { toasts } from "@/components/dashboard/toaster";
import { MISSING_PHONE, WALK_IN_EMAIL } from "@/lib/validations/customer";

export function CustomerDetailBody({
  detail,
  onChanged,
}: {
  detail: CustomerDetail;
  /** Reloads the drawer in place after an edit. */
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const anonymised = detail.anonymisedAt !== null;
  const contactMissing =
    !anonymised &&
    (detail.phone === MISSING_PHONE || WALK_IN_EMAIL.test(detail.email));
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
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Mail}>{t("admin.contact")}</SectionTitle>
          {!editing && !anonymised && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" />
              {t("admin.editCustomer")}
            </Button>
          )}
        </div>
        {editing ? (
          <CustomerEditForm
            detail={detail}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              onChanged();
            }}
          />
        ) : (
          <>
            {detail.anonymisedAt && (
              <p
                role="note"
                className="bg-secondary text-muted-foreground mb-2 rounded-none p-3 text-xs"
              >
                {t("admin.anonymisedNote", {
                  date: format(detail.anonymisedAt, "dd MMM yyyy", {
                    locale: dateLocale,
                  }),
                })}
              </p>
            )}
            {contactMissing && (
              <p
                role="note"
                className="bg-status-maint/10 text-status-maint mb-2 rounded-none p-3 text-xs"
              >
                {t("admin.contactMissing")}
              </p>
            )}
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
                {format(detail.createdAt, "dd MMM yyyy", {
                  locale: dateLocale,
                })}
              </Row>
            </div>
            {detail.notes && (
              <p className="bg-secondary text-muted-foreground mt-2 rounded-none p-3 text-xs">
                {detail.notes === "Repeat customer, prefers automatic."
                  ? t("admin.demoRepeatCustomer")
                  : detail.notes}
              </p>
            )}
          </>
        )}
      </section>

      <section>
        <SectionTitle icon={IdCard}>{t("admin.driversLicence")}</SectionTitle>
        <p className="text-muted-foreground rounded-none border border-dashed px-3 py-3 text-xs">
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

      <AuditHistory items={detail.history} />

      {detail.viewerIsAdmin && !anonymised && (
        <AnonymiseSection detail={detail} onDone={onChanged} />
      )}
    </div>
  );
}

const OPEN_STATUSES = new Set(["PENDING", "CONFIRMED", "ACTIVE"]);

/**
 * The erasure request's answer. The button is disabled while the loaded
 * history shows an open reservation, to say why up front; the server checks
 * every reservation, not just the 50 loaded, and refuses on its own.
 */
function AnonymiseSection({
  detail,
  onDone,
}: {
  detail: CustomerDetail;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = detail.reservations.some((r) => OPEN_STATUSES.has(r.status));

  const anonymise = () => {
    setError(null);
    startTransition(async () => {
      const result = await anonymiseCustomerAction(detail.id);
      setConfirming(false);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      toasts.success(t("toast.customerAnonymised"));
      // Names behind the drawer, in the lists and the calendar, change too.
      router.refresh();
      onDone();
    });
  };

  return (
    <section>
      <SectionTitle icon={ShieldOff}>{t("admin.privacySection")}</SectionTitle>
      <p className="text-muted-foreground text-xs leading-relaxed">
        {blocked ? t("admin.anonymiseBlocked") : t("admin.anonymiseHelp")}
      </p>
      {error && (
        <p role="alert" className="text-destructive mt-2 text-xs">
          {error}
        </p>
      )}
      <Button
        size="sm"
        variant="destructive"
        className="mt-3"
        disabled={blocked || pending}
        onClick={() => setConfirming(true)}
      >
        {t("admin.anonymise")}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t("admin.anonymiseTitle")}
        body={t("admin.anonymiseBody")}
        confirmLabel={t("admin.anonymiseConfirm")}
        pending={pending}
        onConfirm={anonymise}
        onCancel={() => setConfirming(false)}
      />
    </section>
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
    <div className="bg-secondary rounded-none border p-3 text-center">
      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.08em] uppercase">
        {label}
      </p>
      <p className="font-display mt-0.5 text-base font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}
