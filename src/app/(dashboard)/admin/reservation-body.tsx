"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { enUS, sq } from "date-fns/locale";
import { Menu } from "@base-ui/react/menu";
import { Tabs } from "@base-ui/react/tabs";
import {
  CalendarPlus,
  ClipboardCheck,
  Mail,
  MoreHorizontal,
  Printer,
  Receipt,
  History as HistoryIcon,
  XCircle,
} from "lucide-react";
import type { ReservationDetail } from "./detail-actions";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatusActions } from "./reservations/status-actions";
import { ExtendReservation } from "./reservations/extend-reservation";
import { SectionTitle } from "./detail-primitives";
import { vehicleLabel } from "@/lib/vehicle-label";
import { InspectionAction } from "./reservations/inspection-action";
import { RecordPastRental } from "./reservations/record-past-rental";
import { formatDay } from "./reservations/format-day";
import { useI18n } from "@/components/shared/locale-provider";
import { useDetailDrawer } from "@/components/dashboard/detail-drawer-context";
import { DrawerFooter } from "@/components/dashboard/detail-drawer";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/money";
import { lateReturnSummary } from "@/lib/late-return";
import { earlyReturnSummary } from "@/lib/early-return";
import { formatNumber } from "@/lib/number-format";
import { rentalDays } from "@/lib/rental-dates";
import { cn } from "@/lib/utils";
import { withDrawerTarget } from "./drawer-url";
import { ContactDifferenceNotice } from "./contact-difference";
import { AuditHistory } from "./audit-history";
import { ReservationTimeline } from "./reservation-timeline";

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

const MENU_ITEM =
  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm outline-none select-none data-highlighted:bg-surface-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

const TAB =
  "text-muted-foreground hover:text-foreground data-active:text-foreground focus-visible:ring-ring/50 relative -mb-px cursor-pointer pb-2.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2";

const PRINT_LINK =
  "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline";

