"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, X } from "lucide-react";
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
  /** Announced urgently and left on screen until dismissed. */
  problem(title: string, description?: string) {
    manager.add({
      title,
      description,
      type: "problem",
      priority: "high",
      timeout: 0,
    });
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
        <Toast.Viewport
          aria-label={t("toast.region")}
          className="fixed right-3 bottom-3 z-60 flex w-[calc(100vw-1.5rem)] flex-col gap-2 sm:right-6 sm:bottom-6 sm:w-[22rem]"
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
    const Icon = problem ? CircleAlert : Check;
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        data-toast
        className={cn(
          "glass-l5 relative flex w-full items-start gap-3 rounded-xl border p-3 shadow-lg",
          // Entry and exit reuse the app's motion tokens; the reduced-motion
          // block in globals.css shortens them by the [data-toast] hook.
          "data-starting-style:translate-y-2 data-starting-style:opacity-0",
          "data-ending-style:translate-y-1 data-ending-style:opacity-0",
          "transition-[translate,opacity] duration-[var(--motion-panel)] ease-[var(--ease-standard)]",
          "data-ending-style:duration-[var(--motion-panel-exit)] data-ending-style:ease-[var(--ease-exit)]"
        )}
      >
        <Toast.Content className="flex min-w-0 flex-1 items-start gap-3">
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
              problem
                ? "bg-destructive text-white"
                : "bg-success text-success-foreground"
            )}
          >
            <Icon className="h-3 w-3" />
          </span>
          <div className="min-w-0 flex-1">
            <Toast.Title className="text-sm font-semibold" />
            <Toast.Description className="text-muted-foreground mt-0.5 text-xs" />
          </div>
        </Toast.Content>
        <Toast.Close
          aria-label={t("common.close")}
          className="text-muted-foreground hover:text-foreground -m-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </Toast.Close>
      </Toast.Root>
    );
  });
}
