"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import {
  CalendarRange,
  ClipboardCheck,
  Mail,
  Printer,
  Receipt,
  History as HistoryIcon,
} from "lucide-react";
import type { ReservationDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./reservations/status-actions";
import { ExtendReservation } from "./reservations/extend-reservation";
import { SectionTitle, Row } from "./detail-primitives";
import { vehicleLabel } from "@/lib/vehicle-label";
import { ReservationAttention } from "@/components/shared/reservation-attention";
import { InspectionAction } from "./reservations/inspection-action";
import { RecordPastRental } from "./reservations/record-past-rental";
import { formatDay } from "./reservations/format-day";
import { useI18n } from "@/components/shared/locale-provider";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { formatEur } from "@/lib/money";
import { lateReturnSummary } from "@/lib/late-return";
import { earlyReturnSummary } from "@/lib/early-return";
import { formatNumber } from "@/lib/number-format";
import { rentalDays } from "@/lib/rental-dates";
import { cn } from "@/lib/utils";
import { withDrawerTarget } from "./drawer-url";
import { ContactDifferenceNotice } from "./contact-difference";
import { AuditHistory } from "./audit-history";

/**
 * A click that should open the vehicle in place, rather than one the browser
 * should handle itself (a new tab, a new window, a download).
 */
const plainClick = (event: React.MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * The reservation drawer, read top to bottom as staff use it: where the
 * booking stands and what can be done about it; the car; when; the money;
 * who; and then the record — inspections, changes, the customer's other
 * bookings.
 *
 * The car's photo and name both open the vehicle's own drawer, by its id,
 * through the same URL state every drawer uses — so they are real links
 * (new tab works, the URL can be shared) that swap the drawer in place on a
 * plain click. Each is its own target; the block around them is not a
 * button.
 */
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
  const { openVehicle, openCustomer } = useDetailDrawer();
  const searchParams = useSearchParams();
  const dateLocale = locale === "sq" ? sq : enUS;
  const eur = (v: number | string) => formatEur(v, locale);
  const day = (d: Date) => format(d, "EEE dd MMM yyyy", { locale: dateLocale });
  const stamp = (d: Date) =>
    format(d, "dd MMM yyyy, HH:mm", { locale: dateLocale });
  const days = (count: number) =>
    t(count === 1 ? "admin.dayCount" : "admin.dayCountPlural", { count });

  const { vehicle, customer, timing } = detail;
  const cover = vehicle.images[0];
  const history = customer.reservations;
  const late = lateReturnSummary(detail);
  const early = earlyReturnSummary(detail);
  const customerName = `${customer.firstName} ${customer.lastName}`;
  const vehicleName = `${vehicle.brand} ${vehicle.model}`;
  const bookedDays = rentalDays(detail.pickupDate, detail.returnDate);
  // The booked amount: kept beside the total once a return changed it, and
  // otherwise the total less any late charge (which is all it can differ by).
  const bookedAmount =
    detail.bookedTotal ?? detail.totalPrice - (late?.charge ?? 0);
  const open = detail.status === "PENDING" || detail.status === "CONFIRMED";
  const inFlight = detail.status === "CONFIRMED" || detail.status === "ACTIVE";
  // Before the pickup day a handover cannot be recorded yet; said here, in
  // context, rather than as a sentence on every row of the list.
  const handoverFrom =
    detail.status === "CONFIRMED" && !timing.canStart ? timing.pickupDay : null;

  const vehicleHref = `?${withDrawerTarget(searchParams.toString(), {
    kind: "vehicle",
    id: vehicle.id,
  })}`;
  const toVehicle = (event: React.MouseEvent) => {
    if (!plainClick(event)) return;
    event.preventDefault();
    openVehicle(vehicle.id);
  };

  const billing = {
    pricePerDay: vehicle.pricePerDay,
    totalPrice: detail.totalPrice,
    dailyRate: detail.dailyRate,
    vehicleName: vehicleLabel(vehicle),
  };

  return (
    <div className="space-y-7">
      {/* Where it stands, and what can be done about it. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={detail.status} dot />
          <ReservationAttention attention={timing.attention} />
          {handoverFrom && (
            <span className="text-muted-foreground text-xs">
              {t("admin.handoverFrom", {
                date: formatDay(handoverFrom, dateLocale),
              })}
            </span>
          )}
        </div>
        {(open || detail.status === "ACTIVE") && (
          <div className="flex flex-wrap items-start gap-2">
            <RecordPastRental
              reservationId={detail.id}
              timing={timing}
              customerName={customerName}
              {...billing}
              onSuccess={onChanged}
            />
            <InspectionAction
              reservationId={detail.id}
              status={detail.status}
              timing={timing}
              signerName={customerName}
              {...billing}
              onSuccess={onChanged}
            />
            <StatusActions
              reservationId={detail.id}
              status={detail.status}
              expired={timing.attention === "REQUEST_EXPIRED"}
              onSuccess={onDone}
            />
          </div>
        )}
        {/* The sheet the customer signs at the counter: before the
            handover (blank condition lines to fill in), or after it, filled
            from the inspection. A new tab, so the drawer stays as it was. */}
        {detail.status !== "PENDING" && detail.status !== "CANCELLED" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a
              href={`/admin/print/handover/${detail.id}`}
              target="_blank"
              rel="noopener"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <Printer className="size-3.5" aria-hidden />
              {t("handover.printPickup")}
            </a>
            {detail.status === "COMPLETED" && (
              <a
                href={`/admin/print/handover/${detail.id}?type=return`}
                target="_blank"
                rel="noopener"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                <Printer className="size-3.5" aria-hidden />
                {t("handover.printReturn")}
              </a>
            )}
          </div>
        )}
        {inFlight && (
          <ExtendReservation
            reservationId={detail.id}
            returnDate={detail.returnDate}
            pricePerDay={vehicle.pricePerDay}
            extension={detail.extension}
            expired={timing.attention === "REQUEST_EXPIRED"}
            onExtended={onChanged}
          />
        )}
      </section>

      {/* The car: photo and name each open the vehicle. */}
      <section>
        <a
          href={vehicleHref}
          onClick={toVehicle}
          aria-label={t("admin.openVehicle", { name: vehicleLabel(vehicle) })}
          className="group bg-media focus-visible:ring-ring/50 relative block aspect-[16/9] cursor-pointer overflow-hidden rounded-none focus-visible:ring-2 focus-visible:outline-none"
        >
          {cover ? (
            <Image
              src={cover.url}
              alt=""
              fill
              sizes="26rem"
              className="object-cover transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.02] group-hover:opacity-90 motion-reduce:transition-none"
            />
          ) : (
            <span className="text-media-foreground absolute inset-0 flex items-center justify-center text-xs tracking-[0.14em] uppercase">
              {vehicle.brand}
            </span>
          )}
          <span className="absolute top-3 right-3">
            <StatusBadge status={vehicle.status} />
          </span>
        </a>
        <div className="mt-3">
          <a
            href={vehicleHref}
            onClick={toVehicle}
            className="font-display decoration-foreground/40 hover:decoration-foreground focus-visible:ring-ring/50 cursor-pointer text-lg leading-tight font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {vehicleName}
          </a>
          <p className="text-muted-foreground mt-0.5 text-xs tracking-wide">
            {[
              vehicle.plate,
              vehicle.year,
              vehicle.category.charAt(0) +
                vehicle.category.slice(1).toLowerCase(),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </section>

      <section>
        <SectionTitle icon={CalendarRange}>
          {t("admin.rentalPeriod")}
        </SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.pickup")}>{day(detail.pickupDate)}</Row>
          <Row
            label={
              detail.completedAt
                ? t("admin.scheduledReturn")
                : t("admin.return")
            }
          >
            {day(detail.returnDate)}
          </Row>
          <Row label={t("admin.bookedDuration")}>{days(bookedDays)}</Row>
          {detail.startedAt && (
            <Row label={t("admin.handover")}>{stamp(detail.startedAt)}</Row>
          )}
          {detail.completedAt && (
            <Row label={t("admin.actualReturn")}>
              {stamp(detail.completedAt)}
            </Row>
          )}
          {detail.actualDays !== null && detail.actualDays !== bookedDays && (
            <Row label={t("admin.daysUsed")}>{days(detail.actualDays)}</Row>
          )}
          <Row label={t("admin.booked")}>
            <span className="text-muted-foreground">
              {format(detail.createdAt, "dd MMM yyyy", { locale: dateLocale })}
            </span>
          </Row>
          {detail.backfilledAt && (
            // The audit trace: this rental was entered in one step after it
            // was over, without inspections, and why.
            <Row label={t("admin.recordedAfterFact")}>
              <span>
                {t("admin.recordedAfterFactBy", {
                  date: stamp(detail.backfilledAt),
                  name: detail.backfilledBy?.name ?? "—",
                })}
                {detail.backfillNote && (
                  <span className="text-muted-foreground block text-xs">
                    {detail.backfillNote}
                  </span>
                )}
              </span>
            </Row>
          )}
        </div>
      </section>

      <section>
        <SectionTitle icon={Receipt}>{t("admin.billing")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.agreedRate")}>
            <span className="tabular-nums" title={t("admin.agreedRateHelp")}>
              {eur(detail.dailyRate ?? vehicle.pricePerDay)}
            </span>
          </Row>
          <Row label={t("admin.bookedAmount")}>
            <span className="tabular-nums">{eur(bookedAmount)}</span>
          </Row>
          {late && (
            // Back after the booked return day, and how staff settled it.
            <Row
              label={t(
                late.days === 1
                  ? "admin.returnedLate"
                  : "admin.returnedLatePlural",
                { count: late.days }
              )}
            >
              <span className="text-right">
                {late.resolution === "CHARGED"
                  ? t("admin.lateCharged", { amount: eur(late.charge) })
                  : t("admin.lateWaived")}
                {late.waiverReason && (
                  <span className="text-muted-foreground block text-xs break-words">
                    {late.waiverReason}
                  </span>
                )}
              </span>
            </Row>
          )}
          {early && (
            // Back before it, and how it was billed. The original stays
            // above, as the booked amount.
            <Row label={t("admin.returnedEarly")}>
              {t(
                early.billing === "ACTUAL_DAYS"
                  ? "admin.earlyBilledActual"
                  : "admin.earlyBilledFull",
                { count: early.usedDays, booked: bookedDays }
              )}
            </Row>
          )}
          <div className="flex items-baseline justify-between gap-3 border-t pt-2.5">
            <span className="text-muted-foreground text-xs">
              {detail.status === "COMPLETED"
                ? t("admin.totalCharged")
                : t("admin.total")}
            </span>
            <span className="font-display text-lg font-bold tabular-nums">
              {eur(detail.totalPrice)}
            </span>
          </div>
          <Row label={t("admin.payment")}>
            <span className="text-muted-foreground">
              {detail.status === "COMPLETED"
                ? t("admin.settledReturn")
                : t("admin.duePickup")}
            </span>
          </Row>
        </div>
        {detail.notes && (
          <p className="bg-secondary text-muted-foreground mt-3 rounded-none p-3 text-xs">
            {detail.notes}
          </p>
        )}
      </section>

      <section>
        <SectionTitle icon={Mail}>{t("admin.customer")}</SectionTitle>
        <div className="space-y-2 text-sm">
          <Row label={t("admin.name")}>
            <button
              type="button"
              onClick={() => openCustomer(customer.id)}
              className="focus-visible:ring-ring/50 cursor-pointer rounded-none text-right underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              {customerName}
            </button>
          </Row>
          <Row label={t("admin.email")}>
            <a
              href={`mailto:${customer.email}`}
              className="block truncate underline-offset-4 hover:underline"
            >
              {customer.email}
            </a>
          </Row>
          <Row label={t("admin.phone")}>
            <a
              href={`tel:${customer.phone.replace(/\s+/g, "")}`}
              className="tabular-nums underline-offset-4 hover:underline"
            >
              {customer.phone}
            </a>
          </Row>
          <Row label={t("admin.lifetimeSpend")}>
            <span className="font-semibold tabular-nums">
              {eur(customer.spend)}
            </span>
          </Row>
          {detail.contactDifference && (
            <ContactDifferenceNotice
              difference={detail.contactDifference}
              customerId={customer.id}
              customerNotes={customer.notes}
              // The record shown just above changes, so reload in place.
              onApplied={onChanged}
            />
          )}
          {customer.notes && (
            <p className="bg-secondary text-muted-foreground rounded-none p-3 text-xs">
              {customer.notes === "Repeat customer, prefers automatic."
                ? t("admin.demoRepeatCustomer")
                : customer.notes}
            </p>
          )}
        </div>
      </section>

      {detail.inspections.length > 0 && (
        <section>
          <SectionTitle icon={ClipboardCheck}>
            {t("admin.inspections", { count: detail.inspections.length })}
          </SectionTitle>
          <div className="divide-y border-y">
            {detail.inspections.map((inspection) => (
              <article key={inspection.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {inspection.type === "PICKUP"
                        ? t("admin.pickupCondition")
                        : t("admin.returnCondition")}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {t("admin.recordedBy", {
                        date: stamp(inspection.createdAt),
                        name: inspection.createdBy.name,
                      })}
                    </p>
                  </div>
                  <span className="text-xs font-semibold tabular-nums">
                    {t("admin.fuelPercent", {
                      mileage: formatNumber(inspection.mileage, locale),
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
                        className="bg-media relative aspect-square overflow-hidden rounded-none"
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

                <p className="text-muted-foreground mt-2 text-[11px]">
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

      <AuditHistory items={detail.history} />

      <section>
        <SectionTitle icon={HistoryIcon}>
          {t("admin.reservationHistory", { count: history.length })}
        </SectionTitle>
        <ul className="divide-y">
          {history.map((r) => (
            <li
              key={r.id}
              className={cn(
                "flex items-center gap-2 py-2 text-xs",
                r.id === detail.id && "text-muted-foreground"
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {vehicleLabel(r.vehicle)}
                </p>
                <p className="text-muted-foreground">
                  {format(r.pickupDate, "dd MMM", { locale: dateLocale })} –{" "}
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
