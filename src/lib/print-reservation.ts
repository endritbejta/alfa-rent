import type { ReservationStatus } from "@prisma/client";

/**
 * Printing a reservation's handover sheets — the one implementation behind
 * every way of printing one: starting a rental, completing it, the drawer's
 * print group and Cmd/Ctrl+P.
 *
 * The sheets are server-rendered pages (/admin/print/handover/[id]), not
 * generated PDFs. Printing one loads that page, fresh, into a hidden
 * same-origin <iframe> and calls print() on the frame:
 *
 * - Always the latest persisted data. The page is rendered per request from
 *   the database, so whatever was just committed — the inspection a start
 *   or completion recorded a moment ago — is on it. Nothing is cached on
 *   the client, so a fresh session prints exactly like a long-running one.
 * - No popup window, so no popup blocker. A window opened after an awaited
 *   server action has lost the click's user activation and is blocked; a
 *   frame is never a popup. (The CSP lets /admin frame /admin/print/* from
 *   its own origin only — see src/lib/csp.ts.)
 * - Only the sheet prints. print() on the frame prints the frame's document,
 *   never the admin around it.
 *
 * The frame's `load` waits for the sheet's plain <img> photos; fonts and any
 * image still decoding are awaited too, and the sheet's `data-print-sheet`
 * marker is checked, so print() is never called on a half-loaded sheet, a
 * sign-in redirect or an error page. One print at a time: a second request
 * while one is preparing gets the first one's promise, not a second dialog.
 */

export type HandoverDocument = "PICKUP" | "RETURN";

/**
 * Which sheets a reservation can print, in the order they happen.
 *
 * - Pickup, from confirmation on: before the handover it prints with blank
 *   condition lines to fill in at the counter; after it, filled from the
 *   pickup inspection.
 * - Return, once the rental is completed (by a return inspection, or
 *   recorded after the fact, when it prints with lines to fill in).
 * - Nothing for a request still pending or a cancelled booking.
 */
export function printableDocuments(
  status: ReservationStatus
): HandoverDocument[] {
  if (status === "CONFIRMED" || status === "ACTIVE") return ["PICKUP"];
  if (status === "COMPLETED") return ["PICKUP", "RETURN"];
  return [];
}

export function handoverSheetUrl(
  reservationId: string,
  document: HandoverDocument
): string {
  const path = `/admin/print/handover/${encodeURIComponent(reservationId)}`;
  return document === "RETURN" ? `${path}?type=return` : path;
}

/** Why a print did not happen, for the message staff see. */
export type PrintFailure =
  /** The sheet did not load in time, or the network failed. */
  | "timeout"
  /** It loaded, but was not this reservation's sheet (an error, a login). */
  | "invalid"
  /** The browser refused to print it. */
  | "blocked";

export class PrintError extends Error {
  constructor(readonly reason: PrintFailure) {
    super(`Printing the handover sheet failed: ${reason}`);
    this.name = "PrintError";
  }
}

const LOAD_TIMEOUT_MS = 20_000;
/** Photos still decoding after `load` get this long, then print anyway. */
const ASSET_TIMEOUT_MS = 5_000;
/**
 * A frame whose dialog never reported closing is removed after this long,
 * or before the next print, whichever comes first. Long, because removing a
 * frame while its print dialog is still open can cancel the print.
 */
const FRAME_LIFETIME_MS = 10 * 60_000;
const FRAME_ATTRIBUTE = "data-print-frame";

/** What a page shows while a sheet is being prepared, or null. */
export type PrintJob = {
  reservationId: string;
  document: HandoverDocument;
};

let current: { job: PrintJob; promise: Promise<void> } | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: typeof current) {
  current = next;
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore: the job being prepared, or null. */
export const printStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): PrintJob | null {
    return current?.job ?? null;
  },
  getServerSnapshot(): PrintJob | null {
    return null;
  },
};

/**
 * Loads one sheet and opens the browser's print dialog for it. Resolves once
 * the dialog has been asked for; rejects with a PrintError if the sheet
 * could not be loaded or printed. While a print is being prepared, any
 * other request returns the same promise instead of opening a second one.
 */
export function printHandoverSheet(
  reservationId: string,
  document: HandoverDocument
): Promise<void> {
  if (current) return current.promise;
  const job = { reservationId, document };
  const promise = run(job).finally(() => setCurrent(null));
  setCurrent({ job, promise });
  return promise;
}

function removeFrames() {
  for (const frame of document.querySelectorAll(`iframe[${FRAME_ATTRIBUTE}]`))
    frame.remove();
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function run({ reservationId, document: type }: PrintJob) {
  // A frame left from an earlier print whose dialog never said it closed.
  removeFrames();

  const frame = document.createElement("iframe");
  frame.setAttribute(FRAME_ATTRIBUTE, "");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.title = "";
  // Out of sight and out of the layout, but rendered: a display:none frame
  // has no layout to print in some browsers.
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  let lifetime: ReturnType<typeof setTimeout> | undefined;
  const dispose = () => {
    clearTimeout(lifetime);
    frame.remove();
  };

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new PrintError("timeout")),
        LOAD_TIMEOUT_MS
      );
      frame.addEventListener(
        "load",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
      frame.src = handoverSheetUrl(reservationId, type);
      document.body.append(frame);
    });

    // A network error lands on the browser's own error page, which is
    // another origin: reading it throws or gives null.
    let sheetDocument: Document | null = null;
    try {
      sheetDocument = frame.contentDocument;
    } catch {
      sheetDocument = null;
    }
    const sheetWindow = frame.contentWindow;
    if (!sheetDocument || !sheetWindow) throw new PrintError("timeout");

    const sheet =
      sheetDocument.querySelector<HTMLElement>("[data-print-sheet]");
    if (
      !sheet ||
      sheet.dataset.printSheet !== reservationId ||
      sheet.dataset.printType !== type
    ) {
      throw new PrintError("invalid");
    }

    // `load` covers the photos already; this covers the web font and any
    // image the browser is still decoding. A broken photo prints as a gap
    // rather than holding the dialog back.
    await withTimeout(
      Promise.all([
        sheetDocument.fonts?.ready,
        ...Array.from(sheetDocument.images, (image) =>
          image.complete ? undefined : image.decode().catch(() => undefined)
        ),
      ]).then(() => undefined),
      ASSET_TIMEOUT_MS,
      undefined
    );

    // Gone once the dialog closes; Chrome's print() blocks until then,
    // Firefox and Safari report it through afterprint.
    sheetWindow.addEventListener("afterprint", () => setTimeout(dispose, 0), {
      once: true,
    });
    lifetime = setTimeout(dispose, FRAME_LIFETIME_MS);

    try {
      sheetWindow.focus();
      sheetWindow.print();
    } catch {
      throw new PrintError("blocked");
    }
  } catch (error) {
    dispose();
    throw error instanceof PrintError ? error : new PrintError("timeout");
  }
}
