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
 * A reservation row's actions: the one next step as a button, everything
 * else behind a "more actions" menu.
 *
 * Three side-by-side buttons (record completed, start, cancel) wrapped onto
 * two lines in the table and read as a pile rather than a choice. One
 * primary button keeps the row scannable, and Cancel — terminal, and asked
 * about first anyway — no longer sits a few pixels from the main action.
 *
 * The menu only opens dialogs; each action keeps its own dialog, rendered
 * here with its trigger hidden, so the menu popup can close without
 * unmounting the dialog it opened.
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
  const cancelInMenu = canCancel && !onlyCancel;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {recordPast ? (
        <RecordPastRental
          reservationId={reservationId}
          timing={timing}
          customerName={customerName}
          vehicleName={vehicleName}
          pricePerDay={pricePerDay}
          totalPrice={totalPrice}
          dailyRate={dailyRate}
        />
      ) : (
        <InspectionAction
          reservationId={reservationId}
          status={status}
          timing={timing}
          signerName={customerName}
          vehicleName={vehicleName}
          pricePerDay={pricePerDay}
          totalPrice={totalPrice}
          dailyRate={dailyRate}
        />
      )}
      {startInMenu && (
        <InspectionAction
          reservationId={reservationId}
          status={status}
          timing={timing}
          signerName={customerName}
          vehicleName={vehicleName}
          pricePerDay={pricePerDay}
          totalPrice={totalPrice}
          dailyRate={dailyRate}
          hideTrigger
          open={starting}
          onOpenChange={setStarting}
        />
      )}
      <StatusActions
        reservationId={reservationId}
        status={status}
        expired={expired}
        hideCancel={cancelInMenu}
        cancelOpen={cancelInMenu ? cancelling : undefined}
        onCancelOpenChange={cancelInMenu ? setCancelling : undefined}
      />

      {(startInMenu || cancelInMenu) && (
        <Menu.Root>
          <Menu.Trigger
            aria-label={t("admin.moreActionsFor", { name: customerName })}
            render={
              <Button variant="outline" size="icon-sm" className="hit-area" />
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
                  <Menu.Item className={ITEM} onClick={() => setStarting(true)}>
                    <ClipboardCheck />
                    {t("admin.startRental")}
                  </Menu.Item>
                )}
                {startInMenu && cancelInMenu && (
                  <Menu.Separator className="bg-border my-1 h-px" />
                )}
                {cancelInMenu && (
                  <Menu.Item
                    className={`${ITEM} text-destructive`}
                    onClick={() => setCancelling(true)}
                  >
                    <XCircle />
                    {t("common.cancel")}
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      )}
    </div>
  );
}
