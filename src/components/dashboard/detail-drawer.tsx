"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { cn } from "@/lib/utils";

/** Must match --motion-panel-exit in globals.css — the unmount is timed to it. */
const EXIT_MS = 192;

/**
 * Right-side drawer used by every summary widget: clicking an item opens
 * detail here instead of navigating away, so staff keep their place.
 *
 * Motion is one axis per breakpoint — a bottom sheet on mobile, a panel
 * anchored to the right edge on desktop — and the element stays mounted
 * for the exit so closing reverses the same movement.
 */
export function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Tab stays inside; closing hands focus back to the row that opened it.
  useFocusTrap(panelRef, open);

  // Keep the panel mounted through its exit so closing reverses the entry
  // rather than vanishing. State changes are deferred out of the effect body.
  useEffect(() => {
    if (open) {
      const show = setTimeout(() => {
        setMounted(true);
        setClosing(false);
      }, 0);
      return () => clearTimeout(show);
    }
    if (!mounted) return;
    const start = setTimeout(() => setClosing(true), 0);
    const done = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, EXIT_MS);
    return () => {
      clearTimeout(start);
      clearTimeout(done);
    };
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        data-drawer-overlay
        className={cn(
          "absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]",
          closing
            ? "animate-[overlay-out_var(--motion-panel-exit)_var(--ease-exit)_forwards]"
            : "animate-[overlay-in_var(--motion-panel)_var(--ease-standard)]"
        )}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-drawer
        // L5 glass: the drawer floats over work you'll return to, and the
        // blur is what says that work is still there. 32rem, not 26 — a
        // workspace needs room (design doc C+, §3).
        className={cn(
          "glass-l5 absolute right-0 bottom-0 flex max-h-[92vh] w-full flex-col rounded-t-2xl shadow-lg outline-none",
          "sm:top-0 sm:bottom-0 sm:max-h-none sm:w-[32rem] sm:rounded-none sm:rounded-l-2xl",
          closing
            ? "animate-[drawer-out-bottom_var(--motion-panel-exit)_var(--ease-exit)_forwards] sm:animate-[drawer-out-right_var(--motion-panel-exit)_var(--ease-exit)_forwards]"
            : "animate-[drawer-in-bottom_var(--motion-panel)_var(--ease-standard)] sm:animate-[drawer-in-right_var(--motion-panel)_var(--ease-standard)]"
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div className="min-w-0">
            <h2 className="font-display truncate text-lg font-bold">{title}</h2>
            {subtitle && (
              <p className="text-muted-foreground truncate text-xs">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}