/**
 * The reservation drawer, flat and in the order staff read it.
 *
 * The header (the drawer's) carries who and where the booking stands. Below
 * it, the car — photo and name, once — and the rental period as a single
 * pickup → length → return strip, with the timestamps in muted text under
 * it. Then two tabs, so the drawer opens on what is needed at the counter:
 *
 *   Detajet                  billing, with the total as the loudest figure;
 *                            the customer
 *   Kontrollet & Historiku   inspections with their photos and readings;
 *                            the audit trail; the customer's other bookings
 *
 * The actions sit in a bar pinned under the scroll area: the next step as
 * the primary button, extending beside it, and anything rarer (cancelling,
 * starting a rental that is past its window) behind "⋯". Each action keeps
 * its own dialog, rendered with its trigger hidden where a menu opens it, so
 * the menu can close without unmounting the dialog.
 *
 * The car's photo and name both open the vehicle's own drawer, by its id,
 * through the same URL state every drawer uses — so they are real links
 * (new tab works, the URL can be shared) that swap the drawer in place on a
 * plain click.
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
  const stamp = (d: Date) =>
    format(d, "d MMM yyyy, HH:mm", { locale: dateLocale });

  const [extending, setExtending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const extendRef = useRef<HTMLDivElement>(null);

  const { vehicle, customer, timing, status } = detail;
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
  const inFlight = status === "CONFIRMED" || status === "ACTIVE";
  const expired = timing.attention === "REQUEST_EXPIRED";
  // Before the pickup day a handover cannot be recorded yet; said beside the
  // disabled button rather than as a sentence on every row of the list.
  const handoverFrom =
    status === "CONFIRMED" && !timing.canStart ? timing.pickupDay : null;

  // The bar, worked out once. Primary: the next step. Secondary: extending.
  // The menu: what is rarely the move — starting a booking whose whole
  // window has passed (recording it is the usual step), and cancelling.
  const recordPast = timing.canRecordPast;
  const canExtend = inFlight && detail.extension.allowed;
  const startInMenu = recordPast && status === "CONFIRMED";
  const canCancel = status === "PENDING" || status === "CONFIRMED";
  // An expired request can only be cancelled: Cancel is then its one button.
  const cancelAside = canCancel && !(status === "PENDING" && expired);
  const menuItems = Number(startInMenu) + Number(cancelAside);
  // A menu holding one item only hides it behind a click. With no Extend
  // beside the primary, a lone Cancel takes that place as a quiet button.
  const cancelAsButton = cancelAside && !canExtend && !startInMenu;
  const hasMenu = menuItems > 0 && !cancelAsButton;
  const hasBar = status === "PENDING" || inFlight;

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

  const startExtending = () => {
    setExtending(true);
    // The form opens in the body, above the tabs; bring it into view once
    // it has rendered (a timeout, not a frame: see AGENTS.md).
    setTimeout(
      () =>
        extendRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        }),
      0
    );
  };

  return (
    <div className="space-y-8">
      {/* The car, once: photo and name each open the vehicle. */}
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
        <div className="mt-4">
          <a
            href={vehicleHref}
            onClick={toVehicle}
            className="font-display decoration-foreground/40 hover:decoration-foreground focus-visible:ring-ring/50 cursor-pointer text-xl leading-tight font-semibold underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {vehicleName}
          </a>
          <p className="text-muted-foreground mt-1 text-sm">
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

      {/* When: one strip, with the timestamps as muted text under it. */}
      <section aria-label={t("admin.rentalPeriod")} className="space-y-3">
        <ReservationTimeline detail={detail} />
        <p className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {detail.startedAt && (
            <span>
              {t("admin.handover")} {stamp(detail.startedAt)}
            </span>
          )}
          {detail.completedAt && (
            <span>
              {t("admin.actualReturn")} {stamp(detail.completedAt)}
            </span>
          )}
          <span>
            {t("admin.booked")}{" "}
            {format(detail.createdAt, "d MMM yyyy", { locale: dateLocale })}
          </span>
        </p>
        {detail.backfilledAt && (
          // The audit trace: this rental was entered in one step after it
          // was over, without inspections, and why.
          <p className="text-muted-foreground text-xs">
            <span className="text-foreground font-medium">
              {t("admin.recordedAfterFact")}
            </span>{" "}
            {t("admin.recordedAfterFactBy", {
              date: stamp(detail.backfilledAt),
              name: detail.backfilledBy?.name ?? "—",
            })}
            {detail.backfillNote && (
              <span className="block">{detail.backfillNote}</span>
            )}
          </p>
        )}
        {/* The sheet the customer signs at the counter: before the handover
            (blank condition lines to fill in), or after it, filled from the
            inspection. A new tab, so the drawer stays as it was. */}
        {status !== "PENDING" && status !== "CANCELLED" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a
              href={`/admin/print/handover/${detail.id}`}
              target="_blank"
              rel="noopener"
              className={PRINT_LINK}
            >
              <Printer className="size-3.5" aria-hidden />
              {t("handover.printPickup")}
            </a>
            {status === "COMPLETED" && (
              <a
                href={`/admin/print/handover/${detail.id}?type=return`}
                target="_blank"
                rel="noopener"
                className={PRINT_LINK}
              >
                <Printer className="size-3.5" aria-hidden />
                {t("handover.printReturn")}
              </a>
            )}
          </div>
        )}
        {/* Opened from the action bar; or, when it cannot be extended, the
            reason why. */}
        {inFlight && (
          <div ref={extendRef} className="scroll-mt-4 scroll-mb-4">
            <ExtendReservation
              reservationId={detail.id}
              returnDate={detail.returnDate}
              pricePerDay={vehicle.pricePerDay}
              extension={detail.extension}
              expired={expired}
              onExtended={onChanged}
              hideTrigger
              open={extending}
              onOpenChange={setExtending}
            />
          </div>
        )}
      </section>

      <Tabs.Root defaultValue="details">
        <Tabs.List activateOnFocus className="relative flex gap-6 border-b">
          <Tabs.Tab value="details" className={TAB}>
            {t("admin.tabDetails")}
          </Tabs.Tab>
          <Tabs.Tab value="record" className={TAB}>
            {t("admin.tabRecord")}
          </Tabs.Tab>
          <Tabs.Indicator className="bg-foreground absolute bottom-0 left-(--active-tab-left) h-0.5 w-(--active-tab-width) transition-[left,width] duration-[var(--motion-hover)] ease-[var(--ease-standard)] motion-reduce:transition-none" />
        </Tabs.List>

        <Tabs.Panel value="details" className="space-y-8 pt-7 outline-none">
          <section>
            <SectionTitle icon={Receipt}>{t("admin.billing")}</SectionTitle>
            <dl className="space-y-2.5 text-sm">
              <Line label={t("admin.agreedRate")}>
                <span title={t("admin.agreedRateHelp")}>
                  {eur(detail.dailyRate ?? vehicle.pricePerDay)}
                </span>
              </Line>
              <Line label={t("admin.bookedAmount")}>{eur(bookedAmount)}</Line>
              {late && (
                // Back after the booked return day, and how staff settled it.
                <Line
                  label={t(
                    late.days === 1
                      ? "admin.returnedLate"
                      : "admin.returnedLatePlural",
                    { count: late.days }
                  )}
                >
                  {late.resolution === "CHARGED"
                    ? t("admin.lateCharged", { amount: eur(late.charge) })
                    : t("admin.lateWaived")}
                  {late.waiverReason && (
                    <span className="text-muted-foreground block text-xs font-normal break-words">
                      {late.waiverReason}
                    </span>
                  )}
                </Line>
              )}
              {early && (
                // Back before it, and how it was billed. The original stays
                // above, as the booked amount.
                <Line label={t("admin.returnedEarly")}>
                  {t(
                    early.billing === "ACTUAL_DAYS"
                      ? "admin.earlyBilledActual"
                      : "admin.earlyBilledFull",
                    { count: early.usedDays, booked: bookedDays }
                  )}
                </Line>
              )}
            </dl>
            {/* The figure the drawer is opened for, so the loudest on it. */}
            <div className="mt-5 flex items-end justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm">
                  {status === "COMPLETED"
                    ? t("admin.totalCharged")
                    : t("admin.total")}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t("admin.payment")}:{" "}
                  {status === "COMPLETED"
                    ? t("admin.settledReturn")
                    : t("admin.duePickup")}
                </p>
              </div>
              <p className="font-display text-foreground text-3xl leading-none font-bold tracking-tight tabular-nums">
                {eur(detail.totalPrice)}
              </p>
            </div>
            {detail.notes && (
              <p className="text-muted-foreground mt-5 text-sm whitespace-pre-line">
                {detail.notes}
              </p>
            )}
          </section>

          <section>
            <SectionTitle icon={Mail}>{t("admin.customer")}</SectionTitle>
            <dl className="space-y-2.5 text-sm">
              <Line label={t("admin.name")}>
                <button
                  type="button"
                  onClick={() => openCustomer(customer.id)}
                  className="focus-visible:ring-ring/50 cursor-pointer rounded-none text-right underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:outline-none"
                >
                  {customerName}
                </button>
              </Line>
              <Line label={t("admin.email")}>
                <a
                  href={`mailto:${customer.email}`}
                  className="block truncate underline-offset-4 hover:underline"
                >
                  {customer.email}
                </a>
              </Line>
              <Line label={t("admin.phone")}>
                <a
                  href={`tel:${customer.phone.replace(/\s+/g, "")}`}
                  className="underline-offset-4 hover:underline"
                >
                  {customer.phone}
                </a>
              </Line>
              <Line label={t("admin.lifetimeSpend")}>
                <span className="font-semibold">{eur(customer.spend)}</span>
              </Line>
            </dl>
            {detail.contactDifference && (
              <div className="mt-4">
                <ContactDifferenceNotice
                  difference={detail.contactDifference}
                  customerId={customer.id}
                  customerNotes={customer.notes}
                  // The record shown just above changes, so reload in place.
                  onApplied={onChanged}
                />
              </div>
            )}
            {customer.notes && (
              <p className="text-muted-foreground mt-4 text-sm whitespace-pre-line">
                {customer.notes === "Repeat customer, prefers automatic."
                  ? t("admin.demoRepeatCustomer")
                  : customer.notes}
              </p>
            )}
          </section>
        </Tabs.Panel>

        <Tabs.Panel value="record" className="space-y-8 pt-7 outline-none">
          <section>
            <SectionTitle icon={ClipboardCheck}>
              {t("admin.inspections", { count: detail.inspections.length })}
            </SectionTitle>
            {detail.inspections.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <div className="space-y-7">
                {detail.inspections.map((inspection) => (
                  <article key={inspection.id}>
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
                      <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                        {t("admin.fuelPercent", {
                          mileage: formatNumber(inspection.mileage, locale),
                          fuel: inspection.fuelLevel,
                        })}
                      </span>
                    </div>

                    {(inspection.exteriorNotes ||
                      inspection.interiorNotes ||
                      inspection.damageNotes) && (
                      <dl className="mt-3 space-y-1 text-sm">
                        {inspection.exteriorNotes && (
                          <div>
                            <dt className="text-muted-foreground inline">
                              {t("admin.exterior")}:{" "}
                            </dt>
                            <dd className="inline">
                              {inspection.exteriorNotes}
                            </dd>
                          </div>
                        )}
                        {inspection.interiorNotes && (
                          <div>
                            <dt className="text-muted-foreground inline">
                              {t("admin.interior")}:{" "}
                            </dt>
                            <dd className="inline">
                              {inspection.interiorNotes}
                            </dd>
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

                    <p className="text-muted-foreground mt-2 text-xs">
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
            )}
          </section>

          <AuditHistory items={detail.history} />

          <section>
            <SectionTitle icon={HistoryIcon}>
              {t("admin.reservationHistory", { count: history.length })}
            </SectionTitle>
            <ul className="space-y-3">
              {history.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    r.id === detail.id && "text-muted-foreground"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {vehicleLabel(r.vehicle)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {format(r.pickupDate, "d MMM", { locale: dateLocale })} –{" "}
                      {format(r.returnDate, "d MMM yyyy", {
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
        </Tabs.Panel>
      </Tabs.Root>

      {hasBar && (
        <DrawerFooter>
          {handoverFrom && (
            <p className="text-muted-foreground mb-2 text-xs">
              {t("admin.handoverFrom", {
                date: formatDay(handoverFrom, dateLocale),
              })}
            </p>
          )}
          <div className="flex items-start gap-2">
            {hasMenu && (
              <Menu.Root>
                <Menu.Trigger
                  aria-label={t("admin.moreActionsFor", { name: customerName })}
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="hit-area text-muted-foreground hover:text-foreground size-8"
                    />
                  }
                >
                  <MoreHorizontal />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    side="top"
                    align="start"
                    sideOffset={6}
                    className="isolate z-50 outline-none"
                  >
                    <Menu.Popup className="glass-l4 text-popover-foreground min-w-48 origin-(--transform-origin) rounded-none border py-1 shadow-md outline-hidden transition-[opacity,scale] duration-[var(--motion-hover)] ease-[var(--ease-standard)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                      {startInMenu && (
                        <Menu.Item
                          className={MENU_ITEM}
                          onClick={() => setStarting(true)}
                        >
                          <ClipboardCheck />
                          {t("admin.startRental")}
                        </Menu.Item>
                      )}
                      {startInMenu && cancelAside && (
                        <Menu.Separator className="bg-border my-1 h-px" />
                      )}
                      {cancelAside && (
                        <Menu.Item
                          className={`${MENU_ITEM} text-destructive`}
                          onClick={() => setCancelling(true)}
                        >
                          <XCircle />
                          {t("admin.cancelReservationConfirm")}
                        </Menu.Item>
                      )}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}

            {/* Secondary then primary, so the next step is on the right —
                and, on a phone, they share the bar's width, the next step
                wrapping to a full row of its own when its label is long. */}
            <div className="ml-auto flex min-w-0 flex-1 flex-wrap items-start justify-end gap-2 sm:flex-none [&>*]:flex-auto sm:[&>*]:flex-none [&>*_button]:w-full">
              {canExtend && (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={extending}
                    onClick={startExtending}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t("admin.extendRental")}
                  </Button>
                </div>
              )}
              {cancelAsButton && (
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={t("admin.cancelReservationFor", {
                      name: customerName,
                    })}
                    onClick={() => setCancelling(true)}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              )}

              {/* The dialog-only parts render nothing in the bar itself. */}
              {startInMenu && (
                <InspectionAction
                  reservationId={detail.id}
                  status={status}
                  timing={timing}
                  signerName={customerName}
                  {...billing}
                  onSuccess={onChanged}
                  hideTrigger
                  open={starting}
                  onOpenChange={setStarting}
                />
              )}

              {canCancel && (
                // Only a request's buttons (Confirm, or an expired one's
                // Cancel) show here; a booking's Cancel is in the menu.
                <div
                  className={
                    status === "PENDING" ? "[&_div]:w-full" : "contents"
                  }
                >
                  <StatusActions
                    reservationId={detail.id}
                    status={status}
                    expired={expired}
                    onSuccess={onDone}
                    hideCancel={cancelAside}
                    cancelOpen={cancelAside ? cancelling : undefined}
                    onCancelOpenChange={cancelAside ? setCancelling : undefined}
                  />
                </div>
              )}
              {status === "CONFIRMED" && recordPast && (
                <div>
                  <RecordPastRental
                    reservationId={detail.id}
                    timing={timing}
                    customerName={customerName}
                    {...billing}
                    onSuccess={onChanged}
                  />
                </div>
              )}
              {inFlight && !(status === "CONFIRMED" && recordPast) && (
                <div>
                  <InspectionAction
                    reservationId={detail.id}
                    status={status}
                    timing={timing}
                    signerName={customerName}
                    {...billing}
                    onSuccess={onChanged}
                  />
                </div>
              )}
            </div>
          </div>
        </DrawerFooter>
      )}
    </div>
  );
}

/** One label–value line: the label quiet, the value crisp. */
function Line({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground min-w-0 text-right font-medium tabular-nums">
        {children}
      </dd>
    </div>
  );
}
