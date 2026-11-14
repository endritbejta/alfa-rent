"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/shared/locale-provider";

/**
 * Confirmation that a mutation actually happened.
 *
 * Every admin action used to succeed in silence. The one attempt at feedback
 * — a `?created=1` on the redirect after saving a vehicle — was never read by
 * anything, so nothing in the admin ever said a word about a save. That is
 * how a bug where clearing an optional field silently did nothing survived:
 * the form redirected exactly as it does on success.
 *
 * Base UI's toast rather than a hand-rolled one: it gives the polite/urgent
 * live-region announcement, F6 to jump into the viewport, focus management
 * and the dismiss timers, none of which is worth reimplementing.
 *
 * Mounted in AdminShell, not the root layout — this is staff feedback, and
 * the public bundle should not carry it.
 */
const manager = Toast.createToastManager();

/** Anything outside the React tree can queue one; client components only. */
export const toasts = {
  success(title: string, description?: string) {
    manager.add({ title, description, type: "success" });
  },
  /** A piece of information, not a confirmation and not a failure. */
  notice(title: string, description?: string) {
    manager.add({ title, description, type: "notice" });
  },
  /**
   * Announced urgently and left on screen until dismissed. With `retry`, it
   * also offers to try again — for a failure that did no harm and costs one
   * click to repeat, such as a print that did not open.
   */
  problem(
    title: string,
    description?: string,
    retry?: { label: string; onRetry: () => void }
  ) {
    const id = manager.add({
      title,
      description,
      type: "problem",
      priority: "high",
      timeout: 0,
      ...(retry && {
        actionProps: {
          children: retry.label,
          onClick() {
            manager.close(id);
            retry.onRetry();
          },
        },
      }),
    });
  },
  /**
   * A change that is still only on this screen, with a way to take it back.
   *
   * Only for edits nothing has been told about yet — a photo dropped from a
   * gallery that has not been saved, say. A write the server has already
   * made is not undoable here: offering Undo for it would be a promise this
   * toast cannot keep, which is why deleting a vehicle and cancelling a
   * reservation ask first instead.
   *
   * `onExpire` runs if the chance passes without an undo, however the toast
   * goes. The returned function withdraws the offer early, for when the
   * thing it would restore no longer exists.
   */
  undoable(
    title: string,
    {
      undoLabel,
      onUndo,
      onExpire,
    }: { undoLabel: string; onUndo: () => void; onExpire?: () => void }
  ): () => void {
    let undone = false;
    const id = manager.add({
      title,
      type: "success",
      // Long enough to notice and reach for, short enough not to linger.
      timeout: 6000,
      actionProps: {
        children: undoLabel,
        onClick() {
          undone = true;
          manager.close(id);
          onUndo();
        },
      },
      onClose() {
        if (!undone) onExpire?.();
      },
    });
    return () => manager.close(id);
  },
};

export function Toaster({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <Toast.Provider toastManager={manager} limit={3}>
      {children}
      <Toast.Portal>
        {/* Base UI labels this landmark "Notifications" in English; F6 jumps
            to it, so the label is read out and belongs in the operator's
            language like everything else. */}
        {/* Inset by the safe area as well, so a toast never lands under the
            home indicator or a landscape notch. */}
        <Toast.Viewport
          aria-label={t("toast.region")}
          className="fixed right-[max(0.75rem,env(safe-area-inset-right))] bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-60 flex w-[calc(100vw-1.5rem)] flex-col gap-2 sm:right-[max(1.5rem,env(safe-area-inset-right))] sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:w-[22rem]"
        >
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { t } = useI18n();
  const { toasts: queue } = Toast.useToastManager();

  return queue.map((toast) => {
    const problem = toast.type === "problem";
    const notice = toast.type === "notice";
    const Icon = problem ? CircleAlert : notice ? Info : Check;
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        data-toast
        className={cn(
          "glass-l5 relative flex w-full items-start gap-3 rounded-none border p-3 shadow-lg",
          // Entry and exit reuse the app's motion tokens; the reduced-motion
          // block in globals.css shortens them by the [data-toast] hook.
          "data-starting-style:translate-y-2 data-starting-style:opacity-0",
          "data-ending-style:translate-y-1 data-ending-style:opacity-0",
          "transition-[translate,transform,opacity] duration-[var(--motion-panel)] ease-[var(--ease-standard)]",
          "data-ending-style:duration-[var(--motion-panel-exit)] data-ending-style:ease-[var(--ease-exit)]",
          // Base UI already dismissed a toast swiped down or right, but the
          // toast sat still under the finger and then vanished. It now
          // follows the drag (direct manipulation, so no transition while
          // swiping) and carries on off-screen the way it was thrown.
          "[transform:translate(var(--toast-swipe-movement-x,0px),var(--toast-swipe-movement-y,0px))] data-swiping:duration-0 data-swiping:select-none",
          "data-ending-style:data-[swipe-direction=down]:translate-y-[150%] data-ending-style:data-[swipe-direction=right]:translate-x-[120%]"
        )}
      >
        <Toast.Content className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-none",
              problem
                ? "bg-destructive text-white"
                : notice
                  ? "bg-foreground text-background"
                  : "bg-success text-success-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-sm font-semibold" />
            <Toast.Description className="text-muted-foreground mt-0.5 text-xs" />
          </div>
          {/* Renders only for a toast that offers one (undoable, or a
              problem with a retry). */}
          <Toast.Action className="hit-area text-foreground hover:bg-surface-hover relative -my-1 shrink-0 cursor-pointer rounded-none border px-2.5 py-1 text-xs font-semibold transition-colors" />
        </Toast.Content>
        <Toast.Close
          aria-label={t("common.close")}
          className="text-muted-foreground hover:text-foreground hit-area relative -m-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-none transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}
