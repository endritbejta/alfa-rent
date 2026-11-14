"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReservationStatus } from "@prisma/client";
import { KeyRound, LoaderCircle, Printer, SquareParking } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShortcutHint } from "@/components/shared/shortcut-hint";
import { useI18n } from "@/components/shared/locale-provider";
import { toasts } from "@/components/dashboard/toaster";
import { usePrintReservation } from "@/components/dashboard/use-print-reservation";
import {
  printableDocuments,
  type HandoverDocument,
} from "@/lib/print-reservation";
import { cn } from "@/lib/utils";

const DOCUMENT = {
  PICKUP: {
    icon: KeyRound,
    title: "print.pickup",
    help: "print.pickupHelp",
  },
  RETURN: {
    icon: SquareParking,
    title: "print.return",
    help: "print.returnHelp",
  },
} as const;

/**
 * Anything modal over the drawer other than the drawer itself and this
 * chooser: the inspection form, a cancel confirmation, the command palette.
 */
const OTHER_DIALOG =
  '[role="dialog"][data-open]:not([data-drawer]):not([data-print-chooser]), [role="alertdialog"][data-open]';

/**
 * The reservation drawer's print group, the pickup-vs-return chooser and
 * Cmd/Ctrl+P — mounted once per open reservation drawer, so the shortcut's
 * one listener lives exactly as long as a reservation is on screen and goes
 * when the drawer closes or switches to a vehicle or customer.
 *
 * Every path ends in the same `print` (src/lib/print-reservation.ts), which
 * loads the sheet fresh from the server and prints only that.
 *
 * Cmd/Ctrl+P while the drawer is open:
 *   - one sheet available    prints it straight away;
 *   - two                    opens the chooser;
 *   - none (a request, a cancelled booking)
 *                            a short notice says so, rather than printing
 *                            the admin screen behind the drawer;
 *   - another dialog open over the drawer (the inspection form, a
 *     confirmation, the command palette)
 *                            left to the browser: that dialog is the task
 *                            in hand, and the reservation's sheet is not
 *                            what it is about (and not saved yet).
 * Inside a text field in the drawer itself it still prints the reservation:
 * Cmd/Ctrl+P has no editing meaning, so it takes nothing from typing.
 */
export function PrintDocuments({
  reservationId,
  status,
}: {
  reservationId: string;
  status: ReservationStatus;
}) {
  const { t } = useI18n();
  const { printing, print } = usePrintReservation();
  const [choosing, setChoosing] = useState(false);
  const documents = printableDocuments(status);

  const busy = (document: HandoverDocument) =>
    printing?.reservationId === reservationId && printing.document === document;

  const printDocument = useCallback(
    (document: HandoverDocument) => {
      setChoosing(false);
      void print(reservationId, document);
    },
    [print, reservationId]
  );

  // What the shortcut does, read fresh on every key press through a ref so
  // the one listener never needs re-registering when the status changes.
  const request = useCallback(() => {
    if (documents.length === 0) {
      toasts.notice(t("print.nothingYet"), t("print.nothingYetHelp"));
    } else if (documents.length === 1) {
      printDocument(documents[0]!);
    } else {
      setChoosing(true);
    }
  }, [documents, printDocument, t]);
  const requestRef = useRef(request);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "p" ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.defaultPrevented
      ) {
        return;
      }
      // The body stays mounted while the drawer animates shut (and for as
      // long as a background tab defers that animation): closed means the
      // browser's own Cmd/Ctrl+P again.
      if (!document.querySelector("[data-drawer][data-open]")) return;
      // Already choosing: the open chooser is the answer, not a second one
      // or the browser's dialog for the screen behind it.
      if (document.querySelector("[data-print-chooser][data-open]")) {
        event.preventDefault();
        return;
      }
      if (document.querySelector(OTHER_DIALOG)) return;
      event.preventDefault();
      // Held down, the key repeats; one print is what was asked for.
      if (event.repeat) return;
      requestRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (documents.length === 0) return null;

  return (
    <section aria-labelledby={`${reservationId}-print`} className="pt-1">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3
          id={`${reservationId}-print`}
          className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-bold tracking-[0.1em] uppercase"
        >
          <Printer className="text-brand h-3.5 w-3.5" aria-hidden />
          {t("print.heading")}
        </h3>
        <ShortcutHint keys={["mod", "P"]} className="text-muted-foreground" />
      </div>
      <div
        className={cn("grid gap-2", documents.length > 1 && "sm:grid-cols-2")}
      >
        {documents.map((document) => {
          const { icon: Icon, title } = DOCUMENT[document];
          const preparing = busy(document);
          return (
            <button
              key={document}
              type="button"
              onClick={() => printDocument(document)}
              disabled={printing !== null}
              aria-busy={preparing || undefined}
              aria-keyshortcuts={
                documents.length === 1 ? "Meta+P Control+P" : undefined
              }
              className="group bg-muted/60 hover:bg-surface-hover focus-visible:ring-ring/50 flex min-h-12 cursor-pointer items-center gap-3 rounded-none px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-70"
            >
              <span
                aria-hidden
                className="bg-background text-foreground flex size-8 shrink-0 items-center justify-center rounded-none"
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {t(title)}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {preparing ? t("print.preparing") : t("print.printSheet")}
                </span>
              </span>
              {preparing ? (
                <LoaderCircle
                  aria-hidden
                  className="text-muted-foreground h-4 w-4 shrink-0 animate-spin"
                />
              ) : (
                <Printer
                  aria-hidden
                  className="text-muted-foreground group-hover:text-foreground h-4 w-4 shrink-0 transition-colors"
                />
              )}
            </button>
          );
        })}
      </div>

      <PrintChooser
        open={choosing}
        onOpenChange={setChoosing}
        documents={documents}
        onChoose={printDocument}
      />
    </section>
  );
}

/**
 * "What would you like to print?" — the two sheets as two whole-row
 * buttons, each saying what the paper is for. One click (or Enter) prints;
 * there is no confirm step after it. Arrow keys move between them as well
 * as Tab; Esc closes.
 */
function PrintChooser({
  open,
  onOpenChange,
  documents,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documents: HandoverDocument[];
  onChoose: (document: HandoverDocument) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const options = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []
    );
    const at = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (at + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
            options.length;
    event.preventDefault();
    options[next]?.focus();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-print-chooser className="gap-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("print.chooseTitle")}</DialogTitle>
          <DialogDescription>{t("print.chooseHelp")}</DialogDescription>
        </DialogHeader>
        <div
          ref={listRef}
          role="group"
          aria-label={t("print.chooseTitle")}
          className="-mx-1 grid gap-1"
        >
          {documents.map((document) => {
            const { icon: Icon, title, help } = DOCUMENT[document];
            return (
              <button
                key={document}
                type="button"
                onClick={() => onChoose(document)}
                onKeyDown={onKeyDown}
                className="hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:ring-ring/50 flex cursor-pointer items-center gap-3.5 rounded-none px-3 py-3 text-left transition-colors outline-none focus-visible:ring-2"
              >
                <span
                  aria-hidden
                  className="bg-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-none"
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {t(title)}
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {t(help)}
                  </span>
                </span>
                <Printer
                  aria-hidden
                  className="text-muted-foreground h-4 w-4 shrink-0"
                />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
