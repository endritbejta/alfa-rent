"use client";

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import type { ReservationStatus } from "@prisma/client";
import { ClipboardCheck, MoreHorizontal, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReservationTiming } from "@/lib/reservation-lifecycle";
import { useI18n } from "@/components/shared/locale-provider";
import { InspectionAction } from "./inspection-action";
import { RecordPastRental } from "./record-past-rental";
import { StatusActions } from "./status-actions";

const ITEM =
  "flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm outline-none select-none data-highlighted:bg-surface-hover [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";

/**
 * What a reservation row offers, split into the one next step and the rest.
 *
 * Primary — always a visible button, because it is what staff came to the
 * row to do:
 *   PENDING           Confirm (an expired request: Cancel, its only action)
 *   CONFIRMED         Start rental; disabled until the pickup day, so the
 *                     next step is always in the same place. Once the whole
 *                     booked period has passed: Record completed rental.
 *   ACTIVE            Complete rental ("Përfundo qiranë")
 *   COMPLETED,
 *   CANCELLED         nothing — the status says it all.
 *
 * Secondary — Cancel for a request or booking, and Start for a past booking
 * whose car may still be out. One secondary action is shown as it is, a
 * quiet button beside the primary: a menu holding a single item only hides
 * it behind an extra click. Two or more go behind "⋯". An action is in one
 * place or the other, never both.
 *
 * The secondary slot has one width whether it holds a button, "⋯" or
 * nothing, so every primary button in the column ends on the same edge. Each action keeps its own dialog, rendered
 * here with its trigger hidden, so the menu popup can close without
 * unmounting the dialog it opened. Availability ("from the pickup date") is
 * the drawer's to explain, not a sentence beside every row.
 */
export function RowActions({
  reservationId,
  status,
  timing,
  customerName,
  pricePerDay,
  totalPrice,
  dailyRate,
  vehicleName,
}: {
  reservationId: string;
  status: ReservationStatus;
  timing: ReservationTiming;
  /** Shown on the menu's label and pre-filled as the inspection signer. */
  customerName: string;
  /** Plain numbers: the car's rate today and the total, for a late return. */
  pricePerDay: number;
  totalPrice: number;
  /** The booking's agreed rate, for an early return. */
  dailyRate: number | null;
  vehicleName: string;
}) {
  const { t } = useI18n();
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const expired = timing.attention === "REQUEST_EXPIRED";
  const recordPast = timing.canRecordPast;
  const canCancel = status === "PENDING" || status === "CONFIRMED";
  // With "record completed" as the main step, starting the rental is the
  // alternative for a car that really is still out.
  const startInMenu = recordPast && status === "CONFIRMED";
  // An expired request can only be cancelled. With nothing else to offer, a
  // menu holding one item would only hide it, so Cancel stays a button.
  const onlyCancel = status === "PENDING" && expired;
  // Cancel beside a primary step, rather than as the step itself.
  const cancelSecondary = canCancel && !onlyCancel;
  const hasMenu = startInMenu && cancelSecondary;
  // Nothing at all to do: no column furniture either.
  const hasActions = canCancel || status === "ACTIVE";
  if (!hasActions) return null;

  const billing = { pricePerDay, totalPrice, dailyRate, vehicleName };

  return (
    // One width for every primary button, so the column reads as a column.
    <div className="flex items-center justify-end gap-1.5 [&>*:not(:last-child)_button]:min-w-28 [&>button]:min-w-28">
      {recordPast ? (
        <RecordPastRental
          reservationId={reservationId}
          timing={timing}
          customerName={customerName}
          {...billing}
        />
      ) : (
        <InspectionAction
          reservationId={reservationId}
          status={status}
          timing={timing}
          signerName={customerName}
          {...billing}
        />
      )}
      {startInMenu && (
        <InspectionAction
          reservationId={reservationId}
          status={status}
          timing={timing}
          signerName={customerName}
          {...billing}
          hideTrigger
          open={starting}
          onOpenChange={setStarting}
        />
      )}
      <StatusActions
        reservationId={reservationId}
        status={status}
        expired={expired}
        hideCancel={cancelSecondary}
        cancelOpen={cancelSecondary ? cancelling : undefined}
        onCancelOpenChange={cancelSecondary ? setCancelling : undefined}
      />

      <div className="flex w-20 shrink-0 justify-end">
        {hasMenu ? (
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
                align="end"
                sideOffset={4}
                className="isolate z-50 outline-none"
              >
                <Menu.Popup className="glass-l4 text-popover-foreground min-w-48 origin-(--transform-origin) rounded-none border py-1 shadow-md outline-hidden transition-[opacity,scale] duration-[var(--motion-hover)] ease-[var(--ease-standard)] data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0">
                  {startInMenu && (
                    <Menu.Item
                      className={ITEM}
                      onClick={() => setStarting(true)}
                    >
                      <ClipboardCheck />
                      {t("admin.startRental")}
                    </Menu.Item>
                  )}
                  <Menu.Separator className="bg-border my-1 h-px" />
                  {
                    <Menu.Item
                      className={`${ITEM} text-destructive`}
                      onClick={() => setCancelling(true)}
                    >
                      <XCircle />
                      {t("admin.cancelReservationConfirm")}
                    </Menu.Item>
                  }
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ) : cancelSecondary ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive px-2.5"
            aria-label={t("admin.cancelReservationFor", { name: customerName })}
            onClick={() => setCancelling(true)}
          >
            {t("common.cancel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
