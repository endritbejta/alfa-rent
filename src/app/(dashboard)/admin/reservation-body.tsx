"use client";

import Image from "next/image";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import {
  Mail,
  Phone,
  Car,
  CalendarRange,
  Receipt,
  ClipboardCheck,
} from "lucide-react";
import type { ReservationDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./reservations/status-actions";
import { ExtendReservation } from "./reservations/extend-reservation";
import { SectionTitle, Row } from "./detail-primitives";
import { vehicleLabel } from "@/utils/vehicle";
import { ReservationAttention } from "@/components/shared/reservation-attention";
import { InspectionAction } from "./reservations/inspection-action";
import { useI18n } from "@/components/shared/locale-provider";

const eur = (v: unknown) => `${Number(v).toFixed(2)} EUR`;

export function ReservationBody({
  detail,
  onDone,
  onChanged,
}: {
  detail: ReservationDetail;
  /** Completing a task here should feel finished — the drawer dismisses. */
  onDone: () => void;
  /** An edit that leaves the reservation open — reload, stay put. */
  onChanged: () => void;
}) {
  const { locale, t } = useI18n();
  const dateLocale = locale === "sq" ? sq : enUS;
  const cover = detail.vehicle.images[0];
  const history = detail.customer.reservations;

  return (
    <div className="space-y-6">
      <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900">
        {cover ? (
          <Image
            src={cover.url}
            alt={vehicleLabel(detail.vehicle)}
            fill
            sizes="26rem"
            className="object-cover"
          />
        ) : (
          <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] uppercase">
            {detail.vehicle.brand}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <StatusBadge status={detail.vehicle.status} />
        </span>
      </div>

      <section>
        <SectionTitle icon={CalendarRange}>
          {t("admin.thisReservation")}
        </SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.status")}>
            <span className="flex flex-wrap justify-end gap-1.5">
              <StatusBadge status={detail.status} />
              <ReservationAttention attention={detail.timing.attention} />
            </span>
          </Row>
          <Row label={t("admin.pickup")}>
            {format(detail.pickupDate, "EEE dd MMM yyyy", {
              locale: dateLocale,
            })}
          </Row>
          <Row label={t("admin.return")}>
            {format(detail.returnDate, "EEE dd MMM yyyy", {
              locale: dateLocale,
            })}
          </Row>
          <Row label={t("admin.total")}>
            <span className="font-display font-bold">
              {eur(detail.totalPrice)}
            </span>
          </Row>
          <Row label={t("admin.payment")}>
            <span className="text-muted-foreground">
              {detail.status === "COMPLETED"
                ? t("admin.settledReturn")
                : t("admin.duePickup")}
            </span>
          </Row>
          <Row label={t("admin.booked")}>
            {format(detail.createdAt, "dd MMM yyyy", { locale: dateLocale })}
          </Row>
          {detail.startedAt && (
            <Row label={t("admin.handover")}>
              {format(detail.startedAt, "dd MMM yyyy, HH:mm", {
                locale: dateLocale,
              })}
            </Row>
          )}
          {detail.completedAt && (
            <Row label={t("admin.returned")}>
              {format(detail.completedAt, "dd MMM yyyy, HH:mm", {
                locale: dateLocale,
              })}
            </Row>
          )}
          {detail.notes && (
            <p className="bg-secondary text-muted-foreground rounded-lg p-3 text-xs">
              {detail.notes}
            </p>
          )}
        </div>
        <ExtendReservation
          reservationId={detail.id}
          returnDate={detail.returnDate}
          pricePerDay={detail.vehicle.pricePerDay}
          extension={detail.extension}
          onExtended={onChanged}
        />

        <div className="mt-3">
          <div className="flex flex-wrap justify-end gap-2">
            <InspectionAction
              reservationId={detail.id}
              status={detail.status}
              timing={detail.timing}
              signerName={`${detail.customer.firstName} ${detail.customer.lastName}`}
              onSuccess={onChanged}
            />
            <StatusActions
              reservationId={detail.id}
              status={detail.status}
              onSuccess={onDone}
            />
          </div>
        </div>
      </section>

      {detail.inspections.length > 0 && (
        <section>
          <SectionTitle icon={ClipboardCheck}>
            {t("admin.inspections", { count: detail.inspections.length })}
          </SectionTitle>
          <div className="space-y-3">
            {detail.inspections.map((inspection) => (
              <article
                key={inspection.id}
                className="bg-secondary/60 rounded-xl border p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {inspection.type === "PICKUP"
                        ? t("admin.pickupCondition")
                        : t("admin.returnCondition")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("admin.recordedBy", {
                        date: format(
                          inspection.createdAt,
                          "dd MMM yyyy, HH:mm",
                          {
                            locale: dateLocale,
                          }
                        ),
                        name: inspection.createdBy.name,
                      })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums">
                    {t("admin.fuelPercent", {
                      mileage: inspection.mileage.toLocaleString(locale),
                      fuel: inspection.fuelLevel,
                    })}
                  </span>
                </div>

                {(inspection.exteriorNotes ||
                  inspection.interiorNotes ||
                  inspection.damageNotes) && (
                  <dl className="mt-3 space-y-1 text-xs">
                    {inspection.exteriorNotes && (
                      <div>
                        <dt className="text-muted-foreground inline">
                          {t("admin.exterior")}:{" "}
                        </dt>
                        <dd className="inline">{inspection.exteriorNotes}</dd>
                      </div>
                    )}
                    {inspection.interiorNotes && (
                      <div>
                        <dt className="text-muted-foreground inline">
                          {t("admin.interior")}:{" "}
                        </dt>
                        <dd className="inline">{inspection.interiorNotes}</dd>
                      </div>
                    )}
                    {inspection.damageNotes && (
                      <div>
                        <dt className="text-destructive inline font-semibold">
                          {t("admin.damage")}:{" "}
                        </dt>
                        <dd className="inline">{inspection.damageNotes}</dd>
                      </div>
                    )}
                  </dl>
                )}

                {inspection.photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {inspection.photos.map((photo) => (
                      <div
                        key={photo.id}
                        className="bg-media relative aspect-square overflow-hidden rounded-lg"
                      >
                        <Image
                          src={photo.url}
                          alt={t("admin.inspectionPhoto", {
                            type:
                              inspection.type === "PICKUP"
                                ? t("admin.pickup").toLowerCase()
                                : t("admin.return").toLowerCase(),
                          })}
                          fill
                          sizes="8rem"
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-muted-foreground mt-3 border-t pt-2 text-[11px]">
                  {t("admin.acknowledgedBy", {
                    name: inspection.signerName,
                    time: format(inspection.acknowledgedAt, "HH:mm", {
                      locale: dateLocale,
                    }),
                  })}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle icon={Mail}>{t("admin.customer")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.name")}>
            {detail.customer.firstName} {detail.customer.lastName}
          </Row>
          <Row label={t("admin.email")}>
            <span className="truncate">{detail.customer.email}</span>
          </Row>
          <Row label={t("admin.phone")}>
            <span className="flex items-center gap-1.5">
              <Phone className="text-muted-foreground h-3 w-3" />
              {detail.customer.phone}
            </span>
          </Row>
          <Row label={t("admin.lifetimeSpend")}>
            <span className="font-semibold">{eur(detail.customer.spend)}</span>
          </Row>
          {detail.customer.notes && (
            <p className="bg-secondary text-muted-foreground rounded-lg p-3 text-xs">
              {detail.customer.notes === "Repeat customer, prefers automatic."
                ? t("admin.demoRepeatCustomer")
                : detail.customer.notes}
            </p>
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon={Car}>{t("admin.vehicle")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.category")}>
            {detail.vehicle.category.charAt(0) +
              detail.vehicle.category.slice(1).toLowerCase()}
          </Row>
          <Row label={t("admin.dayRate")}>
            {eur(detail.vehicle.pricePerDay)}
          </Row>
          {detail.vehicle.registrationExpiry && (
            <Row label={t("admin.registration")}>
              {format(detail.vehicle.registrationExpiry, "dd MMM yyyy", {
                locale: dateLocale,
              })}
            </Row>
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon={Receipt}>
          {t("admin.reservationHistory", { count: history.length })}
        </SectionTitle>
        <ul className="divide-y">
          {history.map((r) => (
            <li key={r.id} className="flex items-center gap-2 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {vehicleLabel(r.vehicle)}
                </p>
                <p className="text-muted-foreground">
                  {format(r.pickupDate, "dd MMM", { locale: dateLocale })} -{" "}
                  {format(r.returnDate, "dd MMM yyyy", {
                    locale: dateLocale,
                  })}
                </p>
              </div>
              <span className="tabular-nums">{eur(r.totalPrice)}</span>
              <StatusBadge status={r.status} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
