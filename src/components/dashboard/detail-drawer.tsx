"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const EXIT_MS = 200;

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
            ? "animate-[overlay-out_200ms_ease-in_forwards]"
            : "animate-[overlay-in_200ms_ease-out]"
        )}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-drawer
        className={cn(
          "bg-card absolute right-0 bottom-0 flex max-h-[92vh] w-full flex-col rounded-t-2xl border shadow-2xl",
          "sm:top-0 sm:bottom-0 sm:max-h-none sm:w-[26rem] sm:rounded-none sm:rounded-l-2xl",
          closing
            ? "animate-[drawer-out-bottom_200ms_cubic-bezier(0.4,0,1,1)_forwards] sm:animate-[drawer-out-right_200ms_cubic-bezier(0.4,0,1,1)_forwards]"
            : "animate-[drawer-in-bottom_220ms_cubic-bezier(0.2,0,0,1)] sm:animate-[drawer-in-right_220ms_cubic-bezier(0.2,0,0,1)]"
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
