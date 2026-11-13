"use client";

import { useState, useTransition } from "react";
import type { ReservationStatus } from "@prisma/client";
import { updateReservationStatusAction } from "./actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import type { TranslationKey } from "@/lib/i18n/translations";

const NEXT_ACTIONS: Partial<
  Record<
    ReservationStatus,
    { label: string; to: ReservationStatus; destructive?: boolean }[]
  >
> = {
  PENDING: [
    { label: "admin.confirm", to: "CONFIRMED" },
    { label: "common.cancel", to: "CANCELLED", destructive: true },
  ],
  CONFIRMED: [{ label: "common.cancel", to: "CANCELLED", destructive: true }],
};

export function StatusActions({
  reservationId,
  status,
  expired = false,
  onSuccess,
  hideCancel = false,
  cancelOpen,
  onCancelOpenChange,
}: {
  reservationId: string;
  status: ReservationStatus;
  /**
   * A PENDING request whose pickup day has passed. It can only be cancelled:
   * the server refuses to confirm it, so the button would only lead to an
   * error.
   */
  expired?: boolean;
  /** Fired once the transition lands — drawers use it to dismiss. */
  onSuccess?: () => void;
  /**
   * Leave the Cancel button out, for a parent that offers it from its own
   * control (the row's "more actions" menu) and drives the confirmation
   * through `cancelOpen`.
   */
  hideCancel?: boolean;
  cancelOpen?: boolean;
  onCancelOpenChange?: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // CANCELLED is terminal, so it is asked about first rather than applied on
  // a single click that sits right next to Confirm.
  const [ownConfirming, setOwnConfirming] = useState(false);
  const confirmingCancel = cancelOpen ?? ownConfirming;
  const setConfirmingCancel = (next: boolean) => {
    if (cancelOpen === undefined) setOwnConfirming(next);
    onCancelOpenChange?.(next);
  };
  const available = (NEXT_ACTIONS[status] ?? []).filter(
    (action) => !(expired && action.to === "CONFIRMED")
  );
  const actions = available.filter(
    (action) => !(hideCancel && action.to === "CANCELLED")
  );

  if (available.length === 0) return null;

  const apply = (to: ReservationStatus) => {
    setError(null);
    startTransition(async () => {
      const result = await updateReservationStatusAction(reservationId, to);
      setConfirmingCancel(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toasts.success(t("toast.reservationUpdated"));
      onSuccess?.();
    });
  };

  return (
    // With every button handed to a parent's menu, the wrapper would still
    // be an (empty) flex item and add a gap; `contents` removes its box.
    <div
      className={
        actions.length > 0 ? "flex flex-col items-end gap-1" : "contents"
      }
    >
      {actions.length > 0 && (
        <div className="flex justify-end gap-2">
          {actions.map((action) => (
            <Button
              key={action.to}
              size="sm"
              variant={action.destructive ? "ghost" : "success"}
              className={
                action.destructive
                  ? "text-destructive hover:text-destructive"
                  : undefined
              }
              disabled={pending}
              onClick={() =>
                action.to === "CANCELLED"
                  ? setConfirmingCancel(true)
                  : apply(action.to)
              }
            >
              {t(action.label as TranslationKey)}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmingCancel}
        pending={pending}
        title={t("admin.cancelReservationTitle")}
        body={t("admin.cancelReservationBody")}
        confirmLabel={t("admin.cancelReservationConfirm")}
        cancelLabel={t("admin.keepReservation")}
        onCancel={() => setConfirmingCancel(false)}
        onConfirm={() => apply("CANCELLED")}
      />
    </div>
  );
}
