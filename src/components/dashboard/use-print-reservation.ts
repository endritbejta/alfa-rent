"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  printHandoverSheet,
  printStore,
  PrintError,
  type HandoverDocument,
  type PrintJob,
} from "@/lib/print-reservation";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";

/**
 * The client side of src/lib/print-reservation.ts: the sheet being prepared
 * right now (for a button's busy state), and `print`, which never throws —
 * a failure becomes a toast that says what happened and offers to retry.
 *
 * Printing never undoes or blocks what came before it: when a start or a
 * completion prints its sheet, the rental is already saved, and the toast
 * says so.
 */
export function usePrintReservation(): {
  printing: PrintJob | null;
  print: (
    reservationId: string,
    document: HandoverDocument,
    options?: { afterSave?: boolean }
  ) => Promise<void>;
} {
  const { t } = useI18n();
  const printing = useSyncExternalStore(
    printStore.subscribe,
    printStore.getSnapshot,
    printStore.getServerSnapshot
  );

  const print = useCallback(
    async function print(
      reservationId: string,
      document: HandoverDocument,
      options: { afterSave?: boolean } = {}
    ): Promise<void> {
      try {
        await printHandoverSheet(reservationId, document);
      } catch (error) {
        const reason = error instanceof PrintError ? error.reason : "timeout";
        const help =
          reason === "invalid"
            ? t("print.failedInvalid")
            : reason === "blocked"
              ? t("print.failedBlocked")
              : t("print.failedTimeout");
        toasts.problem(
          document === "PICKUP"
            ? t("print.failedPickup")
            : t("print.failedReturn"),
          options.afterSave ? `${t("print.savedAnyway")} ${help}` : help,
          {
            label: t("print.retry"),
            onRetry: () => void print(reservationId, document, options),
          }
        );
      }
    },
    [t]
  );

  return { printing, print };
}
